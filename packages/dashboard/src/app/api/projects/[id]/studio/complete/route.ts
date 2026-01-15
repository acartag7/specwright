import { NextResponse } from 'next/server';
import { getProject, getSpecByProject, updateSpec, createChunk, updateStudioState } from '@/lib/db';
import type { CompleteStudioRequest } from '@glm/shared';

interface RouteContext {
  params: Promise<{ id: string }>;
}

// POST /api/projects/[id]/studio/complete - Save spec and create chunks
export async function POST(request: Request, context: RouteContext) {
  try {
    const { id: projectId } = await context.params;
    const body = await request.json() as CompleteStudioRequest;

    const project = getProject(projectId);
    if (!project) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      );
    }

    const spec = getSpecByProject(projectId);
    if (!spec) {
      return NextResponse.json(
        { error: 'Spec not found' },
        { status: 404 }
      );
    }

    if (!body.spec?.trim()) {
      return NextResponse.json(
        { error: 'Spec content is required' },
        { status: 400 }
      );
    }

    // Update spec with generated content
    const updatedSpec = updateSpec(spec.id, {
      title: extractTitle(body.spec) || 'Untitled Spec',
      content: body.spec,
    });

    if (!updatedSpec) {
      return NextResponse.json(
        { error: 'Failed to update spec' },
        { status: 500 }
      );
    }

    // Create chunks from selected suggestions
    const selectedChunks = (body.chunks || []).filter(c => c.selected);
    for (const chunk of selectedChunks) {
      createChunk(spec.id, {
        title: chunk.title,
        description: chunk.description,
        order: chunk.order,
      });
    }

    // Mark studio as complete
    updateStudioState(projectId, { step: 'complete' });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error completing studio:', error);
    return NextResponse.json(
      { error: `Failed to complete: ${error instanceof Error ? error.message : 'Unknown error'}` },
      { status: 500 }
    );
  }
}

// Extract title from markdown (first # heading)
function extractTitle(markdown: string): string | null {
  const match = markdown.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : null;
}
