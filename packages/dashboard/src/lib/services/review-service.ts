/**
 * Review Service - Orchestrates chunk and spec reviews with Claude
 *
 * Handles:
 * - Chunk reviews with Haiku (fast, per-chunk)
 * - Final spec reviews with Opus (comprehensive)
 * - Retry logic with exponential backoff
 * - Review logging to database
 */

import type { Chunk, Spec, ReviewStatus, ReviewResult } from '@specwright/shared';
import { CLAUDE_MODELS, type ReviewerConfig } from '@specwright/shared';
import { ClaudeClient } from '@specwright/mcp/client';
import { getChunk, updateChunk, insertFixChunk, getSpec, getChunksBySpec } from '../db';
import { getProject } from '../db/projects';
import { buildReviewPrompt, buildEnhancedReviewPrompt, parseReviewResult, type ValidationResultForPrompt } from '../prompts';
import { getDb, generateId } from '../db/connection';
import { classifyError, retryWithBackoff, type ErrorType } from '../review';

// Re-export ErrorType for consumers that import from this module
export type { ErrorType };

export interface ChunkReviewResult {
  status: 'pass' | 'fail' | 'needs_fix' | 'error';
  feedback?: string;
  fixChunk?: { title: string; description: string };
  fixChunkId?: string;
  error?: string;
  errorType?: ErrorType;
}

export interface FinalReviewResult {
  status: 'pass' | 'fail' | 'needs_fix' | 'error';
  feedback: string;
  integrationIssues?: string[];
  missingRequirements?: string[];
  fixChunks?: Array<{ title: string; description: string }>;
  error?: string;
  errorType?: ErrorType;
}

interface ReviewLogEntry {
  chunkId?: string;
  specId?: string;
  reviewType: 'chunk' | 'final';
  model: string;
  status: 'pass' | 'fail' | 'needs_fix' | 'error';
  feedback?: string;
  errorMessage?: string;
  errorType?: ErrorType;
  attemptNumber: number;
  durationMs: number;
}

/**
 * Fix chunk specification with optional target information for better traceability
 */
export interface FixSpec {
  title: string;
  description: string;
  /** ID of the chunk this fix is related to (takes precedence over targetChunkIndex) */
  parentChunkId?: string;
  /** Index of the chunk this fix is related to (0-based) */
  targetChunkIndex?: number;
}

const DEFAULT_CHUNK_TIMEOUT = 180000;  // 3 minutes
const DEFAULT_FINAL_TIMEOUT = 600000;  // 10 minutes
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_RETRY_BACKOFF_MS = 2000;

export class ReviewService {
  private config: ReviewerConfig;

  constructor(config?: Partial<ReviewerConfig>) {
    this.config = {
      type: 'sonnet-quick',
      cliPath: 'claude',
      autoApprove: false,
      chunkModel: 'haiku',
      finalModel: 'opus',
      chunkTimeout: DEFAULT_CHUNK_TIMEOUT,
      finalTimeout: DEFAULT_FINAL_TIMEOUT,
      maxRetries: DEFAULT_MAX_RETRIES,
      retryBackoffMs: DEFAULT_RETRY_BACKOFF_MS,
      finalReviewMaxFixAttempts: 2,
      ...config,
    };
  }

