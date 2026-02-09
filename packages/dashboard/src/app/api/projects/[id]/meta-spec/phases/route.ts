import { NextResponse } from 'next/server';
import { getProject } from '@/lib/db';
import { getMetaSpecByProject, createPhase } from '@/lib/db/meta-specs';

interface RouteContext {
  params: Promise<{ id: string }>;
}

// POST /api/projects/[id]/meta-spec/phases
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
    if (!body.name || typeof body.name !== 'string') {
      return NextResponse.json({ error: 'Phase name is required' }, { status: 400 });
    }

    const phase = createPhase(metaSpec.id, {
      name: body.name.trim(),
      description: body.description,
      successCriteria: body.successCriteria,
      status: body.status,
      orderIndex: body.orderIndex,
    });

    return NextResponse.json(phase, { status: 201 });
  } catch (error) {
    console.error('Error creating phase:', error);
    return NextResponse.json({ error: 'Failed to create phase' }, { status: 500 });
  }
}
