import { NextResponse } from 'next/server';
import { getProject } from '@/lib/db';
import { getMetaSpecByProject, reorderPhases } from '@/lib/db/meta-specs';

interface RouteContext {
  params: Promise<{ id: string }>;
}

// POST /api/projects/[id]/meta-spec/phases/reorder
export async function POST(request: Request, context: RouteContext) {
  try {
    const { id: projectId } = await context.params;
    const project = getProject(projectId);
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const metaSpec = getMetaSpecByProject(projectId);
    if (!metaSpec) {
      return NextResponse.json({ error: 'Meta-spec not found' }, { status: 404 });
    }

    const body = await request.json();
    if (!Array.isArray(body.phaseIds)) {
      return NextResponse.json({ error: 'phaseIds array is required' }, { status: 400 });
    }

    reorderPhases(body.phaseIds);

    // Return updated meta-spec
    const updated = getMetaSpecByProject(projectId);
    return NextResponse.json(updated);
  } catch (error) {
    console.error('Error reordering phases:', error);
    return NextResponse.json({ error: 'Failed to reorder phases' }, { status: 500 });
  }
}
