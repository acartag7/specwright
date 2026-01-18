/**
 * Spec Execution Service - Orchestrates running all chunks in a spec
 *
 * Flow:
 * 1. Initialize git workflow (worktree or branch)
 * 2. Run chunks respecting dependencies via ChunkPipeline
 * 3. Handle fix chunks from review
 * 4. Final spec review after all chunks pass
 * 5. Push and create PR on success
 *
 * This service encapsulates the orchestration logic from run-all/route.ts
 * making it testable and reusable.
 */

import type { Chunk, Spec, ChunkToolCall } from '@specwright/shared';
import { getSpec, updateSpec, getChunksBySpec, updateChunk, getChunk } from '../db';
import { getProject } from '../db/projects';
import { chunkPipeline, type ChunkPipelineEvents, type ChunkPipelineResult } from './chunk-pipeline';
import { gitService, type GitWorkflowState } from './git-service';
import { reviewService, createReviewService, type FinalReviewResult, type FixSpec } from './review-service';
import type { ValidationResult } from './validation-service';
import type { ChunkReviewResult } from '../review';

// Track active run-all sessions
const activeSpecs = new Map<string, { aborted: boolean }>();

export interface SpecExecutionEvents extends Omit<ChunkPipelineEvents, 'onExecutionStart' | 'onExecutionComplete'> {
  // Spec-level events
  onSpecStart?: (specId: string, totalChunks: number) => void;
  onSpecComplete?: (specId: string, stats: SpecExecutionStats) => void;
  onSpecAborted?: (specId: string, reason: string) => void;

  // Chunk orchestration events
  onChunkStart?: (chunkId: string, title: string, index: number, total: number) => void;
  onChunkComplete?: (chunkId: string, result: ChunkPipelineResult) => void;
  onChunkSkipped?: (chunkId: string, reason: string) => void;

  // Dependency events
  onDependencyBlocked?: (
    chunkId: string,
    chunkTitle: string,
    blockedBy: string,
    blockedByTitle: string,
    reason: string
  ) => void;

  // Git events
  onGitWorkflowInit?: (state: GitWorkflowState) => void;
  onGitReset?: (chunkId: string, reason: string) => void;
  onGitCommit?: (chunkId: string, commitHash: string, filesChanged?: number) => void;
  onGitPush?: (branch: string) => void;
  onPRCreated?: (url: string, number?: number) => void;

  // Final review events
  onFinalReviewStart?: (specId: string) => void;
  onFinalReviewComplete?: (specId: string, result: FinalReviewResult) => void;
  onFinalReviewFixChunks?: (specId: string, fixChunkIds: string[]) => void;
}

export interface SpecExecutionStats {
  totalChunks: number;
  passedChunks: number;
  failedChunks: number;
  skippedChunks: number;
  fixChunksCreated: number;
  prUrl?: string;
  prNumber?: number;
  durationMs: number;
}

