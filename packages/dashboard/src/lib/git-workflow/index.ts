// Domain: git-workflow
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
} from './core';

export {
  validateBranchName,
  slugify,
  generateBranchName,
  generateSpecBranchName,
} from './validation';

export {
  type WorktreeInfo,
  createWorktree,
  removeWorktree,
  listWorktrees,
} from './worktrees';
