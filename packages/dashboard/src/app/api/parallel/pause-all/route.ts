/**
 * Pause All Workers API
 *
 * POST /api/parallel/pause-all
 * Pauses all running workers.
 */

import { getOrchestrator } from '@/lib/worker-orchestrator';

export async function POST() {
  const orchestrator = getOrchestrator();
  await orchestrator.pauseAll();

  return Response.json({ success: true });
}