export class SpecExecutionService {
  /**
   * Run all pending chunks in a spec
   * Handles dependencies, reviews, and git operations
   */
  async runAll(specId: string, events?: SpecExecutionEvents): Promise<void> {
    const startTime = Date.now();

    // Validate spec exists
    const spec = getSpec(specId);
    if (!spec) {
      events?.onError?.(specId, 'Spec not found');
      return;
    }

    // Check if already running
    if (activeSpecs.has(specId)) {
      events?.onError?.(specId, 'Spec is already running');
      return;
    }

    // Mark as active
    activeSpecs.set(specId, { aborted: false });

    // Get project for git operations
    const project = getProject(spec.projectId);
    if (!project) {
      events?.onError?.(specId, 'Project not found');
      activeSpecs.delete(specId);
      return;
    }

    // Get all chunks
    const allChunks = getChunksBySpec(specId);
    const pendingChunks = allChunks.filter(
      (c) => c.status === 'pending' || c.status === 'failed' || c.status === 'cancelled'
    );

    if (pendingChunks.length === 0) {
      events?.onError?.(specId, 'No pending chunks to execute');
      activeSpecs.delete(specId);
      return;
    }

    // Update spec status
    updateSpec(specId, { status: 'running' });

    // Track execution stats
    const stats: SpecExecutionStats = {
      totalChunks: pendingChunks.length,
      passedChunks: 0,
      failedChunks: 0,
      skippedChunks: 0,
      fixChunksCreated: 0,
      durationMs: 0,
    };

    // Initialize git workflow
    let gitState: GitWorkflowState | undefined;
    try {
      gitState = await gitService.initWorkflow(specId, project.directory);
      if (gitState.enabled) {
        events?.onGitWorkflowInit?.(gitState);
        console.log(`[Execution] Git workflow initialized: ${gitState.specBranch}`);
      }
    } catch (error) {
      console.error('[Execution] Git workflow init failed:', error);
      // Continue without git - not a fatal error
    }

    events?.onSpecStart?.(specId, pendingChunks.length);

    // Track completed and failed chunks for dependency resolution
    const completedIds = new Set<string>();
    const failedIds = new Set<string>();

    // Initialize completed set with already-completed chunks that passed review
    for (const chunk of allChunks) {
      if (chunk.status === 'completed') {
        if (chunk.reviewStatus === 'pass' || !chunk.reviewStatus) {
          completedIds.add(chunk.id);
        }
      }
    }

    let currentIndex = 0;
    let hasFailure = false;
    let stopReason: string | null = null;

    // Main execution loop
    while (!hasFailure && !stopReason) {
      // Check for abort
      if (this.isAborted(specId)) {
        stopReason = 'Aborted by user';
        break;
      }

      // Refresh chunks from DB
      const currentChunks = getChunksBySpec(specId);

      // Find runnable chunks (all dependencies met)
      const runnableChunks = this.findRunnableChunks(currentChunks, completedIds, failedIds);

      // Check if done
      if (runnableChunks.length === 0) {
        break;
      }

      // Run chunks sequentially (to avoid race conditions with shared state)
      for (const chunk of runnableChunks) {
        if (this.isAborted(specId) || hasFailure) {
          break;
        }

        // Validate dependencies again
        const depValidation = this.validateDependencies(chunk, currentChunks, completedIds);
        if (!depValidation.valid) {
          console.log(`[Execution] Skipping chunk "${chunk.title}": ${depValidation.reason}`);
          updateChunk(chunk.id, {
            status: 'cancelled',
            error: depValidation.reason,
          });
          failedIds.add(chunk.id);
          events?.onDependencyBlocked?.(
            chunk.id,
            chunk.title,
            depValidation.blockingChunkId || '',
            depValidation.blockingChunkTitle || '',
            depValidation.reason || ''
          );
          this.cancelDependentChunks(chunk.id, chunk.title, 'dependency failed', currentChunks, completedIds, failedIds, events);
          continue;
        }

        currentIndex++;

        // Run chunk through pipeline
        const result = await this.runChunkWithRetry(
          chunk,
          currentIndex,
          stats.totalChunks,
          gitState,
          events
        );

        if (result.status === 'cancelled') {
          stopReason = 'Aborted by user';
          break;
        }

        if (result.status === 'pass') {
          completedIds.add(chunk.id);
          stats.passedChunks++;

          // Git commit already done in pipeline
          if (result.commitHash) {
            events?.onGitCommit?.(chunk.id, result.commitHash);
          }
        } else if (result.status === 'needs_fix' && result.fixChunkId) {
          // Run the fix chunk
          stats.fixChunksCreated++;
          const fixChunk = getChunk(result.fixChunkId);

          if (fixChunk) {
            const fixResult = await this.runChunkWithRetry(
              fixChunk,
              currentIndex,
              stats.totalChunks,
              gitState,
              events,
              true // isFix
            );

            if (fixResult.status === 'pass') {
              completedIds.add(chunk.id);
              completedIds.add(result.fixChunkId);
              stats.passedChunks++;
            } else {
              // Fix failed - mark original chunk as failed
              failedIds.add(chunk.id);
              stats.failedChunks++;
              hasFailure = true;
              stopReason = `Fix chunk "${fixChunk.title}" failed`;
              this.cancelDependentChunks(chunk.id, chunk.title, 'fix failed', currentChunks, completedIds, failedIds, events);
            }
          }
        } else {
          // Chunk failed
          failedIds.add(chunk.id);
          stats.failedChunks++;
          hasFailure = true;
          stopReason = `Chunk "${chunk.title}" failed: ${result.error || result.reviewFeedback}`;
          this.cancelDependentChunks(chunk.id, chunk.title, 'failed', currentChunks, completedIds, failedIds, events);
        }
      }
    }

    // Handle abortion
    if (this.isAborted(specId)) {
      events?.onSpecAborted?.(specId, stopReason || 'Aborted by user');
      updateSpec(specId, { status: 'review' });
      await gitService.cleanup(gitState!);
      activeSpecs.delete(specId);
      return;
    }

    // Final review if all chunks passed
    if (!hasFailure && stats.passedChunks === stats.totalChunks) {
      const finalReviewResult = await this.runFinalReview(specId, gitState, stats, events);

      if (finalReviewResult.status === 'pass') {
        // Push and create PR
        if (gitState?.enabled && spec) {
          const prResult = await gitService.pushAndCreatePR(gitState, spec, stats.passedChunks);
          if (prResult.success && prResult.prUrl) {
            stats.prUrl = prResult.prUrl;
            stats.prNumber = prResult.prNumber;
            updateSpec(specId, { prUrl: prResult.prUrl, prNumber: prResult.prNumber });
            events?.onGitPush?.(gitState.specBranch || '');
            events?.onPRCreated?.(prResult.prUrl, prResult.prNumber);
          }
        }
        updateSpec(specId, { status: 'completed' });
      } else if (finalReviewResult.status === 'needs_fix' && finalReviewResult.fixChunks) {
        // Create fix chunks and re-run
        const fixChunkIds = await this.createFinalReviewFixChunks(specId, finalReviewResult.fixChunks);
        stats.fixChunksCreated += fixChunkIds.length;
        events?.onFinalReviewFixChunks?.(specId, fixChunkIds);
        updateSpec(specId, { status: 'review' });
      } else {
        updateSpec(specId, { status: 'review' });
      }
    } else {
      updateSpec(specId, { status: 'review' });
    }

    // Cleanup
    stats.durationMs = Date.now() - startTime;
    await gitService.cleanup(gitState!);

    console.log('[Execution] Spec execution analytics:', {
      specId,
      specTitle: spec.title,
      ...stats,
      durationMinutes: (stats.durationMs / 60000).toFixed(2),
    });

    events?.onSpecComplete?.(specId, stats);
    activeSpecs.delete(specId);
  }

