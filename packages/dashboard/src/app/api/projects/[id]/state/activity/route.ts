import { NextResponse } from 'next/server';
import { getProject } from '@/lib/db';
import { addActivity } from '@/lib/db/state-snapshots';

interface RouteContext {
  params: Promise<{ id: string }>;
}

// POST /api/projects/[id]/state/activity
export async function POST(request: Request, context: RouteContext) {
  try {
    const { id: projectId } = await context.params;
    const project = getProject(projectId);
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const body = await request.json();
    if (!body.description || !body.type) {
      return NextResponse.json(
        { error: 'Activity entry requires description and type' },
        { status: 400 }
      );
    }

    const state = addActivity(projectId, {
      date: body.date ?? new Date().toISOString().split('T')[0],
      description: body.description,
      type: body.type,
    });

    return NextResponse.json(state);
  } catch (error) {
    console.error('Error adding activity:', error);
    return NextResponse.json({ error: 'Failed to add activity' }, { status: 500 });
  }
}
