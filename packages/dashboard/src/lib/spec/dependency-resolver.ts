/**
 * Dependency Resolver - Chunk dependency management
 *
 * Extracted from lib/services/spec-execution-service.ts (ORC-117)
 * Handles finding runnable chunks, validating dependencies, and
 * cancelling dependent chunks when a parent fails.
 */

import type { Chunk } from '@specwright/shared';
import { updateChunk } from '../db';
import type { SpecExecutionEvents, SpecExecutionStats } from './execution-service';

/**
 * Find chunks that can run (all dependencies completed)
 */
export function findRunnableChunks(
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
export function validateDependencies(
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
 * Find all chunks that depend on a given chunk (transitive)
 */
export function findDependentChunks(chunkId: string, allChunks: Chunk[]): Chunk[] {
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
 * Cancel all dependent chunks when a chunk fails
 */
export function cancelDependentChunks(
  chunkId: string,
  chunkTitle: string,
  reason: string,
  allChunks: Chunk[],
  completedIds: Set<string>,
  failedIds: Set<string>,
  stats: SpecExecutionStats,
  events?: SpecExecutionEvents
): void {
  const dependents = findDependentChunks(chunkId, allChunks);

  for (const dep of dependents) {
    if (!failedIds.has(dep.id) && !completedIds.has(dep.id)) {
      updateChunk(dep.id, {
        status: 'cancelled',
        error: `Blocked: ${chunkTitle} ${reason}`,
      });
      failedIds.add(dep.id);
      stats.skippedChunks++;
      events?.onDependencyBlocked?.(dep.id, dep.title, chunkId, chunkTitle, reason);
    }
  }
}
