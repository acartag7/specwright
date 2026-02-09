'use client';

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import type {
  Spec,
  SpecStudioState,
  SpecStudioStep,
  Question,
  ChunkSuggestion,
  ProjectConfig,
} from '@specwright/shared';
import { DEFAULT_PROJECT_CONFIG } from '@specwright/shared';
import type { ChunkDetailLevel } from '../components/spec-studio/ReviewStep';
import type { GitOptions } from '../components/spec-studio/ChunksStep';

export interface UseSpecStudioOptions {
  projectId: string;
  projectName: string;
  projectDirectory: string;
  specId?: string;
  existingSpec?: Spec;
  onComplete: () => void;
}

export interface UseSpecStudioReturn {
  // State
  studioState: SpecStudioState | null;
  isLoading: boolean;
  isSaving: boolean;
  isGenerating: boolean;
  error: string | null;
  config: ProjectConfig;
  validationError: string | null;
  accessibilityStatus: AccessibilityStatus | null;
  hasUnsavedChanges: boolean;
  maxCompletedIndex: number;

  // Navigation warning
  showNavigationWarning: boolean;
  handleNavigationAttempt: (url: string) => void;
  handleConfirmNavigation: () => void;
  handleCancelNavigation: () => void;

  // Step navigation
  goToStep: (step: SpecStudioStep) => Promise<void>;

  // Intent
  handleIntentChange: (intent: string) => void;
  handleIntentNext: () => Promise<void>;

  // Questions
  handleAnswerChange: (questionId: string, value: string | string[]) => void;
  handleQuestionsBack: () => Promise<void>;
  handleQuestionsNext: () => Promise<void>;
  additionalNotes: string;
  setAdditionalNotes: (notes: string) => void;

  // Review
  handleSpecChange: (spec: string) => void;
  handleReviewBack: () => Promise<void>;
  handleRefine: (feedback: string) => Promise<void>;
  handleReviewNext: (chunkPreference?: ChunkDetailLevel) => Promise<void>;

  // Config
  handleConfigChange: (config: ProjectConfig) => void;

  // Chunks
  handleChunksBack: () => Promise<void>;
  handleChunksChange: (chunks: ChunkSuggestion[]) => void;
  handleComplete: (gitOptions: GitOptions) => Promise<void>;

  // Utils
  setError: (error: string | null) => void;
}

export interface AccessibilityStatus {
  executor: { accessible: boolean; error?: string };
  planner: { accessible: boolean; error?: string };
  reviewer: { accessible: boolean; error?: string };
}

