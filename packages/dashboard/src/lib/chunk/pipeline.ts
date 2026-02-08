/**
 * Chunk Pipeline - Orchestrates the full chunk execution flow
 *
 * Flow: execute -> validate -> review -> commit
 *
 * This is the core orchestration layer that combines:
 * - ChunkExecutor for OpenCode execution
 * - ValidationService for file change and build validation
 * - ReviewService for Haiku review
 * - GitService for committing changes
 */

import type { ChunkToolCall } from '@specwright/shared';
import { getChunk, updateChunk } from '../db';
import { getSpec } from '../db/specs';
import { getProject } from '../db/projects';
import { getContext, saveContext } from '../db/spec-execution-context';
import { chunkExecutor, type ExecutionResult } from './executor';
import { validationService, type ValidationResult } from './validation-service';
import { reviewService, createReviewService, type ChunkReviewResult } from '../review/service';
import { gitService, type GitWorkflowState } from '../git-workflow/service';
import { WiringChecker } from '../services/goal-verifier/wiring-checker';
import { executeWithRetry, type IterationConfig, type IterationResult } from '../execution/iteration-loop';
import { loadConfig } from '../config/config-loader';
import { calculateContextMetrics } from '../execution/context-tracker';
import type { ContextMetrics } from '../execution/types';

export interface ChunkPipelineResult {
  status: 'pass' | 'fail' | 'needs_fix' | 'error' | 'cancelled' | 'blocked';
  output?: string;
  reviewFeedback?: string;
  commitHash?: string;
  fixChunkId?: string;
  error?: string;
  iterationResult?: IterationResult;
  contextMetrics?: ContextMetrics;
}

export interface ChunkPipelineEvents {
  onExecutionStart?: (chunkId: string) => void;
  onExecutionComplete?: (chunkId: string, output: string) => void;
  onToolCall?: (chunkId: string, toolCall: ChunkToolCall) => void;
  onValidationStart?: (chunkId: string) => void;
  onValidationComplete?: (chunkId: string, result: ValidationResult) => void;
  onReviewStart?: (chunkId: string) => void;
  onReviewComplete?: (chunkId: string, result: ChunkReviewResult) => void;
  onCommit?: (chunkId: string, commitHash: string) => void;
  onContextWarning?: (chunkId: string, metrics: ContextMetrics) => void;
  onError?: (chunkId: string, error: string) => void;
}

