'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { ReviewResult } from '@specwright/shared';
import {
  POLL_INTERVAL_MS,
  hasStatusChanged,
  INITIAL_EXECUTION_STATE,
  type ExecutionState,
  type UseExecutionReturn,
  type UseExecutionProps,
} from '@/lib/execution/manager';

// Re-export types for consumers
export type { ExecutionState, UseExecutionReturn, UseExecutionProps } from '@/lib/execution/manager';

/**
 * Hook for managing chunk execution with live SSE monitoring and automatic status polling.
 */
export function useExecution(props: UseExecutionProps = {}): UseExecutionReturn {
  const { specId, chunks, spec, onChunksUpdate, onSpecUpdate } = props;
  const [state, setState] = useState<ExecutionState>(INITIAL_EXECUTION_STATE);

  const [isPolling, setIsPolling] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const eventSourceRef = useRef<EventSource | null>(null);
  const watchingChunkIdRef = useRef<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const shouldPoll = useMemo(() => {
    if (!chunks || !spec) return false;
    return spec.status === 'running' || chunks.some(chunk => chunk.status === 'running');
  }, [chunks, spec]);

  const cleanup = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    watchingChunkIdRef.current = null;
  }, []);

  // Polling useEffect for chunk status updates
  useEffect(() => {
    if (!shouldPoll || !specId) return;

    let isMounted = true;
    let intervalId: NodeJS.Timeout;

    const poll = async () => {
      if (!isMounted) return;
      if (document.visibilityState === 'hidden') return;

      abortControllerRef.current?.abort();
      abortControllerRef.current = new AbortController();

      try {
        const response = await fetch(`/api/specs/${specId}`, {
          signal: abortControllerRef.current.signal
        });

        if (!response.ok) {
          if (response.status === 404 || response.status === 401 || response.status === 403) {
            console.error('Polling stopped: spec not found or auth error');
            clearInterval(intervalId);
            abortControllerRef.current?.abort();
            setIsPolling(false);
            return;
          }
          throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();

        if (isMounted) {
          if (!data.chunks) return;

          const newChunks = data.chunks;
          const newSpec = data.spec || { status: spec?.status };

          let hasChanges = false;

          if (hasStatusChanged(chunks || [], newChunks)) {
            onChunksUpdate?.(newChunks);
            hasChanges = true;
          }

          if (spec && newSpec && spec.status !== newSpec.status) {
            onSpecUpdate?.(newSpec);
            hasChanges = true;
          }

          if (hasChanges) {
            setLastUpdate(new Date());
          }
        }
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') return;
        console.error('Polling error:', error);
      }
    };

    poll();
    setIsPolling(true);
    intervalId = setInterval(poll, POLL_INTERVAL_MS);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        poll();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      isMounted = false;
      abortControllerRef.current?.abort();
      clearInterval(intervalId);
      setIsPolling(false);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [specId, shouldPoll, chunks, spec, onChunksUpdate, onSpecUpdate]);

  // Watch a chunk's execution via SSE
  const watchChunk = useCallback((chunkId: string) => {
    cleanup();
    watchingChunkIdRef.current = chunkId;

    const eventSource = new EventSource(`/api/chunks/${chunkId}/events`);
    eventSourceRef.current = eventSource;

    eventSource.addEventListener('init', (e) => {
      try {
        const data = JSON.parse(e.data);
        setState({
          isRunning: data.chunk.status === 'running',
          chunkId,
          status: data.chunk.status,
          toolCalls: data.toolCalls || [],
          output: data.chunk.output || '',
          error: data.chunk.error || null,
          startedAt: Date.now(),
          isReviewing: false,
          reviewResult: null,
          fixChunkId: null,
        });
      } catch (err) {
        console.error('Error parsing init event:', err);
      }
    });

    eventSource.addEventListener('status', (e) => {
      try {
        const data = JSON.parse(e.data);
        setState(prev => ({
          ...prev,
          status: data.status,
          isRunning: data.status === 'running',
        }));
      } catch (err) {
        console.error('Error parsing status event:', err);
      }
    });

    eventSource.addEventListener('tool_call', (e) => {
      try {
        const data = JSON.parse(e.data);
        setState(prev => {
          const existingIndex = prev.toolCalls.findIndex(tc => tc.id === data.toolCall.id);
          if (existingIndex >= 0) {
            const newToolCalls = [...prev.toolCalls];
            newToolCalls[existingIndex] = data.toolCall;
            return { ...prev, toolCalls: newToolCalls };
          } else {
            return { ...prev, toolCalls: [...prev.toolCalls, data.toolCall] };
          }
        });
      } catch (err) {
        console.error('Error parsing tool_call event:', err);
      }
    });

    eventSource.addEventListener('text', (e) => {
      try {
        const data = JSON.parse(e.data);
        setState(prev => ({
          ...prev,
          output: prev.output + data.text,
        }));
      } catch (err) {
        console.error('Error parsing text event:', err);
      }
    });

    eventSource.addEventListener('complete', (e) => {
      try {
        const data = JSON.parse(e.data);
        setState(prev => ({
          ...prev,
          isRunning: false,
          status: 'completed',
          output: data.output || prev.output,
        }));
        cleanup();
      } catch (err) {
        console.error('Error parsing complete event:', err);
      }
    });

    eventSource.addEventListener('error', (e) => {
      if (e instanceof MessageEvent) {
        try {
          const data = JSON.parse(e.data);
          setState(prev => ({
            ...prev,
            isRunning: false,
            status: 'failed',
            error: data.error,
          }));
        } catch {
          // Connection error
        }
      }
      cleanup();
    });

    eventSource.onerror = () => {
      cleanup();
    };
  }, [cleanup]);

  const stopWatching = useCallback(() => {
    cleanup();
    setState(INITIAL_EXECUTION_STATE);
  }, [cleanup]);

  const runChunk = useCallback(async (chunkId: string) => {
    try {
      const response = await fetch(`/api/chunks/${chunkId}/run`, {
        method: 'POST',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to start execution');
      }

      setState({
        isRunning: true,
        chunkId,
        status: 'running',
        toolCalls: [],
        output: '',
        error: null,
        startedAt: Date.now(),
        isReviewing: false,
        reviewResult: null,
        fixChunkId: null,
      });

      setTimeout(() => watchChunk(chunkId), 100);
    } catch (err) {
      setState(prev => ({
        ...prev,
        isRunning: false,
        error: err instanceof Error ? err.message : 'Failed to start execution',
      }));
      throw err;
    }
  }, [watchChunk]);

  const abortChunk = useCallback(async (chunkId: string) => {
    try {
      const response = await fetch(`/api/chunks/${chunkId}/abort`, {
        method: 'POST',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to abort execution');
      }

      setState(prev => ({
        ...prev,
        isRunning: false,
        status: 'cancelled',
        error: 'Execution cancelled by user',
      }));

      cleanup();
    } catch (err) {
      throw err;
    }
  }, [cleanup]);

  useEffect(() => {
    return () => cleanup();
  }, [cleanup]);

  const reviewChunk = useCallback(async (chunkId: string): Promise<ReviewResult | null> => {
    try {
      setState(prev => ({
        ...prev,
        isReviewing: true,
        reviewResult: null,
        fixChunkId: null,
      }));

      const response = await fetch(`/api/chunks/${chunkId}/review`, {
        method: 'POST',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to review chunk');
      }

      const result = await response.json();

      setState(prev => ({
        ...prev,
        isReviewing: false,
        reviewResult: {
          status: result.status,
          feedback: result.feedback,
          fixChunk: result.fixChunk,
        },
        fixChunkId: result.fixChunkId || null,
      }));

      return result;
    } catch (err) {
      setState(prev => ({
        ...prev,
        isReviewing: false,
        error: err instanceof Error ? err.message : 'Failed to review chunk',
      }));
      return null;
    }
  }, []);

  const clearReview = useCallback(() => {
    setState(prev => ({
      ...prev,
      reviewResult: null,
      fixChunkId: null,
    }));
  }, []);

  return {
    state,
    runChunk,
    abortChunk,
    watchChunk,
    stopWatching,
    reviewChunk,
    clearReview,
    isPolling,
    lastUpdate,
  };
}
