'use client';

import { useState, useEffect, useCallback } from 'react';
import type { Worker, WorkerQueueItem } from '@specwright/shared';

interface ParallelStatus {
  workers: Worker[];
  queue: WorkerQueueItem[];
  capacity: {
    used: number;
    max: number;
    hasCapacity: boolean;
  };
  isLoading: boolean;
  error: string | null;
}

const initialStatus: ParallelStatus = {
  workers: [],
  queue: [],
  capacity: { used: 0, max: 5, hasCapacity: true },
  isLoading: true,
  error: null,
};

export function useParallelStatus(pollInterval = 3000) {
  const [status, setStatus] = useState<ParallelStatus>(initialStatus);

  const fetchStatus = useCallback(async () => {
    try {
      const response = await fetch('/api/parallel/status');
      if (!response.ok) {
        throw new Error('Failed to fetch parallel status');
      }
      const data = await response.json();
      setStatus({
        workers: data.workers || [],
        queue: data.queue || [],
        capacity: data.capacity || { used: 0, max: 5, hasCapacity: true },
        isLoading: false,
        error: null,
      });
    } catch (err) {
      setStatus(prev => ({
        ...prev,
        isLoading: false,
        error: err instanceof Error ? err.message : 'Unknown error',
      }));
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, pollInterval);
    return () => clearInterval(interval);
  }, [fetchStatus, pollInterval]);

  const pauseWorker = useCallback(async (workerId: string) => {
    await fetch(`/api/workers/${workerId}/pause`, { method: 'POST' });
    await fetchStatus();
  }, [fetchStatus]);

  const resumeWorker = useCallback(async (workerId: string) => {
    await fetch(`/api/workers/${workerId}/resume`, { method: 'POST' });
    await fetchStatus();
  }, [fetchStatus]);

  const stopWorker = useCallback(async (workerId: string) => {
    await fetch(`/api/workers/${workerId}`, { method: 'DELETE' });
    await fetchStatus();
  }, [fetchStatus]);

  const removeFromQueue = useCallback(async (queueId: string) => {
    await fetch(`/api/queue/${queueId}`, { method: 'DELETE' });
    await fetchStatus();
  }, [fetchStatus]);

  const pauseAll = useCallback(async () => {
    await fetch('/api/parallel/pause-all', { method: 'POST' });
    await fetchStatus();
  }, [fetchStatus]);

  const resumeAll = useCallback(async () => {
    await fetch('/api/parallel/resume-all', { method: 'POST' });
    await fetchStatus();
  }, [fetchStatus]);

  return {
    ...status,
    pauseWorker,
    resumeWorker,
    stopWorker,
    removeFromQueue,
    pauseAll,
    resumeAll,
    refresh: fetchStatus,
  };
}