export class ChunkPipeline {
  /**
   * Execute full chunk pipeline:
   * 1. Execute chunk via OpenCode
   * 2. Validate (if gitState provided)
   * 3. Review with Haiku
   * 4. Commit (if review passes and gitState provided)
   * 5. Create fix chunk (if review returns needs_fix)
   */
  async execute(
    chunkId: string,
    gitState?: GitWorkflowState,
    events?: ChunkPipelineEvents
  ): Promise<ChunkPipelineResult> {
    const chunk = getChunk(chunkId);
    if (!chunk) {
      const error = 'Chunk not found';
      events?.onError?.(chunkId, error);
      return { status: 'error', error };
    }

    const spec = getSpec(chunk.specId);
    if (!spec) {
      const error = 'Spec not found';
      events?.onError?.(chunkId, error);
      return { status: 'error', error };
    }

    const project = getProject(spec.projectId);

    console.log(`[ChunkPipeline] Starting pipeline for chunk: ${chunk.title}`);

    // Step 0: Wiring check - validate cross-chunk dependencies
    const hasConsumes = chunk.consumes && chunk.consumes.length > 0;
    if (hasConsumes) {
      const wiringChecker = new WiringChecker(chunk.specId);

      // Load accumulated context from database
      const existingContext = getContext(chunk.specId);
      if (existingContext) {
        wiringChecker.loadContext(existingContext);
      }

      const wiringResult = wiringChecker.checkWiring(chunk);
      if (!wiringResult.canExecute) {
        const missing = wiringResult.missingImports
          .map(m => `${m.name} (required by ${m.requiredBy}${m.suggestion ? ': ' + m.suggestion : ''})`)
          .join('; ');
        const error = `Wiring check failed: missing imports: ${missing}`;
        console.log(`[ChunkPipeline] ${error}`);
        events?.onError?.(chunkId, error);
        return { status: 'blocked', error };
      }
    }

    // Step 0b: Calculate context metrics before execution
    let contextMetrics: ContextMetrics | undefined;
    try {
      const completedDeps = chunk.dependencies
        .map(depId => getChunk(depId))
        .filter((c): c is NonNullable<typeof c> => c != null && c.status === 'completed');

      const dependencyHistory = completedDeps
        .map(dep => {
          const summary = dep.outputSummary || dep.output?.slice(0, 2000) || '';
          return `### ${dep.title}\n${summary}`;
        })
        .join('\n');

      const specContent = spec.content?.slice(0, 3000) || '';

      contextMetrics = calculateContextMetrics(
        {
          systemPrompt: 'You are implementing part of a larger feature.',
          specContent,
          chunkDescription: `## ${chunk.title}\n\n${chunk.description}`,
          dependencyHistory,
        },
        {
          id: 'claude-sonnet-4-5-20250929',
          name: 'Claude Sonnet 4.5',
          provider: 'anthropic',
          capabilities: { toolCall: true, attachment: true, reasoning: true },
          limits: { context: 200000, output: 100000 },
        }
      );

      console.log(
        `[ChunkPipeline] Context: ${Math.round(contextMetrics.percentage * 100)}% (${contextMetrics.status})`
      );

      if (contextMetrics.status === 'poor') {
        events?.onContextWarning?.(chunkId, contextMetrics);
      }
    } catch (err) {
      console.warn(`[ChunkPipeline] Failed to calculate context metrics: ${err}`);
    }

    // Step 1: Execute chunk (with optional iteration loop)
    events?.onExecutionStart?.(chunkId);

    const config = await loadConfig(project?.directory);
    const maxRetries = config.defaults.maxRetries;
    const workingDirForRetry = gitState?.workingDir || project?.directory;

    let executionResult: ExecutionResult;
    let iterationResult: IterationResult | undefined;

    if (maxRetries > 0 && workingDirForRetry) {
      // Use iteration loop with reset-and-retry strategy
      const iterConfig: IterationConfig = {
        maxIterations: maxRetries + 1,
        onFailure: 'reset',
        workingDir: workingDirForRetry,
      };

      iterationResult = await executeWithRetry(
        chunkId,
        async (id, feedback) => {
          const result = await chunkExecutor.execute(id, {
            onToolCall: (toolCall) => events?.onToolCall?.(chunkId, toolCall),
          }, project?.directory);

          return {
            success: result.status === 'completed',
            output: result.output,
            error: result.error,
            feedback: feedback
              ? `Previous attempt feedback:\n${feedback}`
              : undefined,
          };
        },
        iterConfig,
      );

      const lastAttempt = iterationResult.history[iterationResult.history.length - 1];
      executionResult = {
        status: iterationResult.success ? 'completed' : 'failed',
        output: lastAttempt?.result.output,
        error: lastAttempt?.result.error,
      };

      if (iterationResult.iterations > 1) {
        console.log(
          `[ChunkPipeline] Iteration loop: ${iterationResult.iterations} attempts, ` +
          `status=${iterationResult.finalStatus}`,
        );
      }
    } else {
      // Single execution (no retries configured)
      executionResult = await chunkExecutor.execute(chunkId, {
        onToolCall: (toolCall) => events?.onToolCall?.(chunkId, toolCall),
      }, project?.directory);
    }

    if (executionResult.status === 'cancelled') {
      return { status: 'cancelled', output: executionResult.output, contextMetrics };
    }

    if (executionResult.status === 'failed') {
      events?.onError?.(chunkId, executionResult.error || 'Execution failed');
      return {
        status: 'fail',
        output: executionResult.output,
        error: executionResult.error,
        iterationResult,
        contextMetrics,
      };
    }

    events?.onExecutionComplete?.(chunkId, executionResult.output || '');

    // Step 2: Validate (if gitState provided for working directory)
    let validationResult: ValidationResult | undefined;
    const workingDir = gitState?.workingDir || project?.directory;

    if (workingDir) {
      events?.onValidationStart?.(chunkId);

      validationResult = await validationService.validate(chunkId, workingDir);

      events?.onValidationComplete?.(chunkId, validationResult);

      // Auto-fail on validation failure
      if (validationResult.autoFail) {
        console.log(`[ChunkPipeline] Validation auto-fail: ${validationResult.autoFail.reason}`);

        // Update chunk with failure info
        updateChunk(chunkId, {
          status: 'failed',
          error: validationResult.autoFail.feedback,
          reviewStatus: 'fail',
          reviewFeedback: validationResult.autoFail.feedback,
        });

        events?.onError?.(chunkId, validationResult.autoFail.feedback);

        return {
          status: 'fail',
          output: executionResult.output,
          reviewFeedback: validationResult.autoFail.feedback,
          error: validationResult.autoFail.feedback,
          contextMetrics,
        };
      }
    }

    // Step 3: Review with Haiku
    events?.onReviewStart?.(chunkId);

    // Use project-specific review service if available
    const reviewSvc = project?.id ? createReviewService(project.id) : reviewService;

    const reviewResult = await reviewSvc.reviewChunk(chunkId, validationResult);

    events?.onReviewComplete?.(chunkId, reviewResult);

    if (reviewResult.status === 'error') {
      events?.onError?.(chunkId, reviewResult.error || 'Review failed');
      return {
        status: 'error',
        output: executionResult.output,
        error: reviewResult.error,
        contextMetrics,
      };
    }

    // Step 4: Commit (if review passes and git is enabled)
    let commitHash: string | undefined;

    if (reviewResult.status === 'pass' && gitState?.enabled) {
      const commitResult = await gitService.commitChunk(
        gitState,
        chunkId,
        chunk.title,
        chunk.order
      );

      if (commitResult.success && commitResult.commitHash) {
        commitHash = commitResult.commitHash;
        events?.onCommit?.(chunkId, commitHash);

        // Update chunk with commit hash
        updateChunk(chunkId, { commitHash });
      } else {
        console.warn(`[ChunkPipeline] Commit failed: ${commitResult.error}`);
        // Don't fail the pipeline for commit failures - changes are still valid
      }
    }

    // Step 5: Handle needs_fix
    if (reviewResult.status === 'needs_fix') {
      console.log(`[ChunkPipeline] Chunk needs fix: ${reviewResult.feedback}`);

      // Git reset if changes were made but failed review
      if (gitState?.enabled) {
        gitService.resetHard(gitState);
        console.log(`[ChunkPipeline] Reset git state after needs_fix`);
      }

      return {
        status: 'needs_fix',
        output: executionResult.output,
        reviewFeedback: reviewResult.feedback,
        fixChunkId: reviewResult.fixChunkId,
        contextMetrics,
      };
    }

    // Step 6: Handle fail
    if (reviewResult.status === 'fail') {
      console.log(`[ChunkPipeline] Chunk failed review: ${reviewResult.feedback}`);

      // Git reset on failure
      if (gitState?.enabled) {
        gitService.resetHard(gitState);
        console.log(`[ChunkPipeline] Reset git state after fail`);
      }

      return {
        status: 'fail',
        output: executionResult.output,
        reviewFeedback: reviewResult.feedback,
        contextMetrics,
      };
    }

    // Step 5b: Accumulate context after successful execution
    const workingDirForWiring = gitState?.workingDir || project?.directory;
    if (workingDirForWiring) {
      try {
        const wiringChecker = new WiringChecker(chunk.specId);
        const existingContext = getContext(chunk.specId);
        if (existingContext) {
          wiringChecker.loadContext(existingContext);
        }

        const createdExports = await wiringChecker.extractCreatedExports(
          chunkId,
          workingDirForWiring
        );
        wiringChecker.recordChunkCompletion(chunk, createdExports);
        saveContext(chunk.specId, wiringChecker.getContext());
        console.log(`[ChunkPipeline] Accumulated ${createdExports.length} exports from chunk`);
      } catch (err) {
        console.warn(`[ChunkPipeline] Failed to accumulate context: ${err}`);
        // Don't fail the pipeline for context accumulation errors
      }
    }

    // Success!
    console.log(`[ChunkPipeline] Chunk completed successfully: ${chunk.title}`);

    return {
      status: 'pass',
      output: executionResult.output,
      reviewFeedback: reviewResult.feedback,
      commitHash,
      contextMetrics,
    };
  }

  /**
   * Abort a running pipeline
   */
  async abort(chunkId: string): Promise<{ success: boolean; error?: string }> {
    return chunkExecutor.abort(chunkId);
  }

  /**
   * Check if chunk is currently in pipeline
   */
  isRunning(chunkId: string): boolean {
    return chunkExecutor.isRunning(chunkId);
  }
}

export const chunkPipeline = new ChunkPipeline();
