import { NextResponse } from 'next/server';
import { existsSync } from 'fs';
import { getSpec, getProject, updateSpec } from '@/lib/db';
import {
  checkGitRepo,
  generateBranchName,
  branchExists,
  createBranch,
  checkoutBranch,
  getCurrentBranch,
} from '@/lib/git';

interface RouteContext {
  params: Promise<{ id: string }>;
}

interface CreateBranchRequest {
  baseBranch?: string;
}

// POST /api/specs/[id]/git/branch - Create or checkout branch for spec
export async function POST(request: Request, context: RouteContext) {
  try {
    const { id: specId } = await context.params;
    const body = (await request.json()) as CreateBranchRequest;

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

    // If spec already has a branch, just checkout that branch
    if (spec.branchName) {
      const currentBranch = getCurrentBranch(project.directory);

      if (currentBranch === spec.branchName) {
        return NextResponse.json({
          branchName: spec.branchName,
          created: false,
          message: 'Already on spec branch',
        });
      }

      // Try to checkout existing branch
      if (checkoutBranch(project.directory, spec.branchName)) {
        return NextResponse.json({
          branchName: spec.branchName,
          created: false,
          message: 'Switched to existing spec branch',
        });
      }

      // Branch might have been deleted, create it again
    }

    // Generate branch name
    const branchName = generateBranchName(specId, spec.title);
    const baseBranch = body.baseBranch || 'main';

    // Check if branch already exists
    if (branchExists(project.directory, branchName)) {
      // Try to checkout
      if (checkoutBranch(project.directory, branchName)) {
        // Update spec with branch name
        updateSpec(specId, { branchName });
        return NextResponse.json({
          branchName,
          created: false,
          message: 'Switched to existing branch',
        });
      }
    }

    // Create new branch
    const result = await createBranch(project.directory, branchName, baseBranch);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error?.message || 'Failed to create branch' },
        { status: 400 }
      );
    }

    // Update spec with branch name
    updateSpec(specId, { branchName });

    return NextResponse.json({
      branchName,
      created: true,
      message: `Created branch from ${baseBranch}`,
    });
  } catch (error) {
    console.error('Error creating branch:', error);
    return NextResponse.json(
      { error: `Failed to create branch: ${error instanceof Error ? error.message : 'Unknown error'}` },
      { status: 500 }
    );
  }
}

// GET /api/specs/[id]/git/branch - Get current branch info for spec
export async function GET(request: Request, context: RouteContext) {
  try {
    const { id: specId } = await context.params;

    const spec = getSpec(specId);
    if (!spec) {
      return NextResponse.json({ error: 'Spec not found' }, { status: 404 });
    }

    const project = getProject(spec.projectId);
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    if (!existsSync(project.directory)) {
      return NextResponse.json(
        { error: 'Project directory does not exist' },
        { status: 400 }
      );
    }

    if (!checkGitRepo(project.directory)) {
      return NextResponse.json({
        isGitRepo: false,
        branchName: null,
        currentBranch: null,
      });
    }

    const currentBranch = getCurrentBranch(project.directory);

    return NextResponse.json({
      isGitRepo: true,
      branchName: spec.branchName || null,
      currentBranch,
      isOnSpecBranch: currentBranch === spec.branchName,
    });
  } catch (error) {
    console.error('Error getting branch info:', error);
    return NextResponse.json(
      { error: `Failed to get branch info: ${error instanceof Error ? error.message : 'Unknown error'}` },
      { status: 500 }
    );
  }
}
