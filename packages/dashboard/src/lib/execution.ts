/**
 * Chunk Execution Service
 *
 * Manages running chunks through OpencodeClient (GLM)
 *
 * Split into domain modules (ORC-115):
 * - execution/events.ts: SSE event handling, active execution tracking
 * - execution/validation.ts: File change validation
 * - execution/manager.ts: Pure business logic for hook (ORC-114)
 *
 * This file re-exports from those modules and retains the core
 * startChunkExecution/abortChunkExecution/cleanup orchestration.
 */

import { OpencodeClient } from '@/lib/clients/opencode-client';
import type { Chunk, Spec, EventHandler, ProjectConfig } from '@specwright/shared';
import { DEFAULT_PROJECT_CONFIG, DEFAULT_CHUNK_TIMEOUT_MS } from '@specwright/shared';
import { getChunk, updateChunk, getProject, getSpec } from './db';
import { buildPromptForChunk } from './prompt-builder';
import { generateChunkSummary, generateQuickSummary } from './summary-generator';

// Re-export from events module
export {
  type ExecutionEvent,
  type ActiveExecution,
  hasRunningExecution,
  getRunningChunkId,
  getExecution,
  subscribeToExecution,
  emitEvent,
  handleToolCall,
  startRunAllSession,
  isRunAllAborted,
  abortRunAllSession,
  endRunAllSession,
  hasActiveRunAllSession,
} from './execution/events';

// Re-export from validation module
export {
  type ChangeValidation,
  validateFileChanges,
} from './execution/validation';

// Import internals needed by this file
import {
  getActiveExecutions,
  getToolCallIdMap,
  getChunkToolCallIds,
  emitEvent,
  handleToolCall,
  hasRunningExecution,
  subscribeToExecution as _subscribeToExecution,
  type ExecutionEvent as _ExecutionEvent,
} from './execution/events';
import { validateFileChanges } from './execution/validation';

/**
 * Get chunk execution timeout from environment variable or default
 */
