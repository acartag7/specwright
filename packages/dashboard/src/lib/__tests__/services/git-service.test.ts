/**
 * Tests for GitService
 *
 * Tests git workflow operations: initWorkflow, commitChunk, resetHard, pushAndCreatePR, cleanup
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Spec } from '@specwright/shared';

// Mock dependencies before importing the module under test
vi.mock('fs', () => ({
  existsSync: vi.fn(),
}));

vi.mock('../../git', () => ({
  checkGitRepo: vi.fn(),
  getCurrentBranch: vi.fn(),
  createBranch: vi.fn(),
  checkoutBranch: vi.fn(),
  createCommit: vi.fn(),
  resetHard: vi.fn(),
  pushBranch: vi.fn(),
  createPullRequest: vi.fn(),
  generateSpecBranchName: vi.fn(),
  createWorktree: vi.fn(),
  removeWorktree: vi.fn(),
  getCommitCount: vi.fn(),
  getChangedFilesCount: vi.fn(),
}));

vi.mock('../../db', () => ({
  getSpec: vi.fn(),
  updateSpec: vi.fn(),
}));

vi.mock('../../db/projects', () => ({
  getProject: vi.fn(),
}));

vi.mock('../../path-validation', () => ({
  validateProjectPath: vi.fn(),
  validateAndNormalizePath: vi.fn(),
  PathValidationError: class PathValidationError extends Error {},
}));

// Import after mocks are set up
import { GitService, type GitWorkflowState } from '../../services/git-service';
import { existsSync } from 'fs';
import {
  checkGitRepo,
  getCurrentBranch,
  createBranch,
  checkoutBranch,
  createCommit,
  resetHard,
  pushBranch,
  createPullRequest,
  generateSpecBranchName,
  createWorktree,
  removeWorktree,
  getCommitCount,
  getChangedFilesCount,
} from '../../git';
import { getSpec, updateSpec } from '../../db';
import { validateProjectPath, validateAndNormalizePath, PathValidationError } from '../../path-validation';

describe('GitService', () => {
  let gitService: GitService;

  const mockSpec: Spec = {
    id: 'spec-1',
    projectId: 'project-1',
    title: 'Test Spec',
    content: 'Test content',
    version: 1,
    status: 'draft',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  const mockGitState: GitWorkflowState = {
    enabled: true,
    projectDir: '/test/project',
    workingDir: '/test/project',
    isWorktree: false,
    originalBranch: 'main',
    specBranch: 'spec/test-spec',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    gitService = new GitService();

    // Default mocks
    vi.mocked(getSpec).mockReturnValue(mockSpec);
    vi.mocked(validateProjectPath).mockReturnValue(undefined);
    vi.mocked(validateAndNormalizePath).mockReturnValue('/valid/path');
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('initWorkflow', () => {
    it('creates worktree when available', async () => {
      vi.mocked(checkGitRepo).mockReturnValue(true);
      vi.mocked(getCurrentBranch).mockReturnValue('main');
      vi.mocked(generateSpecBranchName).mockReturnValue('spec/test-spec');
      vi.mocked(createWorktree).mockReturnValue({
        success: true,
        path: '/test/project-spec-abc12345-123456789',
      });

      const result = await gitService.initWorkflow('spec-1', '/test/project');

      expect(result.enabled).toBe(true);
      expect(result.isWorktree).toBe(true);
      expect(result.workingDir).toBe('/test/project-spec-abc12345-123456789');
      expect(result.originalBranch).toBe('main');
      expect(result.specBranch).toBe('spec/test-spec');
      expect(updateSpec).toHaveBeenCalledWith('spec-1', expect.objectContaining({
        branchName: 'spec/test-spec',
        worktreePath: '/test/project-spec-abc12345-123456789',
      }));
    });

    it('falls back to branch when worktree fails', async () => {
      vi.mocked(checkGitRepo).mockReturnValue(true);
      vi.mocked(getCurrentBranch).mockReturnValue('main');
      vi.mocked(generateSpecBranchName).mockReturnValue('spec/test-spec');
      vi.mocked(createWorktree).mockReturnValue({
        success: false,
        error: 'Worktree creation failed',
      });
      vi.mocked(createBranch).mockResolvedValue({ success: true });

      const result = await gitService.initWorkflow('spec-1', '/test/project');

      expect(result.enabled).toBe(true);
      expect(result.isWorktree).toBe(false);
      expect(result.workingDir).toBe('/test/project');
      expect(result.specBranch).toBe('spec/test-spec');
      expect(createBranch).toHaveBeenCalledWith('/test/project', 'spec/test-spec', 'main');
    });

    it('returns disabled state for non-git repos', async () => {
      vi.mocked(checkGitRepo).mockReturnValue(false);

      const result = await gitService.initWorkflow('spec-1', '/test/project');

      expect(result.enabled).toBe(false);
      expect(result.isWorktree).toBe(false);
      expect(result.originalBranch).toBeNull();
      expect(result.specBranch).toBeNull();
    });

    it('returns disabled state when path validation fails', async () => {
      vi.mocked(validateProjectPath).mockImplementation(() => {
        throw new PathValidationError('Invalid path');
      });

      const result = await gitService.initWorkflow('spec-1', '/invalid/path');

      expect(result.enabled).toBe(false);
      expect(result.isWorktree).toBe(false);
    });

    it('returns disabled state when spec not found', async () => {
      vi.mocked(checkGitRepo).mockReturnValue(true);
      vi.mocked(getCurrentBranch).mockReturnValue('main');
      vi.mocked(getSpec).mockReturnValue(null);

      const result = await gitService.initWorkflow('nonexistent-spec', '/test/project');

      expect(result.enabled).toBe(false);
      expect(result.specBranch).toBeNull();
    });

    it('reuses existing worktree if valid', async () => {
      const specWithWorktree = {
        ...mockSpec,
        worktreePath: '/test/existing-worktree',
        branchName: 'spec/existing',
      };
      vi.mocked(getSpec).mockReturnValue(specWithWorktree);
      vi.mocked(checkGitRepo).mockReturnValue(true);
      vi.mocked(getCurrentBranch).mockReturnValue('main');
      vi.mocked(existsSync).mockReturnValue(true);

      const result = await gitService.initWorkflow('spec-1', '/test/project');

      expect(result.enabled).toBe(true);
      expect(result.isWorktree).toBe(true);
      expect(result.workingDir).toBe('/test/existing-worktree');
      expect(createWorktree).not.toHaveBeenCalled();
    });
  });

  describe('commitChunk', () => {
    it('stages and commits changes', async () => {
      vi.mocked(createCommit).mockResolvedValue({
        success: true,
        commitHash: 'abc123def456',
        filesChanged: 3,
      });

      const result = await gitService.commitChunk(mockGitState, 'chunk-1', 'Add feature', 0);

      expect(result.success).toBe(true);
      expect(result.commitHash).toBe('abc123def456');
      expect(result.filesChanged).toBe(3);
      expect(createCommit).toHaveBeenCalledWith('/test/project', 'chunk 1: Add feature');
    });

    it('returns commit hash on success', async () => {
      vi.mocked(createCommit).mockResolvedValue({
        success: true,
        commitHash: 'xyz789',
        filesChanged: 1,
      });

      const result = await gitService.commitChunk(mockGitState, 'chunk-2', 'Fix bug', 1);

      expect(result.success).toBe(true);
      expect(result.commitHash).toBe('xyz789');
      expect(createCommit).toHaveBeenCalledWith('/test/project', 'chunk 2: Fix bug');
    });

    it('handles no changes gracefully', async () => {
      vi.mocked(createCommit).mockResolvedValue({
        success: false,
        error: 'No changes to commit',
      });

      const result = await gitService.commitChunk(mockGitState, 'chunk-3', 'Empty', 2);

      expect(result.success).toBe(false);
      expect(result.error).toBe('No changes to commit');
    });

    it('returns error when git not enabled', async () => {
      const disabledState: GitWorkflowState = {
        ...mockGitState,
        enabled: false,
      };

      const result = await gitService.commitChunk(disabledState, 'chunk-1', 'Test', 0);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Git not enabled');
      expect(createCommit).not.toHaveBeenCalled();
    });
  });

  describe('resetHard', () => {
    it('resets to HEAD', () => {
      vi.mocked(resetHard).mockReturnValue({ success: true });

      const result = gitService.resetHard(mockGitState);

      expect(result.success).toBe(true);
      expect(resetHard).toHaveBeenCalledWith('/test/project');
    });

    it('returns success/error status', () => {
      vi.mocked(resetHard).mockReturnValue({
        success: false,
        error: 'Reset failed',
      });

      const result = gitService.resetHard(mockGitState);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Reset failed');
    });

    it('returns error when git not enabled', () => {
      const disabledState: GitWorkflowState = {
        ...mockGitState,
        enabled: false,
      };

      const result = gitService.resetHard(disabledState);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Git not enabled');
      expect(resetHard).not.toHaveBeenCalled();
    });
  });

  describe('pushAndCreatePR', () => {
    it('pushes branch to remote', async () => {
      vi.mocked(pushBranch).mockResolvedValue({ success: true });
      vi.mocked(getCommitCount).mockReturnValue(5);
      vi.mocked(getChangedFilesCount).mockReturnValue(10);
      vi.mocked(createPullRequest).mockResolvedValue({
        success: true,
        prUrl: 'https://github.com/test/repo/pull/123',
        prNumber: 123,
      });

      const result = await gitService.pushAndCreatePR(mockGitState, mockSpec, 3);

      expect(result.success).toBe(true);
      expect(pushBranch).toHaveBeenCalledWith('/test/project', 'spec/test-spec');
    });

    it('creates PR with correct body', async () => {
      vi.mocked(pushBranch).mockResolvedValue({ success: true });
      vi.mocked(getCommitCount).mockReturnValue(5);
      vi.mocked(getChangedFilesCount).mockReturnValue(10);
      vi.mocked(createPullRequest).mockResolvedValue({
        success: true,
        prUrl: 'https://github.com/test/repo/pull/456',
        prNumber: 456,
      });

      const result = await gitService.pushAndCreatePR(mockGitState, mockSpec, 3);

      expect(result.success).toBe(true);
      expect(result.prUrl).toBe('https://github.com/test/repo/pull/456');
      expect(result.prNumber).toBe(456);
      expect(createPullRequest).toHaveBeenCalledWith(
        '/test/project',
        'Test Spec',
        expect.stringContaining('Chunks completed: 3'),
        'main'
      );
    });

    it('handles gh CLI not available', async () => {
      vi.mocked(pushBranch).mockResolvedValue({ success: true });
      vi.mocked(getCommitCount).mockReturnValue(1);
      vi.mocked(getChangedFilesCount).mockReturnValue(1);
      vi.mocked(createPullRequest).mockResolvedValue({
        success: false,
        error: 'gh: command not found',
      });

      const result = await gitService.pushAndCreatePR(mockGitState, mockSpec, 1);

      expect(result.success).toBe(false);
      expect(result.error).toBe('gh: command not found');
    });

    it('returns error when push fails', async () => {
      vi.mocked(pushBranch).mockResolvedValue({
        success: false,
        error: 'Failed to push',
      });

      const result = await gitService.pushAndCreatePR(mockGitState, mockSpec, 1);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to push');
      expect(createPullRequest).not.toHaveBeenCalled();
    });

    it('returns error when git not enabled', async () => {
      const disabledState: GitWorkflowState = {
        ...mockGitState,
        enabled: false,
      };

      const result = await gitService.pushAndCreatePR(disabledState, mockSpec, 1);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Git not enabled or no branch');
      expect(pushBranch).not.toHaveBeenCalled();
    });
  });

  describe('cleanup', () => {
    it('switches back to original branch for non-worktree', async () => {
      vi.mocked(checkoutBranch).mockReturnValue(true);

      await gitService.cleanup(mockGitState);

      expect(checkoutBranch).toHaveBeenCalledWith('/test/project', 'main');
    });

    it('preserves worktree (does not remove)', async () => {
      const worktreeState: GitWorkflowState = {
        ...mockGitState,
        isWorktree: true,
        workingDir: '/test/project-spec-worktree',
      };

      await gitService.cleanup(worktreeState);

      // Should not checkout or remove - just log that worktree is preserved
      expect(checkoutBranch).not.toHaveBeenCalled();
      expect(removeWorktree).not.toHaveBeenCalled();
    });

    it('does nothing when git not enabled', async () => {
      const disabledState: GitWorkflowState = {
        ...mockGitState,
        enabled: false,
      };

      await gitService.cleanup(disabledState);

      expect(checkoutBranch).not.toHaveBeenCalled();
    });

    it('handles checkout failure gracefully', async () => {
      vi.mocked(checkoutBranch).mockReturnValue(false);

      // Should not throw
      await expect(gitService.cleanup(mockGitState)).resolves.toBeUndefined();
    });
  });

  describe('removeWorktree', () => {
    it('removes worktree successfully', () => {
      const worktreeState: GitWorkflowState = {
        ...mockGitState,
        isWorktree: true,
        workingDir: '/test/project-spec-worktree',
      };
      vi.mocked(removeWorktree).mockReturnValue({ success: true });

      const result = gitService.removeWorktree(worktreeState);

      expect(result.success).toBe(true);
      expect(removeWorktree).toHaveBeenCalledWith('/test/project', '/test/project-spec-worktree');
    });

    it('returns error for non-worktree state', () => {
      const result = gitService.removeWorktree(mockGitState);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Not a worktree');
    });
  });
});
