import { NextResponse } from 'next/server';
import { existsSync } from 'fs';
import { getSpec, getProject, getChunksBySpec } from '@/lib/db';
import { checkGitRepo, createCommit, getGitStatus } from '@/lib/git';

interface RouteContext {
  params: Promise<{ id: string }>;
}

interface CommitRequest {
  message?: string;
}

// POST /api/specs/[id]/git/commit - Commit changes for spec
export async function POST(request: Request, context: RouteContext) {
  try {
    const { id: specId } = await context.params;
    const body = (await request.json()) as CommitRequest;

    // Get spec
    const spec = getSpec(specId);
    if (!spec) {
      return NextResponse.json({ error: 'Spec not found' }, { status: 404 });
    }

    // Get project for directory
    const project = getProject(spec.projectId);
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Check directory exists
    if (!existsSync(project.directory)) {
      return NextResponse.json(
        { error: 'Project directory does not exist' },
        { status: 400 }
      );
    }

    // Check it's a git repo
    if (!checkGitRepo(project.directory)) {
      return NextResponse.json(
        { error: 'Not a git repository' },
        { status: 400 }
      );
    }

    // Check for changes
    const status = await getGitStatus(project.directory);
    if (status.isClean) {
      return NextResponse.json(
        { error: 'No changes to commit' },
        { status: 400 }
      );
    }

    // Generate commit message if not provided
    let commitMessage = body.message;
    if (!commitMessage) {
      // Get completed chunks for context
      const chunks = getChunksBySpec(specId);
      const completedChunks = chunks.filter(c => c.status === 'completed');

      if (completedChunks.length > 0) {
        // Use spec title and completed chunks
        const chunkTitles = completedChunks.slice(0, 3).map(c => c.title).join(', ');
        const truncatedTitle = spec.title.length > 50 ? spec.title.slice(0, 47) + '...' : spec.title;
        commitMessage = `feat: ${truncatedTitle}\n\nCompleted: ${chunkTitles}${completedChunks.length > 3 ? ` (+${completedChunks.length - 3} more)` : ''}`;
      } else {
        // Simple message based on spec title
        const truncatedTitle = spec.title.length > 50 ? spec.title.slice(0, 47) + '...' : spec.title;
        commitMessage = `feat: ${truncatedTitle}`;
      }
    }

    // Create commit
    const result = await createCommit(project.directory, commitMessage);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Failed to create commit' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      commitHash: result.commitHash,
      message: commitMessage,
      filesChanged: result.filesChanged,
    });
  } catch (error) {
    console.error('Error creating commit:', error);
    return NextResponse.json(
      { error: `Failed to create commit: ${error instanceof Error ? error.message : 'Unknown error'}` },
      { status: 500 }
    );
  }
}
