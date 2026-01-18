/**
 * Tests for ValidationService
 *
 * Tests chunk validation: file changes detection, build validation, auto-fail conditions
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock dependencies before importing the module under test
vi.mock('../../review-validation', () => ({
  validateChunkCompletion: vi.fn(),
}));

// Import after mocks are set up
import { ValidationService, type ValidationResult } from '../../services/validation-service';
import { validateChunkCompletion } from '../../review-validation';

describe('ValidationService', () => {
  let validationService: ValidationService;

  beforeEach(() => {
    vi.clearAllMocks();
    validationService = new ValidationService();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('validate', () => {
    it('returns valid=true with filesChanged count when changes exist', async () => {
      const mockResult: ValidationResult = {
        success: true,
        filesChanged: 5,
        filesChangedList: ['file1.ts', 'file2.ts', 'file3.ts', 'file4.ts', 'file5.ts'],
        gitDiff: '+10 -5 in 5 files',
        buildResult: {
          success: true,
          output: 'Build successful',
          exitCode: 0,
        },
      };
      vi.mocked(validateChunkCompletion).mockResolvedValue(mockResult);

      const result = await validationService.validate('chunk-1', '/test/project');

      expect(result.success).toBe(true);
      expect(result.filesChanged).toBe(5);
      expect(result.filesChangedList).toHaveLength(5);
      expect(result.buildResult.success).toBe(true);
      expect(result.autoFail).toBeUndefined();
      expect(validateChunkCompletion).toHaveBeenCalledWith('/test/project', 'chunk-1', {});
    });

    it('returns autoFail with reason=no_changes when no files changed', async () => {
      const mockResult: ValidationResult = {
        success: false,
        filesChanged: 0,
        filesChangedList: [],
        gitDiff: 'No changes',
        buildResult: {
          success: true,
          output: 'Skipped - no changes to build',
          exitCode: 0,
        },
        autoFail: {
          reason: 'no_changes',
          feedback: 'No code changes were made. The AI assistant may have output text without actually implementing the task.',
        },
      };
      vi.mocked(validateChunkCompletion).mockResolvedValue(mockResult);

      const result = await validationService.validate('chunk-2', '/test/project');

      expect(result.success).toBe(false);
      expect(result.filesChanged).toBe(0);
      expect(result.autoFail).toBeDefined();
      expect(result.autoFail?.reason).toBe('no_changes');
      expect(result.autoFail?.feedback).toContain('No code changes');
    });

    it('returns autoFail with reason=build_failed when build fails', async () => {
      const mockResult: ValidationResult = {
        success: false,
        filesChanged: 3,
        filesChangedList: ['src/index.ts', 'src/utils.ts', 'src/types.ts'],
        gitDiff: '+50 -10 in 3 files',
        buildResult: {
          success: false,
          output: 'Error: Cannot find module ./missing',
          exitCode: 1,
        },
        autoFail: {
          reason: 'build_failed',
          feedback: 'Build failed with exit code 1. Errors:\nError: Cannot find module ./missing',
        },
      };
      vi.mocked(validateChunkCompletion).mockResolvedValue(mockResult);

      const result = await validationService.validate('chunk-3', '/test/project');

      expect(result.success).toBe(false);
      expect(result.filesChanged).toBe(3);
      expect(result.buildResult.success).toBe(false);
      expect(result.buildResult.exitCode).toBe(1);
      expect(result.autoFail).toBeDefined();
      expect(result.autoFail?.reason).toBe('build_failed');
      expect(result.autoFail?.feedback).toContain('Build failed');
    });

    it('returns buildSuccess status correctly', async () => {
      const mockResultSuccess: ValidationResult = {
        success: true,
        filesChanged: 2,
        filesChangedList: ['file1.ts', 'file2.ts'],
        gitDiff: '+20 -5',
        buildResult: {
          success: true,
          output: 'Compiled successfully',
          exitCode: 0,
        },
      };
      vi.mocked(validateChunkCompletion).mockResolvedValue(mockResultSuccess);

      const resultSuccess = await validationService.validate('chunk-4', '/test/project');
      expect(resultSuccess.buildResult.success).toBe(true);
      expect(resultSuccess.buildResult.exitCode).toBe(0);

      // Now test with failed build
      const mockResultFailed: ValidationResult = {
        success: false,
        filesChanged: 2,
        filesChangedList: ['file1.ts', 'file2.ts'],
        gitDiff: '+20 -5',
        buildResult: {
          success: false,
          output: 'Type error in file1.ts',
          exitCode: 2,
        },
        autoFail: {
          reason: 'build_failed',
          feedback: 'Build failed',
        },
      };
      vi.mocked(validateChunkCompletion).mockResolvedValue(mockResultFailed);

      const resultFailed = await validationService.validate('chunk-5', '/test/project');
      expect(resultFailed.buildResult.success).toBe(false);
      expect(resultFailed.buildResult.exitCode).toBe(2);
    });

    it('passes options to validateChunkCompletion', async () => {
      const mockResult: ValidationResult = {
        success: true,
        filesChanged: 1,
        filesChangedList: ['test.ts'],
        gitDiff: '+5 -0',
        buildResult: {
          success: true,
          output: 'Build skipped',
          exitCode: 0,
        },
      };
      vi.mocked(validateChunkCompletion).mockResolvedValue(mockResult);

      await validationService.validate('chunk-6', '/test/project', {
        skipBuild: true,
        buildTimeout: 60000,
      });

      expect(validateChunkCompletion).toHaveBeenCalledWith('/test/project', 'chunk-6', {
        skipBuild: true,
        buildTimeout: 60000,
      });
    });

    it('handles validation_error autoFail reason', async () => {
      const mockResult: ValidationResult = {
        success: false,
        filesChanged: 0,
        filesChangedList: [],
        gitDiff: '',
        buildResult: {
          success: false,
          output: '',
          exitCode: -1,
        },
        autoFail: {
          reason: 'validation_error',
          feedback: 'Failed to check git status: fatal: not a git repository',
        },
      };
      vi.mocked(validateChunkCompletion).mockResolvedValue(mockResult);

      const result = await validationService.validate('chunk-7', '/not-a-repo');

      expect(result.success).toBe(false);
      expect(result.autoFail?.reason).toBe('validation_error');
      expect(result.autoFail?.feedback).toContain('git status');
    });

    it('returns detailed git diff summary', async () => {
      const diffContent = `
 src/index.ts   | 10 +++++++---
 src/utils.ts   |  5 +++++
 2 files changed, 12 insertions(+), 3 deletions(-)
      `.trim();

      const mockResult: ValidationResult = {
        success: true,
        filesChanged: 2,
        filesChangedList: ['src/index.ts', 'src/utils.ts'],
        gitDiff: diffContent,
        buildResult: {
          success: true,
          output: 'OK',
          exitCode: 0,
        },
      };
      vi.mocked(validateChunkCompletion).mockResolvedValue(mockResult);

      const result = await validationService.validate('chunk-8', '/test/project');

      expect(result.gitDiff).toBe(diffContent);
      expect(result.gitDiff).toContain('insertions');
      expect(result.gitDiff).toContain('deletions');
    });
  });
});
