/**
 * Git Operations - Re-export module
 *
 * Split into domain modules (ORC-116):
 * - git-workflow/core.ts: Basic git/gh operations
 * - git-workflow/validation.ts: Branch name validation, slug generation
 * - git-workflow/worktrees.ts: Worktree management
 *
 * This file re-exports everything for backward compatibility.
 */

export {
  gitSync,
  ghSync,
  type GitStatus,
  type GitError,
  checkGitRepo,
  getGitStatus,
  getCurrentBranch,
  branchExists,
  createBranch,
  checkoutBranch,
  createCommit,
  checkGitHubCLI,
  pushBranch,
  createPullRequest,
  getCommitCount,
  getChangedFilesCount,
  resetHard,
  hasUncommittedChanges,
  checkPRMerged,
} from './git-workflow/core';

export {
  validateBranchName,
  slugify,
  generateBranchName,
  generateSpecBranchName,
} from './git-workflow/validation';

export {
  type WorktreeInfo,
  createWorktree,
  removeWorktree,
  listWorktrees,
} from './git-workflow/worktrees';
