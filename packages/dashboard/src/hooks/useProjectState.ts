'use client';

import { useState, useEffect, useCallback } from 'react';
import type { StateSnapshot, ActivityEntry } from '@specwright/shared';

interface UseProjectStateReturn {
  state: StateSnapshot | null;
  isLoading: boolean;
  error: string | null;
  updateState: (data: Partial<StateUpdateInput>) => Promise<StateSnapshot | null>;
  addActivity: (entry: Omit<ActivityEntry, 'date'> & { date?: string }) => Promise<StateSnapshot | null>;
  refetch: () => Promise<void>;
}

interface StateUpdateInput {
  currentPhaseId: string | null;
  currentSpecId: string | null;
  currentChunkId: string | null;
  recentActivity: ActivityEntry[];
  blockers: string[];
  notes: string;
}

export function useProjectState(projectId: string): UseProjectStateReturn {
  const [state, setState] = useState<StateSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const baseUrl = `/api/projects/${projectId}/state`;

  const fetchState = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const res = await fetch(baseUrl);
      if (!res.ok) throw new Error('Failed to fetch state');
      const data = await res.json();
      setState(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  }, [baseUrl]);

  useEffect(() => {
    fetchState();
  }, [fetchState]);

  const updateState = useCallback(async (data: Partial<StateUpdateInput>): Promise<StateSnapshot | null> => {
    try {
      const res = await fetch(baseUrl, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Failed to update state');
      const updated = await res.json();
      setState(updated);
      return updated;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update');
      return null;
    }
  }, [baseUrl]);

  const addActivity = useCallback(async (
    entry: Omit<ActivityEntry, 'date'> & { date?: string },
  ): Promise<StateSnapshot | null> => {
    try {
      const res = await fetch(`${baseUrl}/activity`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: entry.date ?? new Date().toISOString().split('T')[0],
          description: entry.description,
          type: entry.type,
        }),
      });
      if (!res.ok) throw new Error('Failed to add activity');
      const updated = await res.json();
      setState(updated);
      return updated;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add activity');
      return null;
    }
  }, [baseUrl]);

  return {
    state,
    isLoading,
    error,
    updateState,
    addActivity,
    refetch: fetchState,
  };
}
