/**
 * Tests for ReviewService
 *
 * Tests chunk reviews, final spec reviews, fix chunk creation, and retry logic
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Chunk, Spec } from '@specwright/shared';

// Use vi.hoisted to create mocks that can be referenced in vi.mock factory
const { mockClaudeExecute, mockGetDb } = vi.hoisted(() => ({
  mockClaudeExecute: vi.fn(),
  mockGetDb: vi.fn(),
}));

// Mock dependencies before importing the module under test
vi.mock('@specwright/mcp/client', () => ({
  ClaudeClient: vi.fn().mockImplementation(() => ({
    execute: mockClaudeExecute,
  })),
}));

vi.mock('../../db', () => ({
  getChunk: vi.fn(),
  updateChunk: vi.fn(),
  insertFixChunk: vi.fn(),
  getSpec: vi.fn(),
  getChunksBySpec: vi.fn(),
}));

vi.mock('../../db/projects', () => ({
  getProject: vi.fn(),
}));

vi.mock('../../db/connection', () => ({
  getDb: mockGetDb,
  generateId: vi.fn().mockReturnValue('generated-id'),
}));

vi.mock('../../prompts', () => ({
  buildReviewPrompt: vi.fn().mockReturnValue('chunk review prompt'),
  buildEnhancedReviewPrompt: vi.fn().mockReturnValue('enhanced chunk review prompt'),
  parseReviewResult: vi.fn(),
}));

vi.mock('../../review', () => ({
  classifyError: vi.fn().mockReturnValue('unknown'),
  // Default implementation: just execute the function once
  retryWithBackoff: vi.fn().mockImplementation(async (fn) => fn()),
}));

// Import after mocks are set up
import { ReviewService } from '../../services/review-service';
import { getChunk, updateChunk, insertFixChunk, getSpec, getChunksBySpec } from '../../db';
import { parseReviewResult } from '../../prompts';
import { classifyError, retryWithBackoff } from '../../review';

describe('ReviewService', () => {
  let reviewService: ReviewService;

  const mockChunk: Chunk = {
    id: 'chunk-1',
    specId: 'spec-1',
    title: 'Test Chunk',
    description: 'Test description',
    order: 0,
    status: 'running',
    dependencies: [],
  };

  const mockSpec: Spec = {
    id: 'spec-1',
    projectId: 'project-1',
    title: 'Test Spec',
    content: 'Test spec content',
    version: 1,
    status: 'in_progress',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  const mockChunks: Chunk[] = [
    {
      id: 'chunk-1',
      specId: 'spec-1',
      title: 'Chunk 1',
      description: 'First chunk',
      order: 0,
      status: 'completed',
      dependencies: [],
      reviewStatus: 'pass',
      outputSummary: 'Created main feature',
    },
    {
      id: 'chunk-2',
      specId: 'spec-1',
      title: 'Chunk 2',
      description: 'Second chunk',
      order: 1,
      status: 'completed',
      dependencies: ['chunk-1'],
      reviewStatus: 'pass',
      outputSummary: 'Added tests',
    },
  ];

  // Mock database statement
  const mockStmt = {
    run: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    reviewService = new ReviewService({
      chunkModel: 'haiku',
      finalModel: 'opus',
      maxRetries: 3,
      retryBackoffMs: 100,
    });

    // Default mocks
    vi.mocked(getChunk).mockReturnValue(mockChunk);
    vi.mocked(getSpec).mockReturnValue(mockSpec);
    vi.mocked(getChunksBySpec).mockReturnValue(mockChunks);
    mockGetDb.mockReturnValue({
      prepare: vi.fn().mockReturnValue(mockStmt),
    });

    // Reset retryWithBackoff to default implementation (call the function once)
    vi.mocked(retryWithBackoff).mockImplementation(async (fn) => fn());
  });

  afterEach(() => {
    // Only clear call history, don't reset implementations
    // vi.resetAllMocks() would break the ClaudeClient mock factory
  });

  describe('reviewChunk', () => {
    it('calls Claude with correct model and updates chunk with result', async () => {
      const mockExecuteResult = {
        success: true,
        output: '{"status": "pass", "feedback": "Good work"}',
      };

      // Mock retryWithBackoff to just call the function once
      vi.mocked(retryWithBackoff).mockImplementation(async (fn) => fn());
      mockClaudeExecute.mockResolvedValue(mockExecuteResult);
      vi.mocked(parseReviewResult).mockReturnValue({
        status: 'pass',
        feedback: 'Good work',
      });

      const result = await reviewService.reviewChunk('chunk-1');

      expect(result.status).toBe('pass');
      expect(result.feedback).toBe('Good work');
      expect(updateChunk).toHaveBeenCalledWith('chunk-1', {
        reviewStatus: 'pass',
        reviewFeedback: 'Good work',
      });
    });

    it('logs to review_logs table', async () => {
      vi.mocked(retryWithBackoff).mockImplementation(async (fn) => fn());
      mockClaudeExecute.mockResolvedValue({
        success: true,
        output: '{"status": "pass", "feedback": "LGTM"}',
      });
      vi.mocked(parseReviewResult).mockReturnValue({
        status: 'pass',
        feedback: 'LGTM',
      });

      await reviewService.reviewChunk('chunk-1');

      // Check that db.prepare was called for logging
      const db = mockGetDb();
      expect(db.prepare).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO review_logs')
      );
      expect(mockStmt.run).toHaveBeenCalled();
    });

    it('retries on rate limit, respects maxRetries config', async () => {
      // Mock retryWithBackoff to execute the function once (simulating successful retry)
      vi.mocked(retryWithBackoff).mockImplementation(async (fn) => fn());

      mockClaudeExecute.mockResolvedValue({
        success: true,
        output: '{"status": "pass", "feedback": "Success after retry"}',
      });
      vi.mocked(parseReviewResult).mockReturnValue({
        status: 'pass',
        feedback: 'Success after retry',
      });

      const result = await reviewService.reviewChunk('chunk-1');

      expect(result.status).toBe('pass');
      // Verify retryWithBackoff was called with correct config (maxRetries: 3, backoffMs: 100)
      expect(retryWithBackoff).toHaveBeenCalledWith(
        expect.any(Function),
        expect.objectContaining({
          maxRetries: 3,
          backoffMs: 100,
        })
      );
    });

    it('respects custom maxRetries config', async () => {
      const customService = new ReviewService({
        maxRetries: 5,
        retryBackoffMs: 200,
      });

      mockClaudeExecute.mockResolvedValue({
        success: true,
        output: '{"status": "pass", "feedback": "OK"}',
      });
      vi.mocked(parseReviewResult).mockReturnValue({
        status: 'pass',
        feedback: 'OK',
      });

      await customService.reviewChunk('chunk-1');

      expect(retryWithBackoff).toHaveBeenCalledWith(
        expect.any(Function),
        expect.objectContaining({
          maxRetries: 5,
          backoffMs: 200,
        })
      );
    });

    it('returns error when chunk not found', async () => {
      vi.mocked(getChunk).mockReturnValue(null);

      const result = await reviewService.reviewChunk('nonexistent');

      expect(result.status).toBe('error');
      expect(result.error).toBe('Chunk not found');
      expect(result.errorType).toBe('unknown');
    });

    it('returns error when spec not found', async () => {
      vi.mocked(getSpec).mockReturnValue(null);

      const result = await reviewService.reviewChunk('chunk-1');

      expect(result.status).toBe('error');
      expect(result.error).toBe('Spec not found');
    });

    it('creates fix chunk when review returns needs_fix', async () => {
      mockClaudeExecute.mockResolvedValue({
        success: true,
        output: '{"status": "needs_fix", "feedback": "Missing tests", "fixChunk": {"title": "Add tests", "description": "Add unit tests"}}',
      });
      vi.mocked(parseReviewResult).mockReturnValue({
        status: 'needs_fix',
        feedback: 'Missing tests',
        fixChunk: { title: 'Add tests', description: 'Add unit tests' },
      });
      vi.mocked(insertFixChunk).mockReturnValue({
        id: 'fix-chunk-1',
        specId: 'spec-1',
        title: 'Add tests',
        description: 'Add unit tests',
        order: 1,
        status: 'pending',
        dependencies: ['chunk-1'],
      });

      const result = await reviewService.reviewChunk('chunk-1');

      expect(result.status).toBe('needs_fix');
      expect(result.fixChunkId).toBe('fix-chunk-1');
      expect(insertFixChunk).toHaveBeenCalledWith('chunk-1', {
        title: 'Add tests',
        description: 'Add unit tests',
      });
    });
  });

  describe('reviewSpecFinal', () => {
    it('uses Opus model for final review', async () => {
      // The service uses its own parseFinalReviewResult, so we need valid JSON output
      mockClaudeExecute.mockResolvedValue({
        success: true,
        output: '{"status": "pass", "feedback": "All good"}',
      });

      const result = await reviewService.reviewSpecFinal('spec-1');

      expect(result.status).toBe('pass');
      expect(result.feedback).toBe('All good');
    });

    it('includes all chunk summaries in prompt', async () => {
      mockClaudeExecute.mockResolvedValue({
        success: true,
        output: '{"status": "pass", "feedback": "Complete"}',
      });

      await reviewService.reviewSpecFinal('spec-1');

      // The service should have retrieved chunks
      expect(getChunksBySpec).toHaveBeenCalledWith('spec-1');
    });

    it('returns fix chunks when needed', async () => {
      // The service parses JSON with its private parseFinalReviewResult method
      mockClaudeExecute.mockResolvedValue({
        success: true,
        output: JSON.stringify({
          status: 'needs_fix',
          feedback: 'Integration issues found',
          integrationIssues: ['Components not connected'],
          fixChunks: [
            { title: 'Connect components', description: 'Wire up state management' },
          ],
        }),
      });

      const result = await reviewService.reviewSpecFinal('spec-1');

      expect(result.status).toBe('needs_fix');
      expect(result.fixChunks).toBeDefined();
      expect(result.fixChunks).toHaveLength(1);
      expect(result.fixChunks?.[0].title).toBe('Connect components');
    });

    it('returns error when spec not found', async () => {
      vi.mocked(getSpec).mockReturnValue(null);

      const result = await reviewService.reviewSpecFinal('nonexistent');

      expect(result.status).toBe('error');
      expect(result.error).toBe('Spec not found');
    });

    it('returns error when no chunks found', async () => {
      vi.mocked(getChunksBySpec).mockReturnValue([]);

      const result = await reviewService.reviewSpecFinal('spec-1');

      expect(result.status).toBe('error');
      expect(result.error).toBe('No chunks found');
    });

    it('handles timeout gracefully', async () => {
      vi.mocked(retryWithBackoff).mockRejectedValue(new Error('Request timeout'));
      vi.mocked(classifyError).mockReturnValue('timeout');

      const result = await reviewService.reviewSpecFinal('spec-1');

      expect(result.status).toBe('error');
      expect(result.errorType).toBe('timeout');
    });
  });

  describe('createFixChunks', () => {
    it('creates chunks with correct order', async () => {
      const fixes = [
        { title: 'Fix 1', description: 'First fix' },
        { title: 'Fix 2', description: 'Second fix' },
      ];

      vi.mocked(insertFixChunk)
        .mockReturnValueOnce({
          id: 'fix-1',
          specId: 'spec-1',
          title: 'Fix 1',
          description: 'First fix',
          order: 2,
          status: 'pending',
          dependencies: ['chunk-2'],
        })
        .mockReturnValueOnce({
          id: 'fix-2',
          specId: 'spec-1',
          title: 'Fix 2',
          description: 'Second fix',
          order: 3,
          status: 'pending',
          dependencies: ['fix-1'],
        });

      const result = await reviewService.createFixChunks('spec-1', fixes);

      expect(result).toHaveLength(2);
      expect(result).toContain('fix-1');
      expect(result).toContain('fix-2');
      expect(insertFixChunk).toHaveBeenCalledTimes(2);
    });

    it('links to spec correctly (uses last chunk as parent)', async () => {
      const fixes = [{ title: 'Integration fix', description: 'Fix integration issues' }];

      vi.mocked(insertFixChunk).mockReturnValue({
        id: 'fix-int',
        specId: 'spec-1',
        title: 'Integration fix',
        description: 'Fix integration issues',
        order: 2,
        status: 'pending',
        dependencies: ['chunk-2'],
      });

      await reviewService.createFixChunks('spec-1', fixes);

      // Should link to last chunk (chunk-2)
      expect(insertFixChunk).toHaveBeenCalledWith('chunk-2', {
        title: 'Integration fix',
        description: 'Fix integration issues',
      });
    });

    it('returns chunk IDs', async () => {
      const fixes = [
        { title: 'Fix A', description: 'Description A' },
        { title: 'Fix B', description: 'Description B' },
        { title: 'Fix C', description: 'Description C' },
      ];

      vi.mocked(insertFixChunk)
        .mockReturnValueOnce({ id: 'fix-a', specId: 'spec-1', title: 'Fix A', description: '', order: 2, status: 'pending', dependencies: [] })
        .mockReturnValueOnce({ id: 'fix-b', specId: 'spec-1', title: 'Fix B', description: '', order: 3, status: 'pending', dependencies: [] })
        .mockReturnValueOnce({ id: 'fix-c', specId: 'spec-1', title: 'Fix C', description: '', order: 4, status: 'pending', dependencies: [] });

      const result = await reviewService.createFixChunks('spec-1', fixes);

      expect(result).toEqual(['fix-a', 'fix-b', 'fix-c']);
    });

    it('returns empty array when no chunks exist', async () => {
      vi.mocked(getChunksBySpec).mockReturnValue([]);

      const fixes = [{ title: 'Fix', description: 'Description' }];
      const result = await reviewService.createFixChunks('spec-1', fixes);

      expect(result).toEqual([]);
      expect(insertFixChunk).not.toHaveBeenCalled();
    });

    it('supports targetChunkIndex for specific chunk targeting', async () => {
      const fixes = [
        { title: 'Fix chunk 1', description: 'Fix for first chunk', targetChunkIndex: 0 },
      ];

      vi.mocked(insertFixChunk).mockReturnValue({
        id: 'fix-targeted',
        specId: 'spec-1',
        title: 'Fix chunk 1',
        description: 'Fix for first chunk',
        order: 2,
        status: 'pending',
        dependencies: ['chunk-1'],
      });

      await reviewService.createFixChunks('spec-1', fixes);

      // Should link to chunk at index 0 (chunk-1)
      expect(insertFixChunk).toHaveBeenCalledWith('chunk-1', {
        title: 'Fix chunk 1',
        description: 'Fix for first chunk',
      });
    });

    it('supports parentChunkId for explicit parent linking', async () => {
      const fixes = [
        { title: 'Fix specific', description: 'Fix for specific chunk', parentChunkId: 'chunk-1' },
      ];

      vi.mocked(insertFixChunk).mockReturnValue({
        id: 'fix-explicit',
        specId: 'spec-1',
        title: 'Fix specific',
        description: 'Fix for specific chunk',
        order: 2,
        status: 'pending',
        dependencies: ['chunk-1'],
      });

      await reviewService.createFixChunks('spec-1', fixes);

      // Should use explicit parentChunkId
      expect(insertFixChunk).toHaveBeenCalledWith('chunk-1', {
        title: 'Fix specific',
        description: 'Fix for specific chunk',
      });
    });
  });
});