  /**
   * Review a single chunk with Haiku
   * - Executes review with retry logic (using retryWithBackoff)
   * - Updates chunk with results
   * - Logs to review_logs table
   */
  async reviewChunk(
    chunkId: string,
    validationResult?: ValidationResultForPrompt
  ): Promise<ChunkReviewResult> {
    const chunk = getChunk(chunkId);
    if (!chunk) {
      return { status: 'error', error: 'Chunk not found', errorType: 'unknown' };
    }

    const spec = getSpec(chunk.specId);
    if (!spec) {
      return { status: 'error', error: 'Spec not found', errorType: 'unknown' };
    }

    // Note: We don't set an intermediate 'reviewing' status here because:
    // 1. ReviewStatus type only includes 'pass' | 'needs_fix' | 'fail'
    // 2. The final status will be set after review completes
    // 3. Setting 'pass' prematurely could leave incorrect state on crash
    // The chunk's status field ('running') already indicates work is in progress.
    console.log(`[Review] Starting chunk review for ${chunk.title} with ${this.config.chunkModel}`);

    const modelKey = this.config.chunkModel || 'haiku';
    const modelId = CLAUDE_MODELS[modelKey];
    const timeout = this.config.chunkTimeout || DEFAULT_CHUNK_TIMEOUT;
    const maxRetries = this.config.maxRetries || DEFAULT_MAX_RETRIES;
    const backoffMs = this.config.retryBackoffMs || DEFAULT_RETRY_BACKOFF_MS;

    // Build prompt
    const prompt = validationResult
      ? buildEnhancedReviewPrompt(chunk, validationResult)
      : buildReviewPrompt(chunk);

    // Track attempt info for logging
    let attemptNumber = 0;
    let lastDurationMs = 0;

    // Define the review execution function
    const executeReview = async (): Promise<{ success: boolean; output: string }> => {
      attemptNumber++;
      const startTime = Date.now();
      const client = new ClaudeClient({ model: modelId });
      const result = await client.execute(prompt, { timeout });
      lastDurationMs = Date.now() - startTime;

      if (!result.success) {
        const errorType = classifyError(result.output);
        if (errorType === 'rate_limit') {
          // Throw to trigger retry via retryWithBackoff
          throw new Error(result.output);
        }
        // Return non-rate-limit error (won't be retried)
        return result;
      }

      return result;
    };

    try {
      const result = await retryWithBackoff(executeReview, {
        maxRetries,
        backoffMs,
        onRetry: (attempt) => {
          console.warn(`[Review] Rate limit for chunk ${chunkId}, retry ${attempt}/${maxRetries}`);
        },
      });

      if (!result.success) {
        // Non-rate-limit API error
        const errorType = classifyError(result.output);
        this.logReview({
          chunkId,
          reviewType: 'chunk',
          model: modelKey,
          status: 'error',
          errorMessage: result.output,
          errorType,
          attemptNumber,
          durationMs: lastDurationMs,
        });

        return {
          status: 'error',
          error: result.output,
          errorType,
        };
      }

      // Parse result
      const reviewResult = parseReviewResult(result.output);
      if (!reviewResult) {
        this.logReview({
          chunkId,
          reviewType: 'chunk',
          model: modelKey,
          status: 'error',
          errorMessage: 'Failed to parse review result',
          errorType: 'parse_error',
          attemptNumber,
          durationMs: lastDurationMs,
        });

        return {
          status: 'error',
          error: 'Failed to parse review result',
          errorType: 'parse_error',
        };
      }

      // Update chunk with result
      updateChunk(chunkId, {
        reviewStatus: reviewResult.status,
        reviewFeedback: reviewResult.feedback,
      });

      // Log successful review
      this.logReview({
        chunkId,
        reviewType: 'chunk',
        model: modelKey,
        status: reviewResult.status,
        feedback: reviewResult.feedback,
        attemptNumber,
        durationMs: lastDurationMs,
      });

      console.log(`[Review] Chunk ${chunkId} review ${reviewResult.status}`);

      // Create fix chunk if needed
      let fixChunkId: string | undefined;
      if (reviewResult.status === 'needs_fix' && reviewResult.fixChunk) {
        const fixChunk = insertFixChunk(chunkId, {
          title: reviewResult.fixChunk.title,
          description: reviewResult.fixChunk.description,
        });
        fixChunkId = fixChunk?.id;
      }

      return {
        status: reviewResult.status,
        feedback: reviewResult.feedback,
        fixChunk: reviewResult.fixChunk,
        fixChunkId,
      };
    } catch (error) {
      // Rate limit retries exhausted or other exception
      const errorType = classifyError(error);
      this.logReview({
        chunkId,
        reviewType: 'chunk',
        model: modelKey,
        status: 'error',
        errorMessage: error instanceof Error ? error.message : String(error),
        errorType,
        attemptNumber,
        durationMs: lastDurationMs,
      });

      console.error(`[Review] All retries exhausted for chunk ${chunkId}`);
      return {
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
        errorType,
      };
    }
  }