export function useSpecStudio({
  projectId,
  projectName,
  projectDirectory,
  specId,
  existingSpec,
  onComplete,
}: UseSpecStudioOptions): UseSpecStudioReturn {
  const router = useRouter();
  const [studioState, setStudioState] = useState<SpecStudioState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showNavigationWarning, setShowNavigationWarning] = useState(false);
  const [pendingNavigationUrl, setPendingNavigationUrl] = useState<string | null>(null);
  const [config, setConfig] = useState<ProjectConfig>(DEFAULT_PROJECT_CONFIG);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [accessibilityStatus, setAccessibilityStatus] = useState<AccessibilityStatus | null>(null);
  const [additionalNotes, setAdditionalNotes] = useState('');

  const savedStateRef = useRef<SpecStudioState | null>(null);

  // Detect unsaved changes
  const hasUnsavedChanges = useMemo(() => {
    if (!studioState || !savedStateRef.current) return false;
    const saved = savedStateRef.current;
    const intentChanged = studioState.intent !== saved.intent && studioState.intent.trim() !== '';
    const answersChanged =
      JSON.stringify(studioState.answers) !== JSON.stringify(saved.answers) &&
      Object.keys(studioState.answers).length > 0;
    const specChanged =
      studioState.generatedSpec !== saved.generatedSpec && studioState.generatedSpec.trim() !== '';
    const chunksChanged =
      JSON.stringify(studioState.suggestedChunks) !== JSON.stringify(saved.suggestedChunks);
    return intentChanged || answersChanged || specChanged || chunksChanged;
  }, [studioState]);

  // Max completed step index based on data presence
  const maxCompletedIndex = useMemo(() => {
    if (!studioState) return 0;
    if (studioState.suggestedChunks && studioState.suggestedChunks.length > 0) return 3;
    if (studioState.generatedSpec && studioState.generatedSpec.trim() !== '') return 2;
    if (studioState.answers && Object.keys(studioState.answers).length > 0) return 2;
    if (studioState.questions && studioState.questions.length > 0) return 1;
    return 0;
  }, [studioState]);

  // Build API URL with optional specId
  const buildStudioUrl = useCallback(
    (base: string) => {
      if (!specId) return base;
      const separator = base.includes('?') ? '&' : '?';
      return `${base}${separator}specId=${encodeURIComponent(specId)}`;
    },
    [specId]
  );

  // Fetch or create studio state
  useEffect(() => {
    async function fetchState() {
      try {
        setIsLoading(true);
        const url = buildStudioUrl(`/api/projects/${projectId}/studio`);
        const response = await fetch(url);
        if (!response.ok) throw new Error('Failed to fetch studio state');
        const state = await response.json();

        if (existingSpec?.content && state.step === 'intent' && !state.intent) {
          state.intent = existingSpec.content;
        }

        // Map old step names to new ones (config -> review)
        if (state.step === 'config') {
          state.step = 'review';
        }

        setStudioState(state);
        savedStateRef.current = JSON.parse(JSON.stringify(state));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setIsLoading(false);
      }
    }
    fetchState();
  }, [projectId, specId, existingSpec, buildStudioUrl]);

  // Load project config
  useEffect(() => {
    async function loadConfig() {
      try {
        const response = await fetch(`/api/projects/${projectId}/config?validate=true`);
        if (!response.ok) throw new Error('Failed to fetch project config');
        const data = await response.json();
        setConfig(data.config);
        setAccessibilityStatus(data.validation);
      } catch (err) {
        console.error('Error loading config:', err);
      }
    }
    loadConfig();
  }, [projectId]);

  // Warn on browser close with unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = '';
        return '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);

  // Save state to API
  const saveState = useCallback(
    async (updates: Partial<SpecStudioState>) => {
      if (!studioState) return;
      setIsSaving(true);
      try {
        const url = buildStudioUrl(`/api/projects/${projectId}/studio`);
        const response = await fetch(url, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updates),
        });
        if (!response.ok) throw new Error('Failed to save state');
        const updatedState = await response.json();
        setStudioState(updatedState);
        savedStateRef.current = JSON.parse(JSON.stringify(updatedState));
        return updatedState;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to save');
        throw err;
      } finally {
        setIsSaving(false);
      }
    },
    [projectId, studioState, buildStudioUrl]
  );

  // Step navigation
  const goToStep = useCallback(
    async (step: SpecStudioStep) => {
      await saveState({ step });
    },
    [saveState]
  );

  // Intent handlers
  const handleIntentChange = useCallback((intent: string) => {
    setStudioState((prev) => (prev ? { ...prev, intent } : null));
  }, []);

  const handleIntentNext = useCallback(async () => {
    if (!studioState) return;
    setIsGenerating(true);
    try {
      await saveState({ intent: studioState.intent });
      const response = await fetch(`/api/projects/${projectId}/studio/questions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ intent: studioState.intent }),
      });
      if (!response.ok) throw new Error('Failed to generate questions');
      const { questions } = await response.json();
      await saveState({ step: 'questions', questions });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate questions');
    } finally {
      setIsGenerating(false);
    }
  }, [projectId, studioState, saveState]);

  // Questions handlers
  const handleAnswerChange = useCallback((questionId: string, value: string | string[]) => {
    setStudioState((prev) => {
      if (!prev) return null;
      return { ...prev, answers: { ...prev.answers, [questionId]: value } };
    });
  }, []);

  const handleQuestionsBack = useCallback(async () => {
    await goToStep('intent');
  }, [goToStep]);

  const handleQuestionsNext = useCallback(async () => {
    if (!studioState) return;
    setIsGenerating(true);
    try {
      await saveState({ answers: studioState.answers });
      const response = await fetch(`/api/projects/${projectId}/studio/spec`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          intent: studioState.intent,
          answers: studioState.answers,
          additionalNotes: additionalNotes || undefined,
        }),
      });
      if (!response.ok) throw new Error('Failed to generate spec');
      const { spec } = await response.json();
      await saveState({ step: 'review', generatedSpec: spec });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate spec');
    } finally {
      setIsGenerating(false);
    }
  }, [projectId, studioState, saveState, additionalNotes]);

  // Review handlers
  const handleSpecChange = useCallback((generatedSpec: string) => {
    setStudioState((prev) => (prev ? { ...prev, generatedSpec } : null));
  }, []);

  const handleReviewBack = useCallback(async () => {
    await goToStep('questions');
  }, [goToStep]);

  const handleRefine = useCallback(
    async (feedback: string) => {
      if (!studioState) return;
      setIsGenerating(true);
      try {
        const response = await fetch(`/api/projects/${projectId}/studio/refine`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ spec: studioState.generatedSpec, feedback }),
        });
        if (!response.ok) throw new Error('Failed to refine spec');
        const { spec } = await response.json();
        await saveState({ generatedSpec: spec });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to refine spec');
      } finally {
        setIsGenerating(false);
      }
    },
    [projectId, studioState, saveState]
  );

  const handleReviewNext = useCallback(
    async (chunkPreference: ChunkDetailLevel = 'standard') => {
      if (!studioState) return;
      setIsGenerating(true);
      try {
        await saveState({ generatedSpec: studioState.generatedSpec });

        // Save config before generating chunks
        const configResponse = await fetch(`/api/projects/${projectId}/config?validate=true`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(config),
        });

        let configData: Record<string, unknown> = {};
        try {
          configData = await configResponse.json();
        } catch {
          // Empty or invalid JSON
        }

        if (!configResponse.ok) {
          if (configResponse.status === 503) {
            setAccessibilityStatus({
              executor: { accessible: false, error: (configData?.error as string) ?? undefined },
              planner: { accessible: true },
              reviewer: { accessible: true },
            });
          } else if (configResponse.status !== 400) {
            throw new Error('Failed to save config');
          }
        }
        if (configData?.validation) {
          setAccessibilityStatus(configData.validation as AccessibilityStatus);
        }

        // Generate chunks
        const response = await fetch(`/api/projects/${projectId}/studio/chunks`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ spec: studioState.generatedSpec, chunkPreference }),
        });
        if (!response.ok) throw new Error('Failed to generate chunks');
        const { chunks } = await response.json();
        await saveState({ step: 'chunks', suggestedChunks: chunks });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to generate chunks');
      } finally {
        setIsGenerating(false);
      }
    },
    [projectId, studioState, saveState, config]
  );

  // Config handlers
  const handleConfigChange = useCallback((newConfig: ProjectConfig) => {
    setConfig(newConfig);
    setValidationError(null);
  }, []);

  // Chunks handlers
  const handleChunksBack = useCallback(async () => {
    await goToStep('review');
  }, [goToStep]);

  const handleChunksChange = useCallback((chunks: ChunkSuggestion[]) => {
    setStudioState((prev) => (prev ? { ...prev, suggestedChunks: chunks } : null));
  }, []);

  // Navigation warning
  const handleNavigationAttempt = useCallback(
    (url: string) => {
      if (hasUnsavedChanges) {
        setPendingNavigationUrl(url);
        setShowNavigationWarning(true);
      } else {
        router.push(url);
      }
    },
    [hasUnsavedChanges, router]
  );

  const handleConfirmNavigation = useCallback(() => {
    setShowNavigationWarning(false);
    if (pendingNavigationUrl) {
      router.push(pendingNavigationUrl);
    }
  }, [pendingNavigationUrl, router]);

  const handleCancelNavigation = useCallback(() => {
    setShowNavigationWarning(false);
    setPendingNavigationUrl(null);
  }, []);

  // Complete handler
  const handleComplete = useCallback(
    async (gitOptions: GitOptions) => {
      if (!studioState) return;
      setIsGenerating(true);
      try {
        await saveState({ suggestedChunks: studioState.suggestedChunks });

        await fetch(`/api/projects/${projectId}/config`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(config),
        });

        const completeUrl = specId
          ? `/api/specs/${specId}/studio/complete`
          : `/api/projects/${projectId}/studio/complete`;

        const response = await fetch(completeUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            spec: studioState.generatedSpec,
            chunks: studioState.suggestedChunks.filter((c) => c.selected),
            gitOptions,
          }),
        });

        if (!response.ok) throw new Error('Failed to complete setup');
        await saveState({ step: 'complete' });
        onComplete();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to complete setup');
      } finally {
        setIsGenerating(false);
      }
    },
    [projectId, specId, studioState, saveState, onComplete, config]
  );

  return {
    studioState,
    isLoading,
    isSaving,
    isGenerating,
    error,
    config,
    validationError,
    accessibilityStatus,
    hasUnsavedChanges,
    maxCompletedIndex,
    showNavigationWarning,
    handleNavigationAttempt,
    handleConfirmNavigation,
    handleCancelNavigation,
    goToStep,
    handleIntentChange,
    handleIntentNext,
    handleAnswerChange,
    handleQuestionsBack,
    handleQuestionsNext,
    additionalNotes,
    setAdditionalNotes,
    handleSpecChange,
    handleReviewBack,
    handleRefine,
    handleReviewNext,
    handleConfigChange,
    handleChunksBack,
    handleChunksChange,
    handleComplete,
    setError,
  };
}
