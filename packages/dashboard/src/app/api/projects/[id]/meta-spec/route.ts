import { NextResponse } from 'next/server';
import { getProject } from '@/lib/db';
import {
  getMetaSpecByProject,
  createMetaSpec,
  updateMetaSpec,
  deleteMetaSpec,
} from '@/lib/db/meta-specs';

interface RouteContext {
  params: Promise<{ id: string }>;
}

// GET /api/projects/[id]/meta-spec
export async function GET(_request: Request, context: RouteContext) {
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

    return NextResponse.json(metaSpec);
  } catch (error) {
    console.error('Error fetching meta-spec:', error);
    return NextResponse.json({ error: 'Failed to fetch meta-spec' }, { status: 500 });
  }
}

// POST /api/projects/[id]/meta-spec
export async function POST(request: Request, context: RouteContext) {
  try {
    const { id: projectId } = await context.params;
    const project = getProject(projectId);
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Check if one already exists
    const existing = getMetaSpecByProject(projectId);
    if (existing) {
      return NextResponse.json(
        { error: 'Meta-spec already exists for this project' },
        { status: 409 }
      );
    }

    const body = await request.json();
    const metaSpec = createMetaSpec(projectId, {
      vision: body.vision,
      architecture: body.architecture,
      constraints: body.constraints,
      nonGoals: body.nonGoals,
    });

    return NextResponse.json(metaSpec, { status: 201 });
  } catch (error) {
    console.error('Error creating meta-spec:', error);
    return NextResponse.json({ error: 'Failed to create meta-spec' }, { status: 500 });
  }
}

// PATCH /api/projects/[id]/meta-spec
export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { id: projectId } = await context.params;
    const project = getProject(projectId);
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const existing = getMetaSpecByProject(projectId);
    if (!existing) {
      return NextResponse.json({ error: 'Meta-spec not found' }, { status: 404 });
    }

    const body = await request.json();
    const updated = updateMetaSpec(existing.id, {
      vision: body.vision,
      architecture: body.architecture,
      constraints: body.constraints,
      nonGoals: body.nonGoals,
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Error updating meta-spec:', error);
    return NextResponse.json({ error: 'Failed to update meta-spec' }, { status: 500 });
  }
}

// DELETE /api/projects/[id]/meta-spec
export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { id: projectId } = await context.params;
    const project = getProject(projectId);
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const existing = getMetaSpecByProject(projectId);
    if (!existing) {
      return NextResponse.json({ error: 'Meta-spec not found' }, { status: 404 });
    }

    deleteMetaSpec(existing.id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting meta-spec:', error);
    return NextResponse.json({ error: 'Failed to delete meta-spec' }, { status: 500 });
  }
}
