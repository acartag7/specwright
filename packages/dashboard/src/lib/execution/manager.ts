/**
 * Execution Manager - Pure business logic for chunk execution
 *
 * Extracted from hooks/useExecution.ts (ORC-114)
 * Contains non-React functions: status comparison, API calls, types
 */

import type { Chunk, ChunkToolCall, ChunkStatus, ReviewResult, ReviewStatus, Spec } from '@specwright/shared';

/** Polling interval in milliseconds for chunk status updates */
export const POLL_INTERVAL_MS = 3000;

/**
 * Compares chunk arrays to detect status changes by chunk id.
 * Returns true if any chunk's status or error field has changed,
 * or if chunks were added/removed.
 */
export function hasStatusChanged(oldChunks: Chunk[], newChunks: Chunk[]): boolean {
  if (!oldChunks || !newChunks) return true;

  // Build map from newChunks by id
  const newChunkMap = new Map(newChunks.map(chunk => [chunk.id, chunk]));

  // Check if any oldChunk has changed or is missing
  for (const oldChunk of oldChunks) {
    const newChunk = newChunkMap.get(oldChunk.id);
    if (!newChunk) return true; // Chunk removed
    if (oldChunk.status !== newChunk.status || oldChunk.error !== newChunk.error) {
      return true;
    }
  }

  // Check if newChunks contains any id not present in oldChunks
  const oldChunkIds = new Set(oldChunks.map(chunk => chunk.id));
  for (const newChunk of newChunks) {
    if (!oldChunkIds.has(newChunk.id)) return true; // New chunk added
  }

  return false;
}

export interface ExecutionState {
  isRunning: boolean;
  chunkId: string | null;
  status: ChunkStatus | null;
  toolCalls: ChunkToolCall[];
  output: string;
  error: string | null;
  startedAt: number | null;
  // Review state
  isReviewing: boolean;
  reviewResult: ReviewResult | null;
  fixChunkId: string | null;
}

export const INITIAL_EXECUTION_STATE: ExecutionState = {
  isRunning: false,
  chunkId: null,
  status: null,
  toolCalls: [],
  output: '',
  error: null,
  startedAt: null,
  isReviewing: false,
  reviewResult: null,
  fixChunkId: null,
};

export interface UseExecutionReturn {
  state: ExecutionState;
  runChunk: (chunkId: string) => Promise<void>;
  abortChunk: (chunkId: string) => Promise<void>;
  watchChunk: (chunkId: string) => void;
  stopWatching: () => void;
  // Review functions
  reviewChunk: (chunkId: string) => Promise<ReviewResult | null>;
  clearReview: () => void;
  // Polling state
  isPolling: boolean;
  lastUpdate: Date | null;
}

export interface UseExecutionProps {
  specId?: string;
  chunks?: Chunk[];
  spec?: Spec;
  onChunksUpdate?: (chunks: Chunk[]) => void;
  onSpecUpdate?: (spec: Spec) => void;
}

/**
 * Determines if polling should be active based on execution status.
 * Polling runs when spec is running OR any chunk is running.
 */
export function shouldPollStatus(chunks?: Chunk[], spec?: Spec): boolean {
  if (!chunks || !spec) return false;
  return spec.status === 'running' || chunks.some(chunk => chunk.status === 'running');
}

/**
 * Fetch spec data for polling
 */
export async function fetchSpecStatus(
  specId: string,
  signal?: AbortSignal
): Promise<{ chunks?: Chunk[]; spec?: Partial<Spec> } | null> {
  const response = await fetch(`/api/specs/${specId}`, { signal });

  if (!response.ok) {
    if (response.status === 404 || response.status === 401 || response.status === 403) {
      return null; // Stop polling
    }
    throw new Error(`HTTP ${response.status}`);
  }

  const data = await response.json();
  if (!data.chunks) return { spec: data.spec };

  return { chunks: data.chunks, spec: data.spec };
}

/**
 * Start chunk execution via API
 */
export async function startChunkRun(chunkId: string): Promise<void> {
  const response = await fetch(`/api/chunks/${chunkId}/run`, {
    method: 'POST',
  });

  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.error || 'Failed to start execution');
  }
}

/**
 * Abort chunk execution via API
 */
export async function abortChunkRun(chunkId: string): Promise<void> {
  const response = await fetch(`/api/chunks/${chunkId}/abort`, {
    method: 'POST',
  });

  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.error || 'Failed to abort execution');
  }
}

/**
 * Review a completed chunk via API
 */
export async function reviewChunkRun(chunkId: string): Promise<ReviewResult> {
  const response = await fetch(`/api/chunks/${chunkId}/review`, {
    method: 'POST',
  });

  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.error || 'Failed to review chunk');
  }

  return response.json();
}