  /**
   * Abort a running spec execution
   */
  abort(specId: string): void {
    const session = activeSpecs.get(specId);
    if (session) {
      session.aborted = true;
      console.log(`[Execution] Aborting spec: ${specId}`);
    }
  }

  /**
   * Check if spec is currently running
   */
  isRunning(specId: string): boolean {
    return activeSpecs.has(specId);
  }

  /**
   * Check if spec execution was aborted
   */
  private isAborted(specId: string): boolean {
    return activeSpecs.get(specId)?.aborted ?? false;
  }

  /**
   * Run a chunk through the pipeline with events
   */
  private async runChunkWithRetry(
    chunk: Chunk,
    index: number,
    total: number,
    gitState?: GitWorkflowState,
    events?: SpecExecutionEvents,
    isFix = false
  ): Promise<ChunkPipelineResult> {
    events?.onChunkStart?.(chunk.id, chunk.title, index, total);

    const pipelineEvents: ChunkPipelineEvents = {
      onToolCall: (chunkId, toolCall) => events?.onToolCall?.(chunkId, toolCall),
      onValidationStart: (chunkId) => events?.onValidationStart?.(chunkId),
      onValidationComplete: (chunkId, result) => events?.onValidationComplete?.(chunkId, result),
      onReviewStart: (chunkId) => events?.onReviewStart?.(chunkId),
      onReviewComplete: (chunkId, result) => events?.onReviewComplete?.(chunkId, result),
      onCommit: (chunkId, hash) => events?.onCommit?.(chunkId, hash),
      onError: (chunkId, error) => events?.onError?.(chunkId, error),
    };

    const result = await chunkPipeline.execute(chunk.id, gitState, pipelineEvents);

    // Git reset on failure
    if (result.status !== 'pass' && result.status !== 'cancelled' && gitState?.enabled) {
      gitService.resetHard(gitState);
      events?.onGitReset?.(chunk.id, `${isFix ? 'Fix chunk' : 'Chunk'} ${result.status}`);
    }

    events?.onChunkComplete?.(chunk.id, result);

    return result;
  }

