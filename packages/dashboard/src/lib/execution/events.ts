/**
 * Execution Events - SSE event handling and active execution tracking
 *
 * Extracted from lib/execution.ts (ORC-115)
 * Manages active execution state, event buffering, and listener subscriptions.
 */

import type { ChunkToolCall, ToolCallEvent } from '@specwright/shared';
import { OpencodeClient } from '@/lib/clients/opencode-client';
import { createToolCall, updateToolCall } from '../db';

const MAX_BUFFER_SIZE = 1000;

export type ExecutionEvent =
  | { type: 'status'; status: 'running' | 'completed' | 'failed' | 'cancelled' }
  | { type: 'tool_call'; toolCall: ChunkToolCall }
  | { type: 'text'; text: string }
  | { type: 'complete'; output: string }
  | { type: 'error'; error: string };

export interface ActiveExecution {
  chunkId: string;
  sessionId: string;
  directory: string;
  startedAt: number;
  timeoutId: NodeJS.Timeout;
  warningTimeoutId?: NodeJS.Timeout;
  client: OpencodeClient;
  unsubscribe: () => void;
  listeners: Set<(event: ExecutionEvent) => void>;
  textOutput: string;
  eventBuffer: ExecutionEvent[];
}

// Store active executions
const activeExecutions = new Map<string, ActiveExecution>();

// Map tool call IDs from opencode to our IDs
const toolCallIdMap = new Map<string, string>();

// Track which opencode tool call IDs belong to which chunk (for cleanup)
const chunkToolCallIds = new Map<string, Set<string>>();

// Store active run-all sessions
const activeRunAllSessions = new Map<string, { aborted: boolean }>();

/**
 * Get the active executions map (for internal use by execution module)
 */
export function getActiveExecutions(): Map<string, ActiveExecution> {
  return activeExecutions;
}

/**
 * Get the tool call ID maps (for cleanup)
 */
export function getToolCallIdMap(): Map<string, string> {
  return toolCallIdMap;
}

export function getChunkToolCallIds(): Map<string, Set<string>> {
  return chunkToolCallIds;
}

/**
 * Check if any chunk is currently running
 */
export function hasRunningExecution(): boolean {
  return activeExecutions.size > 0;
}

/**
 * Get currently running chunk ID if any
 */
export function getRunningChunkId(): string | null {
  const [chunkId] = activeExecutions.keys();
  return chunkId ?? null;
}

/**
 * Get execution for a chunk
 */
export function getExecution(chunkId: string): ActiveExecution | undefined {
  return activeExecutions.get(chunkId);
}

/**
 * Subscribe to execution events for a chunk
 */
export function subscribeToExecution(chunkId: string, listener: (event: ExecutionEvent) => void): () => void {
  const execution = activeExecutions.get(chunkId);
  if (execution) {
    // Replay buffered events to new subscriber
    for (const event of execution.eventBuffer) {
      try {
        listener(event);
      } catch (e) {
        console.error('Error replaying event to listener:', e);
      }
    }

    // Add listener for future events
    execution.listeners.add(listener);
    return () => execution.listeners.delete(listener);
  }
  return () => {};
}

/**
 * Emit event to all listeners for a chunk
 */
export function emitEvent(chunkId: string, event: ExecutionEvent): void {
  const execution = activeExecutions.get(chunkId);
  if (execution) {
    // Buffer event for late subscribers
    execution.eventBuffer.push(event);

    // Enforce buffer size limit by removing oldest events
    if (execution.eventBuffer.length > MAX_BUFFER_SIZE) {
      execution.eventBuffer.splice(0, execution.eventBuffer.length - MAX_BUFFER_SIZE);
    }

    // Send to current listeners
    for (const listener of execution.listeners) {
      try {
        listener(event);
      } catch (e) {
        console.error('Error in execution listener:', e);
      }
    }
  }
}

/**
 * Handle tool call events from opencode
 */
export function handleToolCall(chunkId: string, toolCall: ToolCallEvent): void {
  let dbToolCallId = toolCallIdMap.get(toolCall.callId);

  if (!dbToolCallId) {
    const dbToolCall = createToolCall(chunkId, {
      tool: toolCall.tool,
      input: toolCall.input || {},
    });
    dbToolCallId = dbToolCall.id;
    toolCallIdMap.set(toolCall.callId, dbToolCallId);

    let chunkIds = chunkToolCallIds.get(chunkId);
    if (!chunkIds) {
      chunkIds = new Set();
      chunkToolCallIds.set(chunkId, chunkIds);
    }
    chunkIds.add(toolCall.callId);
  }

  if (toolCall.state === 'completed' || toolCall.state === 'error') {
    updateToolCall(dbToolCallId, {
      status: toolCall.state,
      output: toolCall.output,
    });
  }

  emitEvent(chunkId, {
    type: 'tool_call',
    toolCall: {
      id: dbToolCallId,
      chunkId,
      tool: toolCall.tool,
      input: toolCall.input || {},
      output: toolCall.output,
      status: toolCall.state === 'error' ? 'error' : toolCall.state === 'completed' ? 'completed' : 'running',
      startedAt: Date.now(),
      completedAt: toolCall.state === 'completed' || toolCall.state === 'error' ? Date.now() : undefined,
    },
  });
}

// --- Run-all session management (deprecated but still used) ---

/**
 * Start a run-all session for a spec
 * @deprecated Use specExecutionService.runAll() from '@/lib/services/spec-execution-service' instead
 */
export function startRunAllSession(specId: string): void {
  activeRunAllSessions.set(specId, { aborted: false });
}

/**
 * Check if run-all should be aborted
 * @deprecated Use specExecutionService from '@/lib/services/spec-execution-service' instead
 */
export function isRunAllAborted(specId: string): boolean {
  const session = activeRunAllSessions.get(specId);
  return session?.aborted ?? false;
}

/**
 * Abort a run-all session
 * @deprecated Use specExecutionService.abort() from '@/lib/services/spec-execution-service' instead
 */
export function abortRunAllSession(specId: string): void {
  const session = activeRunAllSessions.get(specId);
  if (session) {
    session.aborted = true;
  }
}

/**
 * End a run-all session
 * @deprecated Use specExecutionService from '@/lib/services/spec-execution-service' instead
 */
export function endRunAllSession(specId: string): void {
  activeRunAllSessions.delete(specId);
}

/**
 * Check if a run-all session is active
 * @deprecated Use specExecutionService.isRunning() from '@/lib/services/spec-execution-service' instead
 */
export function hasActiveRunAllSession(specId: string): boolean {
  return activeRunAllSessions.has(specId);
}
