/**
 * Parallel Executor - Runs chunks within a wave concurrently
 *
 * Uses a simple concurrency limiter (semaphore) to cap the number
 * of chunks executing at the same time. Promise.allSettled ensures
 * a single failure does not abort sibling chunks in the same wave.
 */

import type { Wave } from './wave-scheduler';

export interface ChunkResult {
  chunkId: string;
  success: boolean;
  output?: string;
  error?: string;
}

export interface ChunkFailure {
  chunkId: string;
  error: string;
}

export interface WaveResult {
  waveIndex: number;
  results: ChunkResult[];
  failures: ChunkFailure[];
  allPassed: boolean;
}

export interface ParallelExecutionConfig {
  maxConcurrent: number;
  onChunkStart?: (chunkId: string) => void;
  onChunkComplete?: (chunkId: string, result: ChunkResult) => void;
  onWaveComplete?: (waveIndex: number, results: ChunkResult[]) => void;
}

/**
 * Simple concurrency limiter using a queue of resolve callbacks.
 */
function createLimiter(max: number) {
  let active = 0;
  const queue: Array<() => void> = [];

  function next() {
    if (queue.length > 0 && active < max) {
      active++;
      const resolve = queue.shift()!;
      resolve();
    }
  }

  return {
    async run<T>(fn: () => Promise<T>): Promise<T> {
      await new Promise<void>((resolve) => {
        queue.push(resolve);
        next();
      });
      try {
        return await fn();
      } finally {
        active--;
        next();
      }
    },
  };
}

/**
 * Execute all chunks in a wave with bounded concurrency.
 *
 * @param wave       - The wave containing chunks to execute
 * @param runChunk   - Callback that actually executes a single chunk by id
 * @param config     - Concurrency limit and lifecycle callbacks
 */
export async function executeWave(
  wave: Wave,
  runChunk: (chunkId: string) => Promise<{ success: boolean; output?: string; error?: string }>,
  config: ParallelExecutionConfig,
): Promise<WaveResult> {
  const limiter = createLimiter(config.maxConcurrent);

  const settled = await Promise.allSettled(
    wave.chunks.map((chunk) =>
      limiter.run(async () => {
        config.onChunkStart?.(chunk.id);

        const raw = await runChunk(chunk.id);
        const result: ChunkResult = {
          chunkId: chunk.id,
          success: raw.success,
          output: raw.output,
          error: raw.error,
        };

        config.onChunkComplete?.(chunk.id, result);
        return result;
      }),
    ),
  );

  const results: ChunkResult[] = [];
  const failures: ChunkFailure[] = [];

  for (const outcome of settled) {
    if (outcome.status === 'fulfilled') {
      results.push(outcome.value);
      if (!outcome.value.success) {
        failures.push({ chunkId: outcome.value.chunkId, error: outcome.value.error || 'Unknown error' });
      }
    } else {
      // Rejected promise — should not happen with allSettled but handle gracefully
      const error = outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason);
      const chunkId = 'unknown';
      results.push({ chunkId, success: false, error });
      failures.push({ chunkId, error });
    }
  }

  const waveResult: WaveResult = {
    waveIndex: wave.index,
    results,
    failures,
    allPassed: failures.length === 0,
  };

  config.onWaveComplete?.(wave.index, results);

  return waveResult;
}
