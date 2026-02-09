/**
 * File Conflict Detector
 *
 * Detects file overlaps between a new spec and currently running specs.
 * Informational only — does not block execution.
 */

import { getChunksBySpec, getSpec } from '../db';
import { getOrchestrator } from '../worker-orchestrator';

export interface FileOverlap {
  runningSpecId: string;
  runningSpecTitle: string;
  overlappingFiles: string[];
}

export function detectFileOverlaps(newSpecId: string): FileOverlap[] {
  const newChunks = getChunksBySpec(newSpecId);
  const newFiles = new Set(newChunks.flatMap(c => c.files || []));

  if (newFiles.size === 0) return [];

  const orchestrator = getOrchestrator();
  const runningWorkers = orchestrator.getActiveWorkers();
  const overlaps: FileOverlap[] = [];

  for (const worker of runningWorkers) {
    if (worker.specId === newSpecId) continue;

    const runningChunks = getChunksBySpec(worker.specId);
    const runningFiles = new Set(runningChunks.flatMap(c => c.files || []));

    const overlap: string[] = [];
    for (const file of newFiles) {
      if (runningFiles.has(file)) {
        overlap.push(file);
      }
    }

    if (overlap.length > 0) {
      const runningSpec = getSpec(worker.specId);
      overlaps.push({
        runningSpecId: worker.specId,
        runningSpecTitle: runningSpec?.title || worker.specId,
        overlappingFiles: overlap,
      });
    }
  }

  return overlaps;
}
