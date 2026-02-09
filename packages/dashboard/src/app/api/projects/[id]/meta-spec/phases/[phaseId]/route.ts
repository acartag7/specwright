import { NextResponse } from 'next/server';
import { getProject } from '@/lib/db';
import { getMetaSpecByProject, updatePhase, deletePhase } from '@/lib/db/meta-specs';

interface RouteContext {
  params: Promise<{ id: string; phaseId: string }>;
}

// PATCH /api/projects/[id]/meta-spec/phases/[phaseId]
export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { id: projectId, phaseId } = await context.params;
    const project = getProject(projectId);
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const metaSpec = getMetaSpecByProject(projectId);
    if (!metaSpec) {
      return NextResponse.json({ error: 'Meta-spec not found' }, { status: 404 });
    }

    // Verify phase belongs to this meta-spec
    const phaseExists = metaSpec.phases.some(p => p.id === phaseId);
    if (!phaseExists) {
      return NextResponse.json({ error: 'Phase not found' }, { status: 404 });
    }

    const body = await request.json();
    const updated = updatePhase(phaseId, {
      name: body.name,
      description: body.description,
      successCriteria: body.successCriteria,
      status: body.status,
      orderIndex: body.orderIndex,
    });

    if (!updated) {
      return NextResponse.json({ error: 'Phase not found' }, { status: 404 });
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Error updating phase:', error);
    return NextResponse.json({ error: 'Failed to update phase' }, { status: 500 });
  }
}

// DELETE /api/projects/[id]/meta-spec/phases/[phaseId]
export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { id: projectId, phaseId } = await context.params;
    const project = getProject(projectId);
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const metaSpec = getMetaSpecByProject(projectId);
    if (!metaSpec) {
      return NextResponse.json({ error: 'Meta-spec not found' }, { status: 404 });
    }

    const deleted = deletePhase(phaseId);
    if (!deleted) {
      return NextResponse.json({ error: 'Phase not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting phase:', error);
    return NextResponse.json({ error: 'Failed to delete phase' }, { status: 500 });
  }
}
