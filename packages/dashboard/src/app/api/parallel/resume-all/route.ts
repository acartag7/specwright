/**
 * Resume All Workers API
 *
 * POST /api/parallel/resume-all
 * Resumes all paused workers.
 */

import { getOrchestrator } from '@/lib/worker-orchestrator';

export async function POST() {
  const orchestrator = getOrchestrator();
  await orchestrator.resumeAll();

  return Response.json({ success: true });
}
