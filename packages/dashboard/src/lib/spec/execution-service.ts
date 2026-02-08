/**
 * Spec Execution Service - Orchestrates running all chunks in a spec
 *
 * Extracted from lib/services/spec-execution-service.ts (ORC-117)
 * Dependency resolution logic moved to dependency-resolver.ts
 *
 * Flow:
 * 1. Initialize git workflow (worktree or branch)
 * 2. Run chunks respecting dependencies via ChunkPipeline
 * 3. Handle fix chunks from review
 * 4. Final spec review after all chunks pass
 * 5. Push and create PR on success
 */

import type { Chunk, Spec, ChunkToolCall } from '@specwright/shared';
import { getSpec, updateSpec, getChunksBySpec, updateChunk, getChunk } from '../db';
import { getProject } from '../db/projects';
import { chunkPipeline, type ChunkPipelineEvents, type ChunkPipelineResult } from '../services/chunk-pipeline';
import { gitService, type GitWorkflowState } from '../services/git-service';
import { reviewService, createReviewService, type FinalReviewResult, type FixSpec } from '../services/review-service';
import { goalVerifierService } from '../services/goal-verifier';
import type { GoalVerificationResult } from '../services/goal-verifier/types';
import type { ValidationResult } from '../services/validation-service';
import type { ChunkReviewResult } from '../review';
import {
  findRunnableChunks,
  validateDependencies,
  cancelDependentChunks,
} from './dependency-resolver';
import { buildWaveSchedule } from '../execution/wave-scheduler';
import { executeWave, type WaveResult } from '../execution/parallel-executor';
import { loadConfig } from '../config/config-loader';

// Track active run-all sessions
interface ActiveSession {
  aborted: boolean;
  currentChunkId?: string;
}
const activeSpecs = new Map<string, ActiveSession>();

export interface SpecExecutionEvents extends Omit<ChunkPipelineEvents, 'onExecutionStart' | 'onExecutionComplete'> {
  onSpecStart?: (specId: string, totalChunks: number) => void;
  onSpecComplete?: (specId: string, stats: SpecExecutionStats) => void;
  onSpecAborted?: (specId: string, reason: string) => void;
  onChunkStart?: (chunkId: string, title: string, index: number, total: number) => void;
  onChunkComplete?: (chunkId: string, result: ChunkPipelineResult) => void;
  onChunkSkipped?: (chunkId: string, reason: string) => void;
  onDependencyBlocked?: (
    chunkId: string,
    chunkTitle: string,
    blockedBy: string,
    blockedByTitle: string,
    reason: string
  ) => void;
  onWaveStart?: (specId: string, waveIndex: number, chunkIds: string[]) => void;
  onWaveComplete?: (specId: string, waveIndex: number, result: WaveResult) => void;
  onGitWorkflowInit?: (state: GitWorkflowState) => void;
  onGitReset?: (chunkId: string, reason: string) => void;
  onGitCommit?: (chunkId: string, commitHash: string, filesChanged?: number) => void;
  onGitPush?: (branch: string) => void;
  onPRCreated?: (url: string, number?: number) => void;
  onFinalReviewStart?: (specId: string) => void;
  onFinalReviewComplete?: (specId: string, result: FinalReviewResult) => void;
  onFinalReviewFixChunks?: (specId: string, fixChunkIds: string[]) => void;
  onGoalVerificationStart?: (specId: string) => void;
  onGoalVerificationComplete?: (specId: string, result: GoalVerificationResult) => void;
}

export interface SpecExecutionStats {
  totalChunks: number;
  passedChunks: number;
  failedChunks: number;
  skippedChunks: number;
  fixChunksCreated: number;
  prUrl?: string;
  prNumber?: number;
  goalVerification?: GoalVerificationResult;
  durationMs: number;
}

export interface RunAllOptions {
  reset?: boolean;
}

