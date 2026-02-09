'use client';

import { useState, useEffect, useCallback } from 'react';
import type { MetaSpec, Phase, PhaseStatus } from '@specwright/shared';

interface UseMetaSpecReturn {
  metaSpec: MetaSpec | null;
  isLoading: boolean;
  error: string | null;
  // CRUD
  createMetaSpec: (data: MetaSpecInput) => Promise<MetaSpec | null>;
  updateMetaSpec: (data: Partial<MetaSpecInput>) => Promise<MetaSpec | null>;
  deleteMetaSpec: () => Promise<boolean>;
  // Phase operations
  createPhase: (data: PhaseInput) => Promise<Phase | null>;
  updatePhase: (phaseId: string, data: Partial<PhaseInput & { status: PhaseStatus }>) => Promise<Phase | null>;
  deletePhase: (phaseId: string) => Promise<boolean>;
  reorderPhases: (phaseIds: string[]) => Promise<void>;
  // AI operations
  suggestPhases: (vision: string) => Promise<SuggestedPhase[] | null>;
  improveSection: (section: string, content: string) => Promise<string | null>;
  generateFromSpecs: () => Promise<GeneratedMetaSpec | null>;
  // State
  isSaving: boolean;
  isAiLoading: boolean;
  refetch: () => Promise<void>;
}

interface MetaSpecInput {
  vision: string;
  architecture: string;
  constraints: string;
  nonGoals: string;
}

interface PhaseInput {
  name: string;
  description?: string;
  successCriteria?: string[];
  orderIndex?: number;
}

interface SuggestedPhase {
  name: string;
  description: string;
  successCriteria: string[];
}

interface GeneratedMetaSpec {
  vision: string;
  architecture: string;
  constraints: string;
  nonGoals: string;
  phases: SuggestedPhase[];
}

export function useMetaSpec(projectId: string): UseMetaSpecReturn {
  const [metaSpec, setMetaSpec] = useState<MetaSpec | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isAiLoading, setIsAiLoading] = useState(false);

  const baseUrl = `/api/projects/${projectId}/meta-spec`;

  const fetchMetaSpec = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const res = await fetch(baseUrl);
      if (res.status === 404) {
        setMetaSpec(null);
        return;
      }
      if (!res.ok) throw new Error('Failed to fetch meta-spec');
      const data = await res.json();
      setMetaSpec(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  }, [baseUrl]);

  useEffect(() => {
    fetchMetaSpec();
  }, [fetchMetaSpec]);

  const createMetaSpec = useCallback(async (data: MetaSpecInput): Promise<MetaSpec | null> => {
    setIsSaving(true);
    try {
      const res = await fetch(baseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Failed to create meta-spec');
      const created = await res.json();
      setMetaSpec(created);
      return created;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create');
      return null;
    } finally {
      setIsSaving(false);
    }
  }, [baseUrl]);

  const updateMetaSpec = useCallback(async (data: Partial<MetaSpecInput>): Promise<MetaSpec | null> => {
    setIsSaving(true);
    try {
      const res = await fetch(baseUrl, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Failed to update meta-spec');
      const updated = await res.json();
      setMetaSpec(updated);
      return updated;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update');
      return null;
    } finally {
      setIsSaving(false);
    }
  }, [baseUrl]);

  const deleteMetaSpecFn = useCallback(async (): Promise<boolean> => {
    setIsSaving(true);
    try {
      const res = await fetch(baseUrl, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete meta-spec');
      setMetaSpec(null);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete');
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [baseUrl]);

  const createPhase = useCallback(async (data: PhaseInput): Promise<Phase | null> => {
    setIsSaving(true);
    try {
      const res = await fetch(`${baseUrl}/phases`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Failed to create phase');
      const phase = await res.json();
      await fetchMetaSpec();
      return phase;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create phase');
      return null;
    } finally {
      setIsSaving(false);
    }
  }, [baseUrl, fetchMetaSpec]);

  const updatePhase = useCallback(async (
    phaseId: string,
    data: Partial<PhaseInput & { status: PhaseStatus }>,
  ): Promise<Phase | null> => {
    setIsSaving(true);
    try {
      const res = await fetch(`${baseUrl}/phases/${phaseId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Failed to update phase');
      const updated = await res.json();
      await fetchMetaSpec();
      return updated;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update phase');
      return null;
    } finally {
      setIsSaving(false);
    }
  }, [baseUrl, fetchMetaSpec]);

  const deletePhase = useCallback(async (phaseId: string): Promise<boolean> => {
    setIsSaving(true);
    try {
      const res = await fetch(`${baseUrl}/phases/${phaseId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete phase');
      await fetchMetaSpec();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete phase');
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [baseUrl, fetchMetaSpec]);

  const reorderPhases = useCallback(async (phaseIds: string[]): Promise<void> => {
    setIsSaving(true);
    try {
      const res = await fetch(`${baseUrl}/phases/reorder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phaseIds }),
      });
      if (!res.ok) throw new Error('Failed to reorder phases');
      const updated = await res.json();
      setMetaSpec(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reorder');
    } finally {
      setIsSaving(false);
    }
  }, [baseUrl]);

  const suggestPhases = useCallback(async (vision: string): Promise<SuggestedPhase[] | null> => {
    setIsAiLoading(true);
    try {
      const res = await fetch(`${baseUrl}/suggest-phases`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vision }),
      });
      if (!res.ok) throw new Error('Failed to suggest phases');
      const data = await res.json();
      return data.phases;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to suggest phases');
      return null;
    } finally {
      setIsAiLoading(false);
    }
  }, [baseUrl]);

  const improveSection = useCallback(async (section: string, content: string): Promise<string | null> => {
    setIsAiLoading(true);
    try {
      const res = await fetch(`${baseUrl}/improve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ section, content }),
      });
      if (!res.ok) throw new Error('Failed to improve section');
      const data = await res.json();
      return data.improved;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to improve');
      return null;
    } finally {
      setIsAiLoading(false);
    }
  }, [baseUrl]);

  const generateFromSpecs = useCallback(async (): Promise<GeneratedMetaSpec | null> => {
    setIsAiLoading(true);
    try {
      const res = await fetch(`${baseUrl}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error('Failed to generate meta-spec');
      const data = await res.json();
      return data.metaSpec;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate');
      return null;
    } finally {
      setIsAiLoading(false);
    }
  }, [baseUrl]);

  return {
    metaSpec,
    isLoading,
    error,
    createMetaSpec,
    updateMetaSpec,
    deleteMetaSpec: deleteMetaSpecFn,
    createPhase,
    updatePhase,
    deletePhase,
    reorderPhases,
    suggestPhases,
    improveSection,
    generateFromSpecs,
    isSaving,
    isAiLoading,
    refetch: fetchMetaSpec,
  };
}
