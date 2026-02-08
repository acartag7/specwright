import { NextResponse } from 'next/server';
import { getProject } from '@/lib/db';
import { getStateByProject, createOrUpdateState } from '@/lib/db/state-snapshots';

interface RouteContext {
  params: Promise<{ id: string }>;
}

// GET /api/projects/[id]/state
export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id: projectId } = await context.params;
    const project = getProject(projectId);
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Auto-create if not exists
    let state = getStateByProject(projectId);
    if (!state) {
      state = createOrUpdateState(projectId, {});
    }

    return NextResponse.json(state);
  } catch (error) {
    console.error('Error fetching state:', error);
    return NextResponse.json({ error: 'Failed to fetch state' }, { status: 500 });
  }
}

// PATCH /api/projects/[id]/state
export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { id: projectId } = await context.params;
    const project = getProject(projectId);
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const body = await request.json();
    const state = createOrUpdateState(projectId, {
      currentPhaseId: body.currentPhaseId,
      currentSpecId: body.currentSpecId,
      currentChunkId: body.currentChunkId,
      recentActivity: body.recentActivity,
      blockers: body.blockers,
      notes: body.notes,
    });

    return NextResponse.json(state);
  } catch (error) {
    console.error('Error updating state:', error);
    return NextResponse.json({ error: 'Failed to update state' }, { status: 500 });
  }
}