export class SpecExecutionService {
  async runAll(specId: string, events?: SpecExecutionEvents, options?: RunAllOptions): Promise<void> {
    const startTime = Date.now();

    const spec = getSpec(specId);
    if (!spec) {
      events?.onError?.(specId, 'Spec not found');
      return;
    }

    if (activeSpecs.has(specId)) {
      events?.onError?.(specId, 'Spec is already running');
      return;
    }

    activeSpecs.set(specId, { aborted: false });

    let gitState: GitWorkflowState | undefined;

    const stats: SpecExecutionStats = {
      totalChunks: 0,
      passedChunks: 0,
      failedChunks: 0,
      skippedChunks: 0,
      fixChunksCreated: 0,
      durationMs: 0,
    };

    let hasFailure = false;
    let stopReason: string | null = null;
    let wasAborted = false;

    try {
      const project = getProject(spec.projectId);
      if (!project) {
        stats.durationMs = Date.now() - startTime;
        console.log('[Execution] Spec execution failed - project not found:', {
          specId, specTitle: spec.title, ...stats,
          durationMinutes: (stats.durationMs / 60000).toFixed(2),
          error: 'Project not found',
        });
        events?.onError?.(specId, 'Project not found');
        events?.onSpecComplete?.(specId, stats);
        return;
      }

      if (options?.reset) {
        console.log('[Execution] Resetting worktree and chunk statuses');
        const existingChunks = getChunksBySpec(specId);
        for (const chunk of existingChunks) {
          if (chunk.status !== 'pending') {
            updateChunk(chunk.id, {
              status: 'pending',
              error: undefined,
              output: undefined,
              reviewStatus: undefined,
              reviewFeedback: undefined,
              commitHash: undefined,
            });
          }
        }

        const existingGitState = await gitService.initWorkflow(specId, project.directory);
        if (existingGitState.enabled) {
          gitService.resetHard(existingGitState);
          console.log('[Execution] Worktree reset complete');
        }
      }

      const allChunks = getChunksBySpec(specId);
      const pendingChunks = allChunks.filter(
        (c) => c.status === 'pending' || c.status === 'failed' || c.status === 'cancelled'
      );

      if (pendingChunks.length === 0) {
        stats.durationMs = Date.now() - startTime;
        console.log('[Execution] Spec execution skipped - no pending chunks:', {
          specId, specTitle: spec.title, ...stats,
          durationMinutes: (stats.durationMs / 60000).toFixed(2),
        });
        events?.onError?.(specId, 'No pending chunks to execute');
        events?.onSpecComplete?.(specId, stats);
        return;
      }

      stats.totalChunks = pendingChunks.length;
      updateSpec(specId, { status: 'running' });

      try {
        gitState = await gitService.initWorkflow(specId, project.directory);
        if (gitState.enabled) {
          events?.onGitWorkflowInit?.(gitState);
          console.log(`[Execution] Git workflow initialized: ${gitState.specBranch}`);
        }
      } catch (error) {
        console.error('[Execution] Git workflow init failed:', error);
      }

      events?.onSpecStart?.(specId, pendingChunks.length);

      const completedIds = new Set<string>();
      const failedIds = new Set<string>();

      for (const chunk of allChunks) {
        if (chunk.status === 'completed') {
          if (chunk.reviewStatus === 'pass' || !chunk.reviewStatus) {
            completedIds.add(chunk.id);
          }
        }
      }

      // Check parallel config
      const config = await loadConfig(project.directory);
      const useParallel = config.parallel.enabled;

      if (useParallel) {
        // --- Parallel wave-based execution ---
        const waveScheduleResult = this.runWaveExecution(
          specId, allChunks, completedIds, failedIds, stats, gitState, events, config.parallel.maxConcurrent,
        );
        const waveOutcome = await waveScheduleResult;
        hasFailure = waveOutcome.hasFailure;
        stopReason = waveOutcome.stopReason;
        wasAborted = waveOutcome.wasAborted;
      } else {
        // --- Sequential execution (original path) ---
        let currentIndex = 0;

        while (!hasFailure && !stopReason) {
          if (this.isAborted(specId)) {
            stopReason = 'Aborted by user';
            wasAborted = true;
            break;
          }

          const currentChunks = getChunksBySpec(specId);
          const runnableChunks = findRunnableChunks(currentChunks, completedIds, failedIds);

          if (runnableChunks.length === 0) {
            break;
          }

          for (const chunk of runnableChunks) {
            if (this.isAborted(specId) || hasFailure) {
              if (this.isAborted(specId)) {
                wasAborted = true;
                stopReason = 'Aborted by user';
              }
              break;
            }

            const depValidation = validateDependencies(chunk, currentChunks, completedIds);
            if (!depValidation.valid) {
              console.log(`[Execution] Skipping chunk "${chunk.title}": ${depValidation.reason}`);
              updateChunk(chunk.id, {
                status: 'cancelled',
                error: depValidation.reason,
              });
              failedIds.add(chunk.id);
              stats.skippedChunks++;
              events?.onDependencyBlocked?.(
                chunk.id, chunk.title,
                depValidation.blockingChunkId || '',
                depValidation.blockingChunkTitle || '',
                depValidation.reason || ''
              );
              cancelDependentChunks(chunk.id, chunk.title, 'dependency failed', currentChunks, completedIds, failedIds, stats, events);
              continue;
            }

            currentIndex++;

            const result = await this.runChunkWithRetry(
              chunk, specId, currentIndex, stats.totalChunks, gitState, events
            );

            if (result.status === 'cancelled') {
              stopReason = 'Aborted by user';
              wasAborted = true;
              break;
            }

            if (result.status === 'pass') {
              completedIds.add(chunk.id);
              stats.passedChunks++;
              if (result.commitHash) {
                events?.onGitCommit?.(chunk.id, result.commitHash);
              }
            } else if (result.status === 'needs_fix' && result.fixChunkId) {
              const fixChunk = getChunk(result.fixChunkId);

              if (!fixChunk) {
                console.error(`[Execution] Fix chunk not found: ${result.fixChunkId}`);
                failedIds.add(chunk.id);
                stats.failedChunks++;
                hasFailure = true;
                stopReason = `Fix chunk not found: ${result.fixChunkId}`;
                cancelDependentChunks(chunk.id, chunk.title, 'missing fix chunk', currentChunks, completedIds, failedIds, stats, events);
              } else {
                stats.fixChunksCreated++;
                stats.totalChunks++;

                const fixResult = await this.runChunkWithRetry(
                  fixChunk, specId, currentIndex, stats.totalChunks, gitState, events, true
                );

                if (fixResult.status === 'pass') {
                  completedIds.add(chunk.id);
                  completedIds.add(result.fixChunkId);
                  stats.passedChunks += 2;
                } else {
                  failedIds.add(chunk.id);
                  stats.failedChunks += 2;
                  hasFailure = true;
                  stopReason = `Fix chunk "${fixChunk.title}" failed`;
                  cancelDependentChunks(chunk.id, chunk.title, 'fix failed', currentChunks, completedIds, failedIds, stats, events);
                }
              }
            } else {
              failedIds.add(chunk.id);
              stats.failedChunks++;
              hasFailure = true;
              stopReason = `Chunk "${chunk.title}" failed: ${result.error || result.reviewFeedback}`;
              cancelDependentChunks(chunk.id, chunk.title, 'failed', currentChunks, completedIds, failedIds, stats, events);
            }
          }
        }
      }

      if (wasAborted) {
        stats.durationMs = Date.now() - startTime;
        console.log('[Execution] Spec execution aborted:', {
          specId, specTitle: spec.title, ...stats,
          durationMinutes: (stats.durationMs / 60000).toFixed(2),
          reason: stopReason,
        });
        events?.onSpecAborted?.(specId, stopReason || 'Aborted by user');
        events?.onSpecComplete?.(specId, stats);
        updateSpec(specId, { status: 'review' });
        return;
      }

      if (!hasFailure && stats.passedChunks === stats.totalChunks) {
        const { result: finalReviewResult, reviewSvc } = await this.runFinalReview(specId, gitState, stats, events);

        if (finalReviewResult.status === 'pass') {
          // Run goal verification if enabled for this spec
          const latestSpec = getSpec(specId);
          if (latestSpec?.verifyGoal && latestSpec?.goal) {
            events?.onGoalVerificationStart?.(specId);
            const goalResult = await goalVerifierService.verifyGoal(specId);
            stats.goalVerification = goalResult;
            events?.onGoalVerificationComplete?.(specId, goalResult);

            if (goalResult.status === 'needs_fix' && goalResult.fixChunks) {
              console.log(`[GoalVerifier] Suggestions: ${goalResult.fixChunks.length} fix chunks`);
            }
            if (goalResult.status === 'fail') {
              console.log(`[GoalVerifier] Goal verification FAILED: ${goalResult.goalAlignment.explanation}`);
            }
          }

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
          const fixChunkIds = await this.createFinalReviewFixChunks(specId, finalReviewResult.fixChunks, reviewSvc);
          stats.fixChunksCreated += fixChunkIds.length;
          events?.onFinalReviewFixChunks?.(specId, fixChunkIds);
          updateSpec(specId, { status: 'review' });
        } else {
          updateSpec(specId, { status: 'review' });
        }
      } else {
        updateSpec(specId, { status: 'review' });
      }

      stats.durationMs = Date.now() - startTime;
      console.log('[Execution] Spec execution analytics:', {
        specId, specTitle: spec.title, ...stats,
        durationMinutes: (stats.durationMs / 60000).toFixed(2),
      });

      events?.onSpecComplete?.(specId, stats);
    } catch (error) {
      stats.durationMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[Execution] Spec execution failed with exception:', {
        specId, specTitle: spec.title, ...stats,
        durationMinutes: (stats.durationMs / 60000).toFixed(2),
        error: errorMessage,
      });
      events?.onError?.(specId, errorMessage);
      events?.onSpecComplete?.(specId, stats);
      updateSpec(specId, { status: 'review' });
    } finally {
      if (gitState) {
        try {
          await gitService.cleanup(gitState);
        } catch (cleanupError) {
          console.error('[Execution] Git cleanup failed:', cleanupError);
        }
      }
      activeSpecs.delete(specId);
    }
  }

  abort(specId: string): void {
    const session = activeSpecs.get(specId);
    if (session) {
      session.aborted = true;
      console.log(`[Execution] Aborting spec: ${specId}`);
      if (session.currentChunkId) {
        console.log(`[Execution] Aborting in-flight chunk: ${session.currentChunkId}`);
        chunkPipeline.abort(session.currentChunkId).catch((err) => {
          console.error('[Execution] Failed to abort chunk:', err);
        });
      }
    }
  }

  isRunning(specId: string): boolean {
    return activeSpecs.has(specId);
  }

  private isAborted(specId: string): boolean {
    return activeSpecs.get(specId)?.aborted ?? false;
  }

  private async runChunkWithRetry(
    chunk: Chunk,
    specId: string,
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

    const session = activeSpecs.get(specId);
    if (session) {
      session.currentChunkId = chunk.id;
    }

    let result: ChunkPipelineResult;
    try {
      result = await chunkPipeline.execute(chunk.id, gitState, pipelineEvents);
    } finally {
      if (session) {
        session.currentChunkId = undefined;
      }
    }

    if (result.status !== 'pass' && result.status !== 'cancelled' && gitState?.enabled) {
      gitService.resetHard(gitState);
      events?.onGitReset?.(chunk.id, `${isFix ? 'Fix chunk' : 'Chunk'} ${result.status}`);
    }

    events?.onChunkComplete?.(chunk.id, result);

    return result;
  }

  private async runWaveExecution(
    specId: string,
    allChunks: Chunk[],
    completedIds: Set<string>,
    failedIds: Set<string>,
    stats: SpecExecutionStats,
    gitState?: GitWorkflowState,
    events?: SpecExecutionEvents,
    maxConcurrent = 3,
  ): Promise<{ hasFailure: boolean; stopReason: string | null; wasAborted: boolean }> {
    let hasFailure = false;
    let stopReason: string | null = null;
    let wasAborted = false;
    let currentIndex = 0;

    const pendingChunks = allChunks.filter(
      (c) => c.status === 'pending' || c.status === 'failed' || c.status === 'cancelled'
    );
    const schedule = buildWaveSchedule(pendingChunks);

    console.log(`[Execution] Parallel mode: ${schedule.waves.length} waves, maxConcurrent=${maxConcurrent}`);

    for (const wave of schedule.waves) {
      if (this.isAborted(specId) || hasFailure) {
        if (this.isAborted(specId)) { wasAborted = true; stopReason = 'Aborted by user'; }
        break;
      }

      const chunkIds = wave.chunks.map(c => c.id);
      events?.onWaveStart?.(specId, wave.index, chunkIds);

      if (!wave.parallel || wave.chunks.length === 1) {
        // Single chunk or serialized — run sequentially
        for (const chunk of wave.chunks) {
          if (this.isAborted(specId) || hasFailure) {
            if (this.isAborted(specId)) { wasAborted = true; stopReason = 'Aborted by user'; }
            break;
          }
          currentIndex++;
          const result = await this.runChunkWithRetry(chunk, specId, currentIndex, stats.totalChunks, gitState, events);
          if (result.status === 'cancelled') { wasAborted = true; stopReason = 'Aborted by user'; break; }
          if (result.status === 'pass') {
            completedIds.add(chunk.id);
            stats.passedChunks++;
            if (result.commitHash) events?.onGitCommit?.(chunk.id, result.commitHash);
          } else {
            failedIds.add(chunk.id);
            stats.failedChunks++;
            hasFailure = true;
            stopReason = `Chunk "${chunk.title}" failed: ${result.error || result.reviewFeedback}`;
            const currentChunks = getChunksBySpec(specId);
            cancelDependentChunks(chunk.id, chunk.title, 'failed', currentChunks, completedIds, failedIds, stats, events);
          }
        }
      } else {
        // Parallel wave execution
        const chunkMap = new Map(wave.chunks.map(c => [c.id, c]));

        const waveResult = await executeWave(
          wave,
          async (chunkId) => {
            const chunk = chunkMap.get(chunkId);
            if (!chunk) return { success: false, error: 'Chunk not found' };
            const result = await this.runChunkWithRetry(chunk, specId, ++currentIndex, stats.totalChunks, gitState, events);
            return {
              success: result.status === 'pass',
              output: result.output,
              error: result.error || result.reviewFeedback,
            };
          },
          { maxConcurrent },
        );

        events?.onWaveComplete?.(specId, wave.index, waveResult);

        for (const r of waveResult.results) {
          if (r.success) {
            completedIds.add(r.chunkId);
            stats.passedChunks++;
          }
        }

        if (!waveResult.allPassed) {
          const currentChunks = getChunksBySpec(specId);
          for (const f of waveResult.failures) {
            failedIds.add(f.chunkId);
            stats.failedChunks++;
            const chunk = chunkMap.get(f.chunkId);
            cancelDependentChunks(f.chunkId, chunk?.title || f.chunkId, 'failed', currentChunks, completedIds, failedIds, stats, events);
          }
          hasFailure = true;
          stopReason = `Wave ${wave.index}: ${waveResult.failures.length} chunk(s) failed`;
        }
      }
    }

    return { hasFailure, stopReason, wasAborted };
  }

  private async runFinalReview(
    specId: string,
    gitState: GitWorkflowState | undefined,
    stats: SpecExecutionStats,
    events?: SpecExecutionEvents
  ): Promise<{ result: FinalReviewResult; reviewSvc: ReturnType<typeof createReviewService> }> {
    events?.onFinalReviewStart?.(specId);

    const spec = getSpec(specId);
    if (!spec) {
      return {
        result: { status: 'error', feedback: '', error: 'Spec not found' },
        reviewSvc: reviewService,
      };
    }

    const project = getProject(spec.projectId);
    if (!project) {
      return {
        result: { status: 'error', feedback: '', error: 'Project not found' },
        reviewSvc: reviewService,
      };
    }

    const reviewSvc = createReviewService(project.id);
    const result = await reviewSvc.reviewSpecFinal(specId);

    events?.onFinalReviewComplete?.(specId, result);

    return { result, reviewSvc };
  }

  private async createFinalReviewFixChunks(
    specId: string,
    fixes: Array<{ title: string; description: string }>,
    reviewSvc: ReturnType<typeof createReviewService>
  ): Promise<string[]> {
    return reviewSvc.createFixChunks(specId, fixes);
  }
}

export const specExecutionService = new SpecExecutionService();
