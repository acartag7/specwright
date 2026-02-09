/**
 * Wave Scheduler - builds execution waves with file overlap detection
 *
 * Uses the graph layout (topological sort) to determine dependency layers,
 * then splits each layer into sub-waves where chunks with overlapping
 * files are serialized to avoid conflicts.
 */

import type { Chunk } from '@specwright/shared';
import { calculateLayout, groupByLayers } from '../graph-layout';

export interface WaveSchedule {
  waves: Wave[];
  serializedChunks: SerializedReason[];
}

export interface Wave {
  index: number;
  chunks: Chunk[];
  parallel: boolean; // false if only 1 chunk or serialized due to overlap
}

export interface SerializedReason {
  chunkA: string;
  chunkB: string;
  overlappingFiles: string[];
  reason: 'file_overlap';
}

/**
 * Detect overlapping files between two chunks.
 * Returns the list of file paths that both chunks touch.
 */
export function detectFileOverlap(chunkA: Chunk, chunkB: Chunk): string[] {
  const filesB = new Set(chunkB.files);
  return chunkA.files.filter(f => filesB.has(f));
}

/**
 * Split chunks into groups where no two chunks in the same group
 * share any files. Records serialization reasons for chunks that
 * could not be grouped together.
 */
export function splitByFileOverlap(
  chunks: Chunk[],
): { groups: Chunk[][]; serialized: SerializedReason[] } {
  const groups: Chunk[][] = [];
  const serialized: SerializedReason[] = [];

  for (const chunk of chunks) {
    let placed = false;

    for (const group of groups) {
      const hasOverlap = group.some(existing => {
        const overlap = detectFileOverlap(existing, chunk);
        if (overlap.length > 0) {
          serialized.push({
            chunkA: existing.id,
            chunkB: chunk.id,
            overlappingFiles: overlap,
            reason: 'file_overlap',
          });
          return true;
        }
        return false;
      });

      if (!hasOverlap) {
        group.push(chunk);
        placed = true;
        break;
      }
    }

    if (!placed) {
      groups.push([chunk]);
    }
  }

  return { groups, serialized };
}

/**
 * Build a wave schedule from a list of chunks.
 *
 * 1. Build dependency graph via calculateLayout
 * 2. Group by layers via groupByLayers
 * 3. For each layer, split by file overlap into sub-waves
 */
export function buildWaveSchedule(chunks: Chunk[]): WaveSchedule {
  if (chunks.length === 0) {
    return { waves: [], serializedChunks: [] };
  }

  const graph = calculateLayout(chunks);
  const layers = groupByLayers(graph);

  const waves: Wave[] = [];
  const allSerialized: SerializedReason[] = [];
  let waveIndex = 0;

  for (const layer of layers) {
    // Get pending chunks only (not completed or running)
    const pendingChunks = layer.nodes
      .filter(n => n.status !== 'completed' && n.status !== 'running')
      .map(n => chunks.find(c => c.id === n.id))
      .filter((c): c is Chunk => c !== undefined);

    if (pendingChunks.length === 0) continue;

    if (pendingChunks.length === 1) {
      waves.push({
        index: waveIndex++,
        chunks: pendingChunks,
        parallel: false,
      });
      continue;
    }

    const { groups, serialized } = splitByFileOverlap(pendingChunks);
    allSerialized.push(...serialized);

    for (const group of groups) {
      waves.push({
        index: waveIndex++,
        chunks: group,
        parallel: group.length > 1,
      });
    }
  }

  return { waves, serializedChunks: allSerialized };
}
