/**
 * Git Core - Basic git operations
 *
 * Extracted from lib/git.ts (ORC-116)
 * Safe wrappers for git/gh CLI commands using spawnSync with shell: false.
 */

import { execSync, spawnSync } from 'child_process';
import { validateBranchName } from './validation';

/**
 * Safe wrapper for git commands that prevents command injection
 */
export function gitSync(args: string[], cwd: string): { stdout: string; stderr: string; status: number } {
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf-8',
    shell: false,
  });

  if (result.error) {
    return {
      stdout: '',
      stderr: result.error.message,
      status: 1,
    };
  }

  return {
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    status: result.status ?? 1,
  };
}

/**
 * Safe wrapper for gh CLI commands that prevents command injection
 */
export function ghSync(args: string[], cwd: string): { stdout: string; stderr: string; status: number } {
  const result = spawnSync('gh', args, {
    cwd,
    encoding: 'utf-8',
    shell: false,
  });

  if (result.error) {
    return {
      stdout: '',
      stderr: result.error.message,
      status: 1,
    };
  }

  return {
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    status: result.status ?? 1,
  };
}

export interface GitStatus {
  branch: string;
  hasChanges: boolean;
  filesChanged: number;
  isClean: boolean;
  ahead: number;
  behind: number;
}

export interface GitError {
  type: 'not_git_repo' | 'no_gh_cli' | 'not_authenticated' | 'branch_exists' | 'no_remote' | 'invalid_branch_name' | 'unknown';
  message: string;
}

/**
 * Check if a directory is a git repository
 */
