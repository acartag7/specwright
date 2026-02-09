'use client';

import { useState, useEffect } from 'react';
import type { Chunk, Spec } from '@specwright/shared';
import type { ContextMetrics } from '@/lib/execution/types';
import { calculateContextMetrics } from '@/lib/execution/context-tracker';
import type { PromptComponents } from '@/lib/execution/context-tracker';

const DEFAULT_CONTEXT_LIMIT = 200000;
const DEFAULT_OUTPUT_LIMIT = 100000;

interface UseContextMetricsProps {
  chunk: Chunk | null;
  spec: Spec | null;
  chunks?: Chunk[];
}

/**
 * Hook that calculates context metrics for a given chunk.
 * Uses the context tracker to estimate token usage and generate warnings.
 */
export function useContextMetrics({
  chunk,
  spec,
  chunks = [],
}: UseContextMetricsProps): ContextMetrics | null {
  const [metrics, setMetrics] = useState<ContextMetrics | null>(null);

  useEffect(() => {
    if (!chunk || !spec) {
      setMetrics(null);
      return;
    }

    // Build dependency history from completed deps
    const completedDeps = chunk.dependencies
      .map(depId => chunks.find(c => c.id === depId))
      .filter((c): c is Chunk => c != null && c.status === 'completed');

    const dependencyHistory = completedDeps
      .map(dep => {
        const summary = dep.outputSummary || dep.output?.slice(0, 2000) || '';
        return `### ${dep.title}\n${summary}`;
      })
      .join('\n');

    const specContent = spec.content?.slice(0, 3000) || '';
    const chunkDescription = `## ${chunk.title}\n\n${chunk.description}`;

    const components: PromptComponents = {
      systemPrompt: 'You are implementing part of a larger feature.',
      specContent,
      chunkDescription,
      dependencyHistory,
    };

    const result = calculateContextMetrics(components, {
      id: 'claude-sonnet-4-5-20250929',
      name: 'Claude Sonnet 4.5',
      provider: 'anthropic',
      capabilities: { toolCall: true, attachment: true, reasoning: true },
      limits: { context: DEFAULT_CONTEXT_LIMIT, output: DEFAULT_OUTPUT_LIMIT },
    });

    setMetrics(result);
  }, [chunk, spec, chunks]);

  return metrics;
}
