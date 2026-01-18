/**
 * Tests for ChunkExecutor
 *
 * Tests chunk execution via OpenCode: execute, abort, isRunning
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ChunkToolCall } from '@specwright/shared';

// Use vi.hoisted to create mocks that can be referenced in vi.mock factory
const {
  mockStartChunkExecution,
  mockAbortChunkExecution,
  mockWaitForChunkCompletion,
  mockSubscribeToExecution,
  mockHasRunningExecution,
  mockGetRunningChunkId,
} = vi.hoisted(() => ({
  mockStartChunkExecution: vi.fn(),
  mockAbortChunkExecution: vi.fn(),
  mockWaitForChunkCompletion: vi.fn(),
  mockSubscribeToExecution: vi.fn(),
  mockHasRunningExecution: vi.fn(),
  mockGetRunningChunkId: vi.fn(),
}));

// Mock dependencies before importing the module under test
vi.mock('../../execution', () => ({
  startChunkExecution: mockStartChunkExecution,
  abortChunkExecution: mockAbortChunkExecution,
  waitForChunkCompletion: mockWaitForChunkCompletion,
  subscribeToExecution: mockSubscribeToExecution,
  hasRunningExecution: mockHasRunningExecution,
  getRunningChunkId: mockGetRunningChunkId,
}));

// Import after mocks are set up
import { ChunkExecutor, type ExecutionCallbacks } from '../../services/chunk-executor';

describe('ChunkExecutor', () => {
  let chunkExecutor: ChunkExecutor;

  beforeEach(() => {
    vi.clearAllMocks();
    chunkExecutor = new ChunkExecutor();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('execute', () => {
    it('calls OpenCode API and returns ExecutionResult with status', async () => {
      mockStartChunkExecution.mockResolvedValue({ success: true });
      mockWaitForChunkCompletion.mockResolvedValue({
        status: 'completed',
        output: 'Task completed successfully',
      });

      const result = await chunkExecutor.execute('chunk-1');

      expect(result.status).toBe('completed');
      expect(result.output).toBe('Task completed successfully');
      expect(mockStartChunkExecution).toHaveBeenCalledWith('chunk-1');
    });

    it('invokes onToolCall callback', async () => {
      const mockToolCall: ChunkToolCall = {
        id: 'tc-1',
        chunkId: 'chunk-1',
        tool: 'write_file',
        input: { path: '/test/file.ts', content: 'code' },
        status: 'completed',
        startedAt: Date.now(),
      };

      mockStartChunkExecution.mockResolvedValue({ success: true });
      mockWaitForChunkCompletion.mockImplementation(
        async (chunkId, onToolCall) => {
          // Simulate tool call callback
          if (onToolCall) {
            onToolCall(mockToolCall);
          }
          return { status: 'completed', output: 'Done' };
        }
      );

      const onToolCall = vi.fn();
      const callbacks: ExecutionCallbacks = { onToolCall };

      await chunkExecutor.execute('chunk-1', callbacks);

      expect(onToolCall).toHaveBeenCalledWith(mockToolCall);
    });

    it('invokes onText callback', async () => {
      mockStartChunkExecution.mockResolvedValue({ success: true });
      mockWaitForChunkCompletion.mockImplementation(
        async (chunkId, onToolCall, onText) => {
          // Simulate text output
          if (onText) {
            onText('Processing...');
            onText('Complete!');
          }
          return { status: 'completed', output: 'Done' };
        }
      );

      const onText = vi.fn();
      const callbacks: ExecutionCallbacks = { onText };

      await chunkExecutor.execute('chunk-1', callbacks);

      expect(onText).toHaveBeenCalledWith('Processing...');
      expect(onText).toHaveBeenCalledWith('Complete!');
      expect(onText).toHaveBeenCalledTimes(2);
    });

    it('invokes onStatusChange callback', async () => {
      mockStartChunkExecution.mockResolvedValue({ success: true });
      mockWaitForChunkCompletion.mockResolvedValue({
        status: 'completed',
        output: 'Done',
      });

      const onStatusChange = vi.fn();
      const callbacks: ExecutionCallbacks = { onStatusChange };

      await chunkExecutor.execute('chunk-1', callbacks);

      // Should be called with 'running' after start, then with final status
      expect(onStatusChange).toHaveBeenCalledWith('running');
      expect(onStatusChange).toHaveBeenCalledWith('completed');
    });

    it('returns failed status when start fails', async () => {
      mockStartChunkExecution.mockResolvedValue({
        success: false,
        error: 'OpenCode server not available',
      });

      const onStatusChange = vi.fn();
      const result = await chunkExecutor.execute('chunk-1', { onStatusChange });

      expect(result.status).toBe('failed');
      expect(result.error).toBe('OpenCode server not available');
      expect(onStatusChange).toHaveBeenCalledWith('failed');
      expect(mockWaitForChunkCompletion).not.toHaveBeenCalled();
    });

    it('returns cancelled status when execution is cancelled', async () => {
      mockStartChunkExecution.mockResolvedValue({ success: true });
      mockWaitForChunkCompletion.mockResolvedValue({
        status: 'cancelled',
        output: 'Cancelled by user',
      });

      const result = await chunkExecutor.execute('chunk-1');

      expect(result.status).toBe('cancelled');
    });

    it('returns failed status with error message', async () => {
      mockStartChunkExecution.mockResolvedValue({ success: true });
      mockWaitForChunkCompletion.mockResolvedValue({
        status: 'failed',
        error: 'Execution timed out after 30 minutes',
      });

      const result = await chunkExecutor.execute('chunk-1');

      expect(result.status).toBe('failed');
      expect(result.error).toBe('Execution timed out after 30 minutes');
    });

    it('handles multiple callbacks simultaneously', async () => {
      const mockToolCall: ChunkToolCall = {
        id: 'tc-2',
        chunkId: 'chunk-1',
        tool: 'read_file',
        input: { path: '/test/file.ts' },
        status: 'completed',
        startedAt: Date.now(),
      };

      mockStartChunkExecution.mockResolvedValue({ success: true });
      mockWaitForChunkCompletion.mockImplementation(
        async (chunkId, onToolCall, onText) => {
          if (onToolCall) onToolCall(mockToolCall);
          if (onText) onText('Output text');
          return { status: 'completed', output: 'All done' };
        }
      );

      const callbacks: ExecutionCallbacks = {
        onToolCall: vi.fn(),
        onText: vi.fn(),
        onStatusChange: vi.fn(),
      };

      await chunkExecutor.execute('chunk-1', callbacks);

      expect(callbacks.onToolCall).toHaveBeenCalledWith(mockToolCall);
      expect(callbacks.onText).toHaveBeenCalledWith('Output text');
      expect(callbacks.onStatusChange).toHaveBeenCalledWith('running');
      expect(callbacks.onStatusChange).toHaveBeenCalledWith('completed');
    });
  });

  describe('abort', () => {
    it('cancels running execution', async () => {
      mockAbortChunkExecution.mockResolvedValue({ success: true });

      const result = await chunkExecutor.abort('chunk-1');

      expect(result.success).toBe(true);
      expect(mockAbortChunkExecution).toHaveBeenCalledWith('chunk-1');
    });

    it('returns success result', async () => {
      mockAbortChunkExecution.mockResolvedValue({ success: true });

      const result = await chunkExecutor.abort('chunk-2');

      expect(result).toEqual({ success: true });
    });

    it('returns error when abort fails', async () => {
      mockAbortChunkExecution.mockResolvedValue({
        success: false,
        error: 'Chunk is not running',
      });

      const result = await chunkExecutor.abort('chunk-not-running');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Chunk is not running');
    });
  });

  describe('isRunning', () => {
    it('returns true when execution in progress', () => {
      mockGetRunningChunkId.mockReturnValue('chunk-1');

      const result = chunkExecutor.isRunning('chunk-1');

      expect(result).toBe(true);
      expect(mockGetRunningChunkId).toHaveBeenCalled();
    });

    it('returns false otherwise', () => {
      mockGetRunningChunkId.mockReturnValue(null);

      const result = chunkExecutor.isRunning('chunk-1');

      expect(result).toBe(false);
    });

    it('returns false when different chunk is running', () => {
      mockGetRunningChunkId.mockReturnValue('chunk-2');

      const result = chunkExecutor.isRunning('chunk-1');

      expect(result).toBe(false);
    });
  });

  describe('hasRunningExecution', () => {
    it('returns true when any execution is running', () => {
      mockHasRunningExecution.mockReturnValue(true);

      const result = chunkExecutor.hasRunningExecution();

      expect(result).toBe(true);
      expect(mockHasRunningExecution).toHaveBeenCalled();
    });

    it('returns false when no execution is running', () => {
      mockHasRunningExecution.mockReturnValue(false);

      const result = chunkExecutor.hasRunningExecution();

      expect(result).toBe(false);
    });
  });

  describe('subscribe', () => {
    it('delegates to subscribeToExecution', () => {
      const mockUnsubscribe = vi.fn();
      mockSubscribeToExecution.mockReturnValue(mockUnsubscribe);

      const listener = vi.fn();
      const unsubscribe = chunkExecutor.subscribe('chunk-1', listener);

      expect(mockSubscribeToExecution).toHaveBeenCalledWith('chunk-1', listener);
      expect(unsubscribe).toBe(mockUnsubscribe);
    });

    it('returns unsubscribe function', () => {
      const mockUnsubscribe = vi.fn();
      mockSubscribeToExecution.mockReturnValue(mockUnsubscribe);

      const unsubscribe = chunkExecutor.subscribe('chunk-1', vi.fn());

      unsubscribe();
      expect(mockUnsubscribe).toHaveBeenCalled();
    });
  });
});
