import { execSync, exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface GitStatus {
  branch: string;
  hasChanges: boolean;
  filesChanged: number;
  isClean: boolean;
  ahead: number;
  behind: number;
}

export interface GitError {
  type: 'not_git_repo' | 'no_gh_cli' | 'not_authenticated' | 'branch_exists' | 'no_remote' | 'unknown';
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
  // Get current branch
  const branch = execSync('git branch --show-current', {
    cwd: directory,
    encoding: 'utf-8',
  }).trim();

  // Get status (staged + unstaged)
  const status = execSync('git status --porcelain', {
    cwd: directory,
    encoding: 'utf-8',
  }).trim();

  const files = status ? status.split('\n').filter(Boolean) : [];
  const hasChanges = files.length > 0;

  // Get ahead/behind counts
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
 * Generate a branch name from spec ID and title
 */
export function generateBranchName(specId: string, title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  return `spec/${specId.slice(0, 8)}-${slug}`;
}

/**
 * Check if a branch exists locally or remotely
 */
export function branchExists(directory: string, branchName: string): boolean {
  try {
    // Check local branches
    const localBranches = execSync('git branch --list', {
      cwd: directory,
      encoding: 'utf-8',
    });
    if (localBranches.includes(branchName)) {
      return true;
    }

    // Check remote branches
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
  try {
    // If base branch specified, make sure we're on it first
    if (baseBranch) {
      try {
        execSync(`git checkout ${baseBranch}`, {
          cwd: directory,
          stdio: 'pipe',
        });
        // Pull latest
        try {
          execSync(`git pull origin ${baseBranch}`, {
            cwd: directory,
            stdio: 'pipe',
          });
        } catch {
          // Remote may not exist, continue anyway
        }
      } catch (e) {
        // May already be on the branch or branch doesn't exist, continue
      }
    }

    // Create and checkout new branch
    execSync(`git checkout -b ${branchName}`, {
      cwd: directory,
      stdio: 'pipe',
    });

    return { success: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
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
}

/**
 * Checkout an existing branch
 */
export function checkoutBranch(directory: string, branchName: string): boolean {
  try {
    execSync(`git checkout ${branchName}`, {
      cwd: directory,
      stdio: 'pipe',
    });
    return true;
  } catch {
    return false;
  }
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
 * Stage all changes and create a commit
 */
export async function createCommit(
  directory: string,
  message: string
): Promise<{ success: boolean; commitHash?: string; filesChanged?: number; error?: string }> {
  try {
    // Check for changes
    const status = execSync('git status --porcelain', {
      cwd: directory,
      encoding: 'utf-8',
    }).trim();

    if (!status) {
      return { success: false, error: 'No changes to commit' };
    }

    const filesChanged = status.split('\n').filter(Boolean).length;

    // Stage all changes
    execSync('git add -A', {
      cwd: directory,
      stdio: 'pipe',
    });

    // Create commit - use heredoc style to handle special characters
    execSync(`git commit -m "${message.replace(/"/g, '\\"').replace(/\$/g, '\\$')}"`, {
      cwd: directory,
      stdio: 'pipe',
    });

    // Get commit hash
    const commitHash = execSync('git rev-parse HEAD', {
      cwd: directory,
      encoding: 'utf-8',
    }).trim();

    return { success: true, commitHash, filesChanged };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Check if GitHub CLI is installed and authenticated
 */
export function checkGitHubCLI(): { installed: boolean; authenticated: boolean; error?: string } {
  // Check if gh is installed
  try {
    execSync('gh --version', { stdio: 'pipe' });
  } catch {
    return { installed: false, authenticated: false, error: 'GitHub CLI (gh) is not installed' };
  }

  // Check if authenticated
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
  try {
    execSync(`git push -u origin ${branchName}`, {
      cwd: directory,
      stdio: 'pipe',
    });
    return { success: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    // May already be pushed
    if (message.includes('Everything up-to-date')) {
      return { success: true };
    }
    return { success: false, error: message };
  }
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
    // Get current branch
    const currentBranch = getCurrentBranch(directory);
    if (!currentBranch) {
      return { success: false, error: 'Not on a branch (detached HEAD)' };
    }

    if (currentBranch === baseBranch) {
      return { success: false, error: `Already on ${baseBranch} branch. Create a feature branch first.` };
    }

    // Push branch first
    const pushResult = await pushBranch(directory, currentBranch);
    if (!pushResult.success) {
      return { success: false, error: pushResult.error };
    }

    // Create PR using gh CLI
    // Use a temp file for body to handle special characters
    const { writeFileSync, unlinkSync } = await import('fs');
    const { join } = await import('path');
    const { tmpdir } = await import('os');

    const bodyFile = join(tmpdir(), `pr-body-${Date.now()}.md`);
    writeFileSync(bodyFile, body, 'utf-8');

    try {
      const prUrl = execSync(
        `gh pr create --title "${title.replace(/"/g, '\\"')}" --body-file "${bodyFile}" --base ${baseBranch}`,
        {
          cwd: directory,
          encoding: 'utf-8',
        }
      ).trim();

      // Extract PR number from URL
      const prNumberMatch = prUrl.match(/\/pull\/(\d+)$/);
      const prNumber = prNumberMatch ? parseInt(prNumberMatch[1], 10) : undefined;

      return { success: true, prUrl, prNumber };
    } finally {
      // Clean up temp file
      try {
        unlinkSync(bodyFile);
      } catch {
        // Ignore cleanup errors
      }
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);

    // Check if PR already exists
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
    const count = execSync(`git rev-list --count ${baseBranch}..HEAD`, {
      cwd: directory,
      encoding: 'utf-8',
    }).trim();
    return parseInt(count, 10) || 0;
  } catch {
    return 0;
  }
}

/**
 * Get changed files count between current branch and base
 */
export function getChangedFilesCount(directory: string, baseBranch: string = 'main'): number {
  try {
    const files = execSync(`git diff --name-only ${baseBranch}...HEAD`, {
      cwd: directory,
      encoding: 'utf-8',
    }).trim();
    return files ? files.split('\n').filter(Boolean).length : 0;
  } catch {
    return 0;
  }
}
