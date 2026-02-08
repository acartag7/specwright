/**
 * Chunk Executor Service - Handles raw OpenCode execution
 *
 * Wraps the existing execution.ts functions into a cleaner service interface.
 * This is a thin wrapper around the existing execution module.
 */

import { spawnSync } from 'child_process';
import type { Chunk, ChunkToolCall } from '@specwright/shared';
import {
  startChunkExecution,
  abortChunkExecution,
  waitForChunkCompletion,
  subscribeToExecution,
  hasRunningExecution,
  getRunningChunkId,
  type ExecutionEvent,
} from '../execution';

export interface VerificationResult {
  passed: boolean;
  output: string;
  exitCode?: number | null;
}

export interface ExecutionResult {
  status: 'completed' | 'failed' | 'cancelled';
  output?: string;
  error?: string;
}

const ALLOWED_VERIFY_COMMANDS = ['pnpm', 'npm', 'yarn', 'bun', 'node', 'npx', 'tsc', 'vitest', 'jest'];

export interface ExecutionCallbacks {
  onToolCall?: (toolCall: ChunkToolCall) => void;
  onText?: (text: string) => void;
  onStatusChange?: (status: 'running' | 'completed' | 'failed' | 'cancelled') => void;
}

export class ChunkExecutor {
  /**
   * Execute a chunk via OpenCode
   * - Create session
   * - Send prompt
   * - Handle tool calls
   * - Return when complete
   */
  async execute(
    chunkId: string,
    callbacks?: ExecutionCallbacks
  ): Promise<ExecutionResult> {
    console.log(`[ChunkExecutor] Starting execution for chunk ${chunkId}`);

    // Start the execution
    const startResult = await startChunkExecution(chunkId);

    if (!startResult.success) {
      console.error(`[ChunkExecutor] Failed to start chunk ${chunkId}: ${startResult.error}`);
      callbacks?.onStatusChange?.('failed');
      return {
        status: 'failed',
        error: startResult.error,
      };
    }

    // Notify that execution is running
    callbacks?.onStatusChange?.('running');

    // Wait for completion
    const result = await waitForChunkCompletion(
      chunkId,
      callbacks?.onToolCall,
      callbacks?.onText
    );

    console.log(`[ChunkExecutor] Chunk ${chunkId} ${result.status}`);

    // Notify final status
    callbacks?.onStatusChange?.(result.status);

    return {
      status: result.status,
      output: result.output,
      error: result.error,
    };
  }

  /**
   * Abort running execution
   */
  async abort(chunkId: string): Promise<{ success: boolean; error?: string }> {
    console.log(`[ChunkExecutor] Aborting chunk ${chunkId}`);
    return abortChunkExecution(chunkId);
  }

  /**
   * Check if chunk is currently executing
   */
  isRunning(chunkId: string): boolean {
    const runningId = getRunningChunkId();
    return runningId === chunkId;
  }

  /**
   * Check if any execution is running
   */
  hasRunningExecution(): boolean {
    return hasRunningExecution();
  }

  /**
   * Subscribe to execution events
   */
  subscribe(chunkId: string, listener: (event: ExecutionEvent) => void): () => void {
    return subscribeToExecution(chunkId, listener);
  }

  /**
   * Run verification command for a chunk.
   * Uses safe shell execution (no shell: true, no sh -c).
   */
  runVerification(chunk: Chunk, workingDir: string): VerificationResult {
    if (!chunk.verifyCommand?.trim()) {
      return { passed: true, output: 'No verification command specified' };
    }

    const parts = chunk.verifyCommand.trim().split(/\s+/);
    const [command, ...args] = parts;

    if (!ALLOWED_VERIFY_COMMANDS.includes(command)) {
      return { passed: false, output: `Command "${command}" is not allowed. Allowed: ${ALLOWED_VERIFY_COMMANDS.join(', ')}` };
    }

    try {
      const result = spawnSync(command, args, {
        cwd: workingDir,
        shell: false,
        timeout: 60000,
        encoding: 'utf-8',
      });

      return {
        passed: result.status === 0,
        output: (result.stdout || '') + (result.stderr || ''),
        exitCode: result.status,
      };
    } catch (error) {
      return {
        passed: false,
        output: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}

export const chunkExecutor = new ChunkExecutor();