  /**
   * Find chunks that can run (all dependencies completed)
   */
  private findRunnableChunks(
    allChunks: Chunk[],
    completedIds: Set<string>,
    failedIds: Set<string>
  ): Chunk[] {
    return allChunks.filter((chunk) => {
      // Skip already processed
      if (completedIds.has(chunk.id) || failedIds.has(chunk.id)) {
        return false;
      }

      // Skip non-runnable status
      if (chunk.status !== 'pending' && chunk.status !== 'failed' && chunk.status !== 'cancelled') {
        return false;
      }

      // Check dependencies
      for (const depId of chunk.dependencies) {
        if (!completedIds.has(depId)) {
          return false;
        }
      }

      return true;
    });
  }

  /**
   * Validate dependencies for a chunk
   */
  private validateDependencies(
    chunk: Chunk,
    allChunks: Chunk[],
    completedIds: Set<string>
  ): { valid: boolean; reason?: string; blockingChunkId?: string; blockingChunkTitle?: string } {
    for (const depId of chunk.dependencies) {
      const depChunk = allChunks.find((c) => c.id === depId);

      if (!depChunk) {
        return { valid: false, reason: `Dependency ${depId} not found`, blockingChunkId: depId };
      }

      if (!completedIds.has(depId)) {
        if (depChunk.status !== 'completed') {
          return {
            valid: false,
            reason: `Dependency "${depChunk.title}" not completed (${depChunk.status})`,
            blockingChunkId: depId,
            blockingChunkTitle: depChunk.title,
          };
        }

        if (depChunk.reviewStatus === 'needs_fix' || depChunk.reviewStatus === 'fail') {
          return {
            valid: false,
            reason: `Dependency "${depChunk.title}" ${depChunk.reviewStatus}`,
            blockingChunkId: depId,
            blockingChunkTitle: depChunk.title,
          };
        }
      }
    }

    return { valid: true };
  }

  /**
   * Cancel all dependent chunks when a chunk fails
   */
  private cancelDependentChunks(
    chunkId: string,
    chunkTitle: string,
    reason: string,
    allChunks: Chunk[],
    completedIds: Set<string>,
    failedIds: Set<string>,
    events?: SpecExecutionEvents
  ): void {
    const dependents = this.findDependentChunks(chunkId, allChunks);

    for (const dep of dependents) {
      if (!failedIds.has(dep.id) && !completedIds.has(dep.id)) {
        updateChunk(dep.id, {
          status: 'cancelled',
          error: `Blocked: ${chunkTitle} ${reason}`,
        });
        failedIds.add(dep.id);
        events?.onDependencyBlocked?.(dep.id, dep.title, chunkId, chunkTitle, reason);
      }
    }
  }

  /**
   * Find all chunks that depend on a given chunk (transitive)
   */
  private findDependentChunks(chunkId: string, allChunks: Chunk[]): Chunk[] {
    const dependents: Chunk[] = [];
    const visited = new Set<string>();

    const collect = (id: string) => {
      for (const chunk of allChunks) {
        if (chunk.dependencies.includes(id) && !visited.has(chunk.id)) {
          visited.add(chunk.id);
          dependents.push(chunk);
          collect(chunk.id);
        }
      }
    };

    collect(chunkId);
    return dependents;
  }

  /**
   * Run final review after all chunks pass
   */
  private async runFinalReview(
    specId: string,
    gitState: GitWorkflowState | undefined,
    stats: SpecExecutionStats,
    events?: SpecExecutionEvents
  ): Promise<FinalReviewResult> {
    events?.onFinalReviewStart?.(specId);

    const spec = getSpec(specId);
    if (!spec) {
      return { status: 'error', feedback: '', error: 'Spec not found' };
    }

    const project = getProject(spec.projectId);
    const reviewSvc = project?.id ? createReviewService(project.id) : reviewService;

    const result = await reviewSvc.reviewSpecFinal(specId);

    events?.onFinalReviewComplete?.(specId, result);

    return result;
  }

  /**
   * Create fix chunks from final review feedback
   */
  private async createFinalReviewFixChunks(
    specId: string,
    fixes: Array<{ title: string; description: string }>
  ): Promise<string[]> {
    const reviewSvc = reviewService;
    return reviewSvc.createFixChunks(specId, fixes);
  }
}

export const specExecutionService = new SpecExecutionService();