export function getChunkTimeout(): number {
  const envTimeout = process.env.CHUNK_TIMEOUT_MS;
  if (envTimeout) {
    const parsed = parseInt(envTimeout, 10);
    if (!isNaN(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return DEFAULT_CHUNK_TIMEOUT_MS;
}

/**
 * Wait for a chunk execution to complete
 * @deprecated Use chunkPipeline.execute() from '@/lib/services/chunk-pipeline' instead
 */
export function waitForChunkCompletion(
  chunkId: string,
  onToolCall?: (toolCall: import('@specwright/shared').ChunkToolCall) => void,
  onText?: (text: string) => void
): Promise<{ status: 'completed' | 'failed' | 'cancelled'; output?: string; error?: string }> {
  return new Promise((resolve) => {
    let resolved = false;
    let output = '';
    let error = '';

    const unsubscribe = _subscribeToExecution(chunkId, (event: _ExecutionEvent) => {
      if (resolved) return;

      switch (event.type) {
        case 'tool_call':
          if (onToolCall) onToolCall(event.toolCall);
          break;
        case 'text':
          if (onText) onText(event.text);
          break;
        case 'complete':
          output = event.output;
          break;
        case 'error':
          error = event.error;
          break;
        case 'status':
          if (event.status === 'completed' || event.status === 'failed' || event.status === 'cancelled') {
            resolved = true;
            unsubscribe();
            resolve({
              status: event.status,
              output: output || undefined,
              error: error || undefined,
            });
          }
          break;
      }
    });

    const activeExecutions = getActiveExecutions();
    const execution = activeExecutions.get(chunkId);
    if (!execution) {
      resolved = true;
      unsubscribe();
      const chunk = getChunk(chunkId);
      if (chunk) {
        resolve({
          status: chunk.status === 'completed' ? 'completed' :
                  chunk.status === 'cancelled' ? 'cancelled' : 'failed',
          output: chunk.output,
          error: chunk.error,
        });
      } else {
        resolve({ status: 'failed', error: 'Chunk not found' });
      }
    }
  });
}

/**
 * Build prompt for chunk execution with dependency context
 */
async function buildChunkPromptWithContext(spec: Spec, chunk: Chunk): Promise<string> {
  const getChunkOrUndefined = (id: string): Chunk | undefined => getChunk(id) ?? undefined;
  return buildPromptForChunk(chunk, spec, getChunkOrUndefined);
}

/**
 * Start executing a chunk
 * @deprecated Use chunkExecutor.execute() from '@/lib/services/chunk-executor' or chunkPipeline.execute() instead
 */
export async function startChunkExecution(chunkId: string): Promise<{ success: boolean; error?: string }> {
  const activeExecutions = getActiveExecutions();

  if (activeExecutions.has(chunkId)) {
    return { success: false, error: 'Chunk is already running' };
  }

  if (hasRunningExecution()) {
    return { success: false, error: 'Another chunk is already running' };
  }

  const chunk = getChunk(chunkId);
  if (!chunk) {
    return { success: false, error: 'Chunk not found' };
  }

  if (chunk.status === 'running') {
    return { success: false, error: 'Chunk is already running' };
  }

  const spec = getSpec(chunk.specId);
  if (!spec) {
    return { success: false, error: 'Spec not found' };
  }

  const project = getProject(spec.projectId);
  if (!project) {
    return { success: false, error: 'Project not found' };
  }

  const config: ProjectConfig = project.config ?? DEFAULT_PROJECT_CONFIG;
  const workingDirectory = spec.worktreePath || project.directory;

  console.log(`[Execution] Starting chunk: ${chunk.title}`);
  console.log(`[Execution] Config: Executor=${config.executor.type}@${config.executor.endpoint || 'default'}, Model=${config.executor.model || 'default'}, MaxIterations=${config.maxIterations}`);
  console.log(`[Execution] Working directory: ${workingDirectory}`);

  const prompt = await buildChunkPromptWithContext(spec, chunk);
  const client = new OpencodeClient({ baseUrl: config.executor.endpoint });
  const listeners = new Set<(event: import('./execution/events').ExecutionEvent) => void>();

  try {
    if (config.executor.type === 'opencode') {
      const health = await client.checkHealth();
      if (!health.healthy) {
        return { success: false, error: `OpenCode server is not available at ${config.executor.endpoint || 'http://localhost:4096'}. Make sure opencode is running.` };
      }
    } else if (config.executor.type === 'claude-code') {
      return { success: false, error: 'Claude Code executor is not yet implemented.' };
    }

    const session = await client.createSession(workingDirectory, `Chunk: ${chunk.title}`);
    updateChunk(chunkId, { status: 'running' });

    let timeoutMs = getChunkTimeout();
    if (config.executor.timeout !== undefined) {
      const configTimeout = Number(config.executor.timeout);
      if (Number.isFinite(configTimeout) && configTimeout > 0) {
        timeoutMs = configTimeout;
      } else {
        console.warn(`[Execution] Invalid timeout in config: ${config.executor.timeout}, using default: ${timeoutMs}ms`);
      }
    }

    const timeoutId = setTimeout(() => {
      handleTimeout(chunkId);
    }, timeoutMs);

    let warningTimeoutId: NodeJS.Timeout | undefined;
    const warningDelay = timeoutMs * 0.8;
    if (warningDelay > 0) {
      warningTimeoutId = setTimeout(() => {
        const timeoutMinutes = Math.floor(timeoutMs / 60000);
        console.warn('[TIMEOUT WARNING]', {
          chunkId,
          specId: chunk.specId,
          chunkTitle: chunk.title,
          elapsed: Math.floor(timeoutMs * 0.8 / 1000),
          remaining: Math.floor(timeoutMs * 0.2 / 1000),
          message: `Chunk execution at 80% of timeout (${timeoutMinutes} min total)`,
          timestamp: new Date().toISOString()
        });
      }, warningDelay);
    }

    const eventHandler: EventHandler = {
      onSessionStatus: (eventSessionId, status) => {
        console.error(`[Execution] SessionStatus: ${eventSessionId} vs ${session.id}, status: ${status}`);
        if (eventSessionId === session.id || eventSessionId === project.directory) {
          if (status === 'busy') {
            emitEvent(chunkId, { type: 'status', status: 'running' });
          }
        }
      },
      onToolCall: (eventSessionId, toolCall) => {
        console.error(`[Execution] ToolCall: ${eventSessionId} vs ${session.id}, tool: ${toolCall.tool}`);
        if (eventSessionId === session.id || eventSessionId === project.directory) {
          handleToolCall(chunkId, toolCall);
        }
      },
      onTextChunk: (eventSessionId, text) => {
        if (eventSessionId === session.id || eventSessionId === project.directory) {
          const execution = activeExecutions.get(chunkId);
          if (execution) {
            execution.textOutput += text;
          }
          emitEvent(chunkId, { type: 'text', text });
        }
      },
      onFileEdit: () => {},
      onError: (eventSessionId, error) => {
        if (eventSessionId === session.id || eventSessionId === project.directory) {
          handleError(chunkId, error.message);
        }
      },
      onComplete: (eventSessionId) => {
        console.error(`[Execution] Complete: ${eventSessionId} vs ${session.id}`);
        if (eventSessionId === session.id || eventSessionId === project.directory) {
          handleComplete(chunkId);
        }
      },
    };

    const unsubscribe = client.subscribeToEvents(eventHandler);

    activeExecutions.set(chunkId, {
      chunkId,
      sessionId: session.id,
      directory: workingDirectory,
      startedAt: Date.now(),
      timeoutId,
      warningTimeoutId,
      client,
      unsubscribe,
      listeners,
      textOutput: '',
      eventBuffer: [],
    });

    await client.sendPrompt(session.id, workingDirectory, {
      parts: [{ type: 'text', text: prompt }],
      model: {
        providerID: 'zai-coding-plan',
        modelID: config.executor.model || 'glm-4.7',
      },
    });

    return { success: true };
  } catch (error) {
    updateChunk(chunkId, {
      status: 'failed',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * Abort a running chunk execution
 * @deprecated Use chunkPipeline.abort() from '@/lib/services/chunk-pipeline' instead
 */
export async function abortChunkExecution(chunkId: string): Promise<{ success: boolean; error?: string }> {
  const activeExecutions = getActiveExecutions();
  const execution = activeExecutions.get(chunkId);
  if (!execution) {
    return { success: false, error: 'Chunk is not running' };
  }

  try {
    await execution.client.abortSession(execution.sessionId, execution.directory);
    cleanup(chunkId, 'cancelled', 'Execution cancelled by user');
    return { success: true };
  } catch (error) {
    cleanup(chunkId, 'failed', error instanceof Error ? error.message : 'Failed to abort');
    return { success: false, error: error instanceof Error ? error.message : 'Failed to abort' };
  }
}

// Helper: Handle timeout
function handleTimeout(chunkId: string): void {
  const activeExecutions = getActiveExecutions();
  const execution = activeExecutions.get(chunkId);
  const timeoutMs = execution ? (Date.now() - execution.startedAt) : getChunkTimeout();
  const timeoutMinutes = Math.floor(timeoutMs / 60000);
  cleanup(chunkId, 'failed', `Execution timed out after ${timeoutMinutes} minutes`);
}

// Helper: Handle error
function handleError(chunkId: string, message: string): void {
  cleanup(chunkId, 'failed', message);
}

// Helper: Handle completion with file change validation
function handleComplete(chunkId: string): void {
  const activeExecutions = getActiveExecutions();
  const execution = activeExecutions.get(chunkId);
  const output = execution?.textOutput || 'Task completed';

  const chunk = getChunk(chunkId);
  const validation = validateFileChanges(execution?.directory || '');

  console.log('[EXECUTION VALIDATION]', {
    chunkId,
    specId: chunk?.specId,
    chunkTitle: chunk?.title,
    hasChanges: validation.hasChanges,
    filesChanged: validation.filesChanged,
    additions: validation.additions,
    deletions: validation.deletions,
    onlyWhitespace: validation.onlyWhitespace,
    outcome: validation.hasChanges && !validation.onlyWhitespace ? 'completed' : 'failed',
    timestamp: new Date().toISOString(),
  });

  if (!validation.hasChanges) {
    cleanup(
      chunkId,
      'failed',
      'Execution completed but no file changes detected. The AI may have misunderstood the task or encountered an error.',
      output
    );
    return;
  }

  if (validation.onlyWhitespace) {
    cleanup(
      chunkId,
      'failed',
      'Execution completed but only whitespace changes detected. No meaningful code changes were made.',
      output
    );
    return;
  }

  cleanup(chunkId, 'completed', undefined, output);
}

// Helper: Cleanup execution
function cleanup(chunkId: string, status: 'completed' | 'failed' | 'cancelled', error?: string, output?: string): void {
  const activeExecutions = getActiveExecutions();
  const toolCallIdMap = getToolCallIdMap();
  const chunkToolCallIdsMap = getChunkToolCallIds();

  const execution = activeExecutions.get(chunkId);
  if (!execution) return;

  clearTimeout(execution.timeoutId);
  if (execution.warningTimeoutId) clearTimeout(execution.warningTimeoutId);

  execution.unsubscribe();
  execution.client.deleteSession(execution.sessionId, execution.directory).catch(() => {});

  const toolCallIds = chunkToolCallIdsMap.get(chunkId);
  if (toolCallIds) {
    for (const opcodeId of toolCallIds) {
      toolCallIdMap.delete(opcodeId);
    }
    chunkToolCallIdsMap.delete(chunkId);
  }

  const finalOutput = output || execution.textOutput || undefined;

  const duration = Date.now() - execution.startedAt;
  const timeoutMs = getChunkTimeout();
  const utilizationPercent = ((duration / timeoutMs) * 100).toFixed(2);

  console.log('[EXECUTION ANALYTICS]', {
    chunkId,
    specId: getChunk(chunkId)?.specId,
    chunkTitle: getChunk(chunkId)?.title,
    status,
    durationMs: duration,
    durationSeconds: (duration / 1000).toFixed(2),
    durationMinutes: (duration / 60000).toFixed(2),
    timeoutMs,
    utilizationPercent,
    timestamp: new Date().toISOString()
  });

  updateChunk(chunkId, {
    status,
    error: error || undefined,
    output: finalOutput,
  });

  emitEvent(chunkId, { type: 'status', status });
  if (status === 'completed') {
    emitEvent(chunkId, { type: 'complete', output: finalOutput || 'Task completed' });
    generateSummaryAsync(chunkId, execution.directory);
  } else if (error) {
    emitEvent(chunkId, { type: 'error', error });
  }

  activeExecutions.delete(chunkId);
}

/**
 * Generate summary asynchronously after chunk completion
 */
async function generateSummaryAsync(chunkId: string, workingDirectory: string): Promise<void> {
  try {
    const chunk = getChunk(chunkId);
    if (!chunk) {
      console.error(`[Summary] Chunk not found: ${chunkId}`);
      return;
    }

    console.error(`[Summary] Generating summary for chunk: ${chunk.title}`);

    const result = await generateChunkSummary(chunk, workingDirectory);

    if (result.success && result.summary) {
      updateChunk(chunkId, { outputSummary: result.summary });
      console.error(`[Summary] Summary generated for chunk: ${chunk.title}`);
    } else {
      const quickSummary = generateQuickSummary(chunk);
      updateChunk(chunkId, { outputSummary: quickSummary });
      console.error(`[Summary] Quick summary generated for chunk: ${chunk.title} (Claude failed: ${result.error})`);
    }
  } catch (error) {
    console.error(`[Summary] Error generating summary for chunk ${chunkId}:`, error);
    const chunk = getChunk(chunkId);
    if (chunk) {
      const quickSummary = generateQuickSummary(chunk);
      updateChunk(chunkId, { outputSummary: quickSummary });
    }
  }
}
