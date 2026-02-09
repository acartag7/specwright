/**
 * Git Worktrees - Worktree management operations
 *
 * Extracted from lib/git.ts (ORC-116)
 */

import { existsSync } from 'fs';
import { gitSync } from './core';
import { validateBranchName } from './validation';

export interface WorktreeInfo {
  path: string;
  branch: string;
  head: string;
}

/**
 * Create a git worktree for isolated spec execution
 * Format: {projectPath}-spec-{shortId}-{timestamp}
 */
export function createWorktree(
  projectPath: string,
  specId: string,
  branchName: string
): { success: boolean; path?: string; error?: string } {
  const branchValidation = validateBranchName(branchName);
  if (!branchValidation.valid) {
    return {
      success: false,
      error: `Invalid branch name: ${branchValidation.error}`,
    };
  }

  const shortId = specId.slice(0, 8);
  const timestamp = Date.now();
  const worktreePath = `${projectPath}-spec-${shortId}-${timestamp}`;

  if (existsSync(worktreePath)) {
    return {
      success: false,
      error: `Worktree path already exists: ${worktreePath}`,
    };
  }

  const result = gitSync(['worktree', 'add', worktreePath, '-b', branchName], projectPath);

  if (result.status !== 0) {
    const retryResult = gitSync(['worktree', 'add', worktreePath, branchName], projectPath);

    if (retryResult.status !== 0) {
      return {
        success: false,
        error: retryResult.stderr || 'Failed to create worktree',
      };
    }
  }

  return {
    success: true,
    path: worktreePath,
  };
}

/**
 * Remove a git worktree (after PR merge or cleanup)
 */
export function removeWorktree(
  projectPath: string,
  worktreePath: string
): { success: boolean; error?: string } {
  let result = gitSync(['worktree', 'remove', worktreePath], projectPath);

  if (result.status !== 0) {
    result = gitSync(['worktree', 'remove', '--force', worktreePath], projectPath);

    if (result.status !== 0) {
      return {
        success: false,
        error: result.stderr || 'Failed to remove worktree',
      };
    }
  }

  return { success: true };
}

/**
 * List all worktrees for a project
 */
export function listWorktrees(projectPath: string): WorktreeInfo[] {
  const result = gitSync(['worktree', 'list', '--porcelain'], projectPath);

  if (result.status !== 0) {
    return [];
  }

  const worktrees: WorktreeInfo[] = [];
  const lines = result.stdout.split('\n');
  let current: Partial<WorktreeInfo> = {};

  for (const line of lines) {
    if (line.startsWith('worktree ')) {
      current.path = line.replace('worktree ', '');
    } else if (line.startsWith('branch ')) {
      current.branch = line.replace('branch ', '').replace('refs/heads/', '');
    } else if (line.startsWith('HEAD ')) {
      current.head = line.replace('HEAD ', '');
    } else if (line === '') {
      if (current.path) {
        worktrees.push(current as WorktreeInfo);
      }
      current = {};
    }
  }

  if (current.path) {
    worktrees.push(current as WorktreeInfo);
  }

  return worktrees;
}