  /**
   * Final review of entire spec with Opus
   * - Reviews integration, completeness, quality (using retryWithBackoff)
   * - Can return fix chunks if issues found
   * - Updates spec.final_review_status
   * - Logs to review_logs table
   */
  async reviewSpecFinal(specId: string): Promise<FinalReviewResult> {
    const spec = getSpec(specId);
    if (!spec) {
      return { status: 'error', feedback: '', error: 'Spec not found', errorType: 'unknown' };
    }

    const chunks = getChunksBySpec(specId);
    if (chunks.length === 0) {
      return { status: 'error', feedback: '', error: 'No chunks found', errorType: 'unknown' };
    }

    console.log(`[Review] Starting final spec review for ${spec.title} with ${this.config.finalModel}`);

    const modelKey = this.config.finalModel || 'opus';
    const modelId = CLAUDE_MODELS[modelKey];
    const timeout = this.config.finalTimeout || DEFAULT_FINAL_TIMEOUT;
    const maxRetries = this.config.maxRetries || DEFAULT_MAX_RETRIES;
    const backoffMs = this.config.retryBackoffMs || DEFAULT_RETRY_BACKOFF_MS;

    const prompt = this.buildFinalReviewPrompt(spec, chunks);

    // Track attempt info for logging
    let attemptNumber = 0;
    let lastDurationMs = 0;

    // Define the review execution function
    const executeReview = async (): Promise<{ success: boolean; output: string }> => {
      attemptNumber++;
      const startTime = Date.now();
      const client = new ClaudeClient({ model: modelId });
      const result = await client.execute(prompt, { timeout });
      lastDurationMs = Date.now() - startTime;

      if (!result.success) {
        const errorType = classifyError(result.output);
        if (errorType === 'rate_limit') {
          // Throw to trigger retry via retryWithBackoff
          throw new Error(result.output);
        }
        // Return non-rate-limit error (won't be retried)
        return result;
      }

      return result;
    };

    try {
      const result = await retryWithBackoff(executeReview, {
        maxRetries,
        backoffMs,
        onRetry: (attempt) => {
          console.warn(`[Review] Rate limit for final review, retry ${attempt}/${maxRetries}`);
        },
      });

      if (!result.success) {
        // Non-rate-limit API error
        const errorType = classifyError(result.output);
        this.logReview({
          specId,
          reviewType: 'final',
          model: modelKey,
          status: 'error',
          errorMessage: result.output,
          errorType,
          attemptNumber,
          durationMs: lastDurationMs,
        });

        return {
          status: 'error',
          feedback: '',
          error: result.output,
          errorType,
        };
      }

      // Parse final review result
      const finalResult = this.parseFinalReviewResult(result.output);
      if (!finalResult) {
        this.logReview({
          specId,
          reviewType: 'final',
          model: modelKey,
          status: 'error',
          errorMessage: 'Failed to parse final review result',
          errorType: 'parse_error',
          attemptNumber,
          durationMs: lastDurationMs,
        });

        return {
          status: 'error',
          feedback: '',
          error: 'Failed to parse final review result',
          errorType: 'parse_error',
        };
      }

      // Log successful review
      this.logReview({
        specId,
        reviewType: 'final',
        model: modelKey,
        status: finalResult.status,
        feedback: finalResult.feedback,
        attemptNumber,
        durationMs: lastDurationMs,
      });

      console.log(`[Review] Final spec review ${finalResult.status}`);
      return finalResult;
    } catch (error) {
      // Rate limit retries exhausted or other exception
      const errorType = classifyError(error);
      this.logReview({
        specId,
        reviewType: 'final',
        model: modelKey,
        status: 'error',
        errorMessage: error instanceof Error ? error.message : String(error),
        errorType,
        attemptNumber,
        durationMs: lastDurationMs,
      });

      console.error(`[Review] All retries exhausted for final review`);
      return {
        status: 'error',
        feedback: '',
        error: error instanceof Error ? error.message : String(error),
        errorType,
      };
    }
  }

