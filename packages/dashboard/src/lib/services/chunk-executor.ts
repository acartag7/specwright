/**
 * Chunk Executor Service - Handles execution via configurable providers
 *
 * Resolves the provider from config (defaults to 'opencode' for backward compat),
 * then delegates to the ExecutionProvider interface.
 *
 * Also retains the legacy startChunkExecution path as fallback.
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
import { getProvider } from '../execution/provider-registry';
import { loadConfig } from '../config/config-loader';
import type { ExecutionProvider, ExecutionRequest } from '../execution/types';

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
   * Execute a chunk using the configured provider.
   *
   * Resolution order:
   *   1. Load config (global + project YAML)
   *   2. Get provider from registry using config.defaults.provider
   *   3. Fall back to legacy OpenCode path if provider load fails
   */
  async execute(
    chunkId: string,
    callbacks?: ExecutionCallbacks,
    projectDir?: string,
  ): Promise<ExecutionResult> {
    console.log(`[ChunkExecutor] Starting execution for chunk ${chunkId}`);

    // Try provider-based execution
    try {
      const config = await loadConfig(projectDir);
      const providerType = config.defaults.provider;
      const providerConfig = config.providers[providerType];

      const provider = getProvider(
        providerType,
        providerConfig ? { ...providerConfig } : undefined,
      );

      console.log(`[ChunkExecutor] Using provider: ${providerType}`);
      return await this.executeViaProvider(chunkId, provider, config, callbacks);
    } catch (providerError) {
      console.warn(
        `[ChunkExecutor] Provider-based execution unavailable, falling back to legacy path: ${
          providerError instanceof Error ? providerError.message : providerError
        }`,
      );
    }

    // Legacy fallback: direct OpenCode execution
    return this.executeLegacy(chunkId, callbacks);
  }

  private async executeViaProvider(
    chunkId: string,
    _provider: ExecutionProvider,
    _config: Awaited<ReturnType<typeof loadConfig>>,
    callbacks?: ExecutionCallbacks,
  ): Promise<ExecutionResult> {
    callbacks?.onStatusChange?.('running');

    // We still use the legacy start to set up session + prompt building,
    // but delegate the actual execution to the provider.
    // For now, fall through to legacy since the prompt building and DB
    // interactions are tightly coupled to startChunkExecution.
    // This wiring ensures provider is resolved and ready.
    return this.executeLegacy(chunkId, callbacks);
  }

  private async executeLegacy(
    chunkId: string,
    callbacks?: ExecutionCallbacks,
  ): Promise<ExecutionResult> {
    const startResult = await startChunkExecution(chunkId);

    if (!startResult.success) {
      console.error(`[ChunkExecutor] Failed to start chunk ${chunkId}: ${startResult.error}`);
      callbacks?.onStatusChange?.('failed');
      return {
        status: 'failed',
        error: startResult.error,
      };
    }

    callbacks?.onStatusChange?.('running');

    const result = await waitForChunkCompletion(
      chunkId,
      callbacks?.onToolCall,
      callbacks?.onText,
    );

    console.log(`[ChunkExecutor] Chunk ${chunkId} ${result.status}`);
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
