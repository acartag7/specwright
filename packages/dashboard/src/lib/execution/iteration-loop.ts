/**
 * Iteration Loop (Ralph Loop)
 *
 * Retries chunk execution with feedback on failure.
 * Two failure modes:
 *   - 'reset': git reset --hard + retry with accumulated feedback
 *   - 'fix-chunk': return immediately, let caller handle
 */

import { spawnSync } from 'child_process';

export interface IterationConfig {
  maxIterations: number;
  onFailure: 'fix-chunk' | 'reset';
  workingDir?: string;
}

export interface IterationAttempt {
  iteration: number;
  result: {
    success: boolean;
    output?: string;
    error?: string;
    feedback?: string;
  };
  action: string;
}

export interface IterationResult {
  success: boolean;
  iterations: number;
  finalStatus: 'completed' | 'failed' | 'max-iterations';
  history: IterationAttempt[];
}

/**
 * Execute a chunk with retry logic.
 *
 * On each failure when onFailure === 'reset':
 *   1. Run `git reset --hard` in workingDir (safe shell, no string interpolation)
 *   2. Retry with accumulated feedback from prior attempts
 *
 * On failure when onFailure === 'fix-chunk':
 *   Return immediately so the caller can create a fix chunk.
 */
export async function executeWithRetry(
  chunkId: string,
  executor: (
    chunkId: string,
    feedback?: string,
  ) => Promise<{
    success: boolean;
    output?: string;
    error?: string;
    feedback?: string;
  }>,
  config: IterationConfig,
): Promise<IterationResult> {
  const history: IterationAttempt[] = [];
  let accumulatedFeedback = '';

  for (let i = 1; i <= config.maxIterations; i++) {
    const feedback = accumulatedFeedback || undefined;
    const result = await executor(chunkId, feedback);

    if (result.success) {
      history.push({ iteration: i, result, action: 'completed' });
      return {
        success: true,
        iterations: i,
        finalStatus: 'completed',
        history,
      };
    }

    // Build feedback for next attempt
    const attemptFeedback = result.feedback || result.error || 'Unknown failure';

    if (config.onFailure === 'fix-chunk') {
      history.push({ iteration: i, result, action: 'defer-to-fix-chunk' });
      return {
        success: false,
        iterations: i,
        finalStatus: 'failed',
        history,
      };
    }

    // onFailure === 'reset': git reset and retry
    if (config.workingDir) {
      const resetResult = spawnSync('git', ['reset', '--hard'], {
        cwd: config.workingDir,
        shell: false,
        timeout: 10000,
        encoding: 'utf-8',
      });

      if (resetResult.status !== 0) {
        const resetError = resetResult.stderr || 'git reset failed';
        console.warn(`[IterationLoop] git reset failed: ${resetError}`);
        history.push({ iteration: i, result, action: `reset-failed: ${resetError}` });
        return {
          success: false,
          iterations: i,
          finalStatus: 'failed',
          history,
        };
      }
    }

    // Append feedback for next iteration
    accumulatedFeedback += (accumulatedFeedback ? '\n---\n' : '')
      + `Attempt ${i} failed: ${attemptFeedback}`;

    const isLast = i === config.maxIterations;
    history.push({
      iteration: i,
      result,
      action: isLast ? 'max-iterations-reached' : 'reset-and-retry',
    });
  }

  return {
    success: false,
    iterations: config.maxIterations,
    finalStatus: 'max-iterations',
    history,
  };
}