export function checkGitRepo(directory: string): boolean {
  try {
    execSync('git rev-parse --is-inside-work-tree', {
      cwd: directory,
      stdio: 'pipe',
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the current git status of a directory
 */
export async function getGitStatus(directory: string): Promise<GitStatus> {
  const branch = execSync('git branch --show-current', {
    cwd: directory,
    encoding: 'utf-8',
  }).trim();

  const status = execSync('git status --porcelain', {
    cwd: directory,
    encoding: 'utf-8',
  }).trim();

  const files = status ? status.split('\n').filter(Boolean) : [];
  const hasChanges = files.length > 0;

  let ahead = 0;
  let behind = 0;
  try {
    const tracking = execSync('git rev-list --left-right --count HEAD...@{upstream}', {
      cwd: directory,
      encoding: 'utf-8',
    }).trim();
    const [a, b] = tracking.split('\t').map(Number);
    ahead = a || 0;
    behind = b || 0;
  } catch {
    // No upstream tracking
  }

  return {
    branch,
    hasChanges,
    filesChanged: files.length,
    isClean: !hasChanges,
    ahead,
    behind,
  };
}

/**
 * Get the current branch name
 */
export function getCurrentBranch(directory: string): string | null {
  try {
    return execSync('git branch --show-current', {
      cwd: directory,
      encoding: 'utf-8',
    }).trim() || null;
  } catch {
    return null;
  }
}

/**
 * Check if a branch exists locally or remotely
 */
export function branchExists(directory: string, branchName: string): boolean {
  try {
    const localBranches = execSync('git branch --list', {
      cwd: directory,
      encoding: 'utf-8',
    });
    if (localBranches.includes(branchName)) {
      return true;
    }

    const remoteBranches = execSync('git branch -r --list', {
      cwd: directory,
      encoding: 'utf-8',
    });
    if (remoteBranches.includes(`origin/${branchName}`)) {
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * Create a new branch and check it out
 */
export async function createBranch(
  directory: string,
  branchName: string,
  baseBranch?: string
): Promise<{ success: boolean; error?: GitError }> {
  const validation = validateBranchName(branchName);
  if (!validation.valid) {
    return {
      success: false,
      error: { type: 'invalid_branch_name', message: validation.error! },
    };
  }

  if (baseBranch) {
    const baseValidation = validateBranchName(baseBranch);
    if (!baseValidation.valid) {
      return {
        success: false,
        error: { type: 'invalid_branch_name', message: `Base branch: ${baseValidation.error}` },
      };
    }
  }

  if (baseBranch) {
    const checkoutResult = gitSync(['checkout', baseBranch], directory);
    if (checkoutResult.status === 0) {
      gitSync(['pull', 'origin', baseBranch], directory);
    }
  }

  const result = gitSync(['checkout', '-b', branchName], directory);
  if (result.status !== 0) {
    const message = result.stderr;
    if (message.includes('already exists')) {
      return {
        success: false,
        error: { type: 'branch_exists', message: `Branch '${branchName}' already exists` },
      };
    }
    return {
      success: false,
      error: { type: 'unknown', message },
    };
  }

  return { success: true };
}

/**
 * Checkout an existing branch
 */
export function checkoutBranch(directory: string, branchName: string): boolean {
  const validation = validateBranchName(branchName);
  if (!validation.valid) {
    return false;
  }

  const result = gitSync(['checkout', branchName], directory);
  return result.status === 0;
}

/**
 * Stage all changes and create a commit
 */
export async function createCommit(
  directory: string,
  message: string
): Promise<{ success: boolean; commitHash?: string; filesChanged?: number; error?: string }> {
  try {
    const statusResult = gitSync(['status', '--porcelain'], directory);
    const status = statusResult.stdout.trim();

    if (!status) {
      return { success: false, error: 'No changes to commit' };
    }

    const filesChanged = status.split('\n').filter(Boolean).length;

    const addResult = gitSync(['add', '-A'], directory);
    if (addResult.status !== 0) {
      return { success: false, error: addResult.stderr || 'Failed to stage changes' };
    }

    const commitResult = gitSync(['commit', '-m', message], directory);
    if (commitResult.status !== 0) {
      return { success: false, error: commitResult.stderr || 'Failed to create commit' };
    }

    const hashResult = gitSync(['rev-parse', 'HEAD'], directory);
    const commitHash = hashResult.stdout.trim();

    return { success: true, commitHash, filesChanged };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Check if GitHub CLI is installed and authenticated
 */
export function checkGitHubCLI(): { installed: boolean; authenticated: boolean; error?: string } {
  try {
    execSync('gh --version', { stdio: 'pipe' });
  } catch {
    return { installed: false, authenticated: false, error: 'GitHub CLI (gh) is not installed' };
  }

  try {
    execSync('gh auth status', { stdio: 'pipe' });
    return { installed: true, authenticated: true };
  } catch {
    return { installed: true, authenticated: false, error: 'Not authenticated with GitHub. Run: gh auth login' };
  }
}

/**
 * Push the current branch to remote
 */
export async function pushBranch(
  directory: string,
  branchName: string
): Promise<{ success: boolean; error?: string }> {
  const validation = validateBranchName(branchName);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  const result = gitSync(['push', '-u', 'origin', branchName], directory);
  if (result.status === 0) {
    return { success: true };
  }
  if (result.stderr.includes('Everything up-to-date')) {
    return { success: true };
  }
  return { success: false, error: result.stderr };
}

/**
 * Create a pull request using GitHub CLI
 */
export async function createPullRequest(
  directory: string,
  title: string,
  body: string,
  baseBranch: string = 'main'
): Promise<{ success: boolean; prUrl?: string; prNumber?: number; error?: string }> {
  try {
    const currentBranch = getCurrentBranch(directory);
    if (!currentBranch) {
      return { success: false, error: 'Not on a branch (detached HEAD)' };
    }

    if (currentBranch === baseBranch) {
      return { success: false, error: `Already on ${baseBranch} branch. Create a feature branch first.` };
    }

    const pushResult = await pushBranch(directory, currentBranch);
    if (!pushResult.success) {
      return { success: false, error: pushResult.error };
    }

    const { writeFileSync, unlinkSync } = await import('fs');
    const { join } = await import('path');
    const { tmpdir } = await import('os');

    const bodyFile = join(tmpdir(), `pr-body-${Date.now()}.md`);
    writeFileSync(bodyFile, body, 'utf-8');

    try {
      const result = ghSync(
        ['pr', 'create', '--title', title, '--body-file', bodyFile, '--base', baseBranch],
        directory
      );

      if (result.status !== 0) {
        const message = result.stderr;
        if (message.includes('already exists')) {
          return { success: false, error: 'A pull request already exists for this branch' };
        }
        return { success: false, error: message };
      }

      const prUrl = result.stdout.trim();
      const prNumberMatch = prUrl.match(/\/pull\/(\d+)$/);
      const prNumber = prNumberMatch ? parseInt(prNumberMatch[1], 10) : undefined;

      return { success: true, prUrl, prNumber };
    } finally {
      try {
        unlinkSync(bodyFile);
      } catch {
        // Ignore cleanup errors
      }
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);

    if (message.includes('already exists')) {
      return { success: false, error: 'A pull request already exists for this branch' };
    }

    return { success: false, error: message };
  }
}

/**
 * Get commit count between current branch and base
 */
export function getCommitCount(directory: string, baseBranch: string = 'main'): number {
  try {
    const result = gitSync(['rev-list', '--count', `${baseBranch}..HEAD`], directory);
    if (result.status === 0) {
      return parseInt(result.stdout.trim(), 10) || 0;
    }
    return 0;
  } catch {
    return 0;
  }
}

/**
 * Get changed files count between current branch and base
 */
export function getChangedFilesCount(directory: string, baseBranch: string = 'main'): number {
  try {
    const result = gitSync(['diff', '--name-only', `${baseBranch}...HEAD`], directory);
    if (result.status === 0) {
      const files = result.stdout.trim();
      return files ? files.split('\n').filter(Boolean).length : 0;
    }
    return 0;
  } catch {
    return 0;
  }
}

/**
 * Reset working directory to HEAD, discarding all uncommitted changes
 */
export function resetHard(directory: string): { success: boolean; error?: string } {
  const resetResult = gitSync(['reset', '--hard', 'HEAD'], directory);
  if (resetResult.status !== 0) {
    return { success: false, error: resetResult.stderr };
  }

  const cleanResult = gitSync(['clean', '-fd'], directory);
  if (cleanResult.status !== 0) {
    console.warn(`[Git] Warning: git clean failed: ${cleanResult.stderr}`);
  }

  return { success: true };
}

/**
 * Check if there are uncommitted changes in the working directory
 */
export function hasUncommittedChanges(directory: string): boolean {
  const result = gitSync(['status', '--porcelain'], directory);
  return result.stdout.trim().length > 0;
}

/**
 * Check if PR is merged using gh CLI
 */
export function checkPRMerged(
  projectPath: string,
  prUrl: string
): { merged: boolean; error?: string } {
  const prMatch = prUrl.match(/\/pull\/(\d+)/);
  if (!prMatch) {
    return { merged: false, error: 'Invalid PR URL' };
  }

  const prNumber = prMatch[1];
  const result = ghSync(['pr', 'view', prNumber, '--json', 'state,merged'], projectPath);

  if (result.status !== 0) {
    return { merged: false, error: result.stderr };
  }

  try {
    const data = JSON.parse(result.stdout);
    return { merged: data.merged === true };
  } catch {
    return { merged: false, error: 'Failed to parse PR status' };
  }
}
