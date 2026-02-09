/**
 * Parallel Status API
 *
 * GET /api/parallel/status
 * Returns current worker status, queue, and capacity info.
 */

import { getOrchestrator } from '@/lib/worker-orchestrator';
import { getWorkerQueue } from '@/lib/db';

export async function GET() {
  const orchestrator = getOrchestrator();
  const activeWorkers = orchestrator.getActiveWorkers();

  return Response.json({
    workers: activeWorkers.map(w => ({
      id: w.id,
      specId: w.specId,
      projectId: w.projectId,
      status: w.status,
      currentChunkId: w.currentChunkId,
      currentStep: w.currentStep,
      progress: w.progress,
      startedAt: w.startedAt,
      error: w.error,
      specTitle: w.specTitle,
      projectName: w.projectName,
      currentChunkTitle: w.currentChunkTitle,
    })),
    queue: getWorkerQueue(),
    capacity: {
      used: activeWorkers.length,
      max: orchestrator.getMaxWorkers(),
      hasCapacity: orchestrator.hasCapacity(),
    },
  });
}