  /**
   * Create fix chunks based on final review feedback
   * Returns array of created chunk IDs
   *
   * @param specId - The spec to create fix chunks for
   * @param fixes - Array of fix specifications with optional target chunk info
   */
  async createFixChunks(
    specId: string,
    fixes: Array<FixSpec | { title: string; description: string }>
  ): Promise<string[]> {
    const chunks = getChunksBySpec(specId);
    if (chunks.length === 0) {
      return [];
    }

    const lastChunk = chunks[chunks.length - 1];
    const createdIds: string[] = [];

    for (const fix of fixes) {
      // Resolve parent chunk ID based on provided targeting info
      let parentId = lastChunk.id;

      if ('parentChunkId' in fix && fix.parentChunkId) {
        // Use explicit parentChunkId if provided
        const targetChunk = chunks.find(c => c.id === fix.parentChunkId);
        if (targetChunk) {
          parentId = targetChunk.id;
        } else {
          console.warn(`[Review] Parent chunk ${fix.parentChunkId} not found, using last chunk`);
        }
      } else if ('targetChunkIndex' in fix && typeof fix.targetChunkIndex === 'number') {
        // Use targetChunkIndex if provided and valid
        if (fix.targetChunkIndex >= 0 && fix.targetChunkIndex < chunks.length) {
          parentId = chunks[fix.targetChunkIndex].id;
        } else {
          console.warn(`[Review] Invalid targetChunkIndex ${fix.targetChunkIndex}, using last chunk`);
        }
      }

      const fixChunk = insertFixChunk(parentId, {
        title: fix.title,
        description: fix.description,
      });
      if (fixChunk) {
        createdIds.push(fixChunk.id);
        console.log(`[Review] Created fix chunk: ${fix.title} (parent: ${parentId})`);
      }
    }

    return createdIds;
  }

  private buildFinalReviewPrompt(spec: Spec, chunks: Chunk[]): string {
    const chunkSummaries = chunks.map((c, i) => {
      const status = c.reviewStatus || 'pending';
      return `${i + 1}. ${c.title} [${c.status}/${status}]\n   ${c.outputSummary || c.description}`;
    }).join('\n\n');

    return `You are performing a final review of a spec implementation.

## Spec
Title: ${spec.title}

Content:
${spec.content}

## Completed Chunks
${chunkSummaries}

## Your Job
Review the entire implementation for:
1. Integration - Do all chunks work together correctly?
2. Completeness - Are all requirements from the spec addressed?
3. Quality - Is the code well-structured and maintainable?

Return JSON:
{
  "status": "pass" | "needs_fix" | "fail",
  "feedback": "Overall assessment",
  "integrationIssues": ["Issue 1", "Issue 2"],
  "missingRequirements": ["Requirement 1"],
  "fixChunks": [
    {"title": "Fix title", "description": "What needs to be done"}
  ]
}

Rules:
- "pass" = Implementation is complete and correct
- "needs_fix" = Issues found but fixable
- "fail" = Fundamental problems requiring redesign
- Only include fixChunks if status is "needs_fix"
- Return ONLY valid JSON, no markdown code blocks`;
  }

  /**
   * Parse the final review result from Claude's response.
   *
   * Note: FinalReviewResult.status includes 'error' for service-level errors,
   * but parseFinalReviewResult intentionally only accepts 'pass' | 'needs_fix' | 'fail'.
   * The 'error' status is set by ReviewService itself when the Claude API call fails
   * or parsing fails - the model should never return 'error' in its JSON response.
   * This design separates model assessment outcomes from service-level failures.
   */
  private parseFinalReviewResult(text: string): FinalReviewResult | null {
    try {
      let jsonStr = text.trim();
      const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1].trim();
      }
      const parsed = JSON.parse(jsonStr);

      // Only accept model assessment outcomes, not 'error' (which is service-level)
      if (!parsed.status || !['pass', 'needs_fix', 'fail'].includes(parsed.status)) {
        return null;
      }

      return {
        status: parsed.status,
        feedback: parsed.feedback || '',
        integrationIssues: parsed.integrationIssues,
        missingRequirements: parsed.missingRequirements,
        fixChunks: parsed.fixChunks,
      };
    } catch {
      return null;
    }
  }

  private logReview(entry: ReviewLogEntry): void {
    try {
      const db = getDb();
      const stmt = db.prepare(`
        INSERT INTO review_logs (id, chunk_id, spec_id, review_type, model, status, feedback, error_message, error_type, attempt_number, duration_ms, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        generateId(),
        entry.chunkId || null,
        entry.specId || null,
        entry.reviewType,
        entry.model,
        entry.status,
        entry.feedback || null,
        entry.errorMessage || null,
        entry.errorType || null,
        entry.attemptNumber,
        entry.durationMs,
        new Date().toISOString()
      );
    } catch (error) {
      console.error('[Review] Failed to log review:', error);
    }
  }
}

// Factory function to create service with project config
export function createReviewService(projectId?: string): ReviewService {
  if (projectId) {
    const project = getProject(projectId);
    if (project?.config?.reviewer) {
      return new ReviewService(project.config.reviewer);
    }
  }
  return new ReviewService();
}

export const reviewService = new ReviewService();
