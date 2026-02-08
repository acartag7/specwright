/**
 * Context Tracker - Token Estimation and Usage Warnings
 *
 * Estimates prompt token usage using chars/4 heuristic and generates
 * warnings when context approaches model limits.
 */

import type { ModelInfo, ContextMetrics, ContextWarning } from './types';

const CHARS_PER_TOKEN = 4;
const WARNING_THRESHOLD = 0.5;
const CRITICAL_THRESHOLD = 0.7;

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

export function getStatus(percentage: number): ContextMetrics['status'] {
  if (percentage <= 0.3) return 'peak';
  if (percentage <= 0.5) return 'good';
  if (percentage <= 0.7) return 'degrading';
  return 'poor';
}

export interface PromptComponents {
  systemPrompt: string;
  specContent: string;
  chunkDescription: string;
  dependencyHistory: string;
}

export function calculateContextMetrics(
  components: PromptComponents,
  model: ModelInfo
): ContextMetrics {
  const breakdown = {
    systemPrompt: estimateTokens(components.systemPrompt),
    specContent: estimateTokens(components.specContent),
    chunkDescription: estimateTokens(components.chunkDescription),
    dependencyHistory: estimateTokens(components.dependencyHistory),
  };

  const total = Object.values(breakdown).reduce((a, b) => a + b, 0);
  const contextLimit = model.limits?.context ?? 200000;
  const percentage = total / contextLimit;

  const warnings = generateWarnings(breakdown, total, percentage);

  return {
    estimated: { total, breakdown },
    model: {
      id: model.id,
      contextLimit,
      outputLimit: model.limits?.output ?? 100000,
    },
    percentage,
    status: getStatus(percentage),
    warnings,
  };
}

function generateWarnings(
  breakdown: ContextMetrics['estimated']['breakdown'],
  total: number,
  percentage: number
): ContextWarning[] {
  const warnings: ContextWarning[] = [];

  if (percentage >= CRITICAL_THRESHOLD) {
    warnings.push({
      level: 'critical',
      component: 'dependencyHistory',
      currentTokens: total,
      percentageOfTotal: 100,
      message: `Context usage at ${Math.round(percentage * 100)}% - execution quality will be poor`,
      suggestion: {
        action: 'archive-chunks',
        label: 'Archive old chunks',
        description: 'Mark completed chunks as archived to exclude from context',
        estimatedSavings: Math.round(breakdown.dependencyHistory * 0.5),
      },
    });
  } else if (percentage >= WARNING_THRESHOLD) {
    warnings.push({
      level: 'warning',
      component: 'dependencyHistory',
      currentTokens: total,
      percentageOfTotal: 100,
      message: `Context usage at ${Math.round(percentage * 100)}% - approaching degraded quality`,
      suggestion: {
        action: 'archive-chunks',
        label: 'Archive old chunks',
        description: 'Mark completed chunks as archived to exclude from context',
        estimatedSavings: Math.round(breakdown.dependencyHistory * 0.3),
      },
    });
  }

  const depPercentage = breakdown.dependencyHistory / total;
  if (depPercentage > 0.4 && breakdown.dependencyHistory > 50000) {
    warnings.push({
      level: 'info',
      component: 'dependencyHistory',
      currentTokens: breakdown.dependencyHistory,
      percentageOfTotal: Math.round(depPercentage * 100),
      message: `Dependency history using ${Math.round(depPercentage * 100)}% of context`,
      suggestion: {
        action: 'summary-only',
        label: 'Use summary-only mode',
        description: 'Use only outputSummary fields, skip raw output',
        estimatedSavings: Math.round(breakdown.dependencyHistory * 0.6),
      },
    });
  }

  const specPercentage = breakdown.specContent / total;
  if (specPercentage > 0.3 && breakdown.specContent > 40000) {
    warnings.push({
      level: 'info',
      component: 'specContent',
      currentTokens: breakdown.specContent,
      percentageOfTotal: Math.round(specPercentage * 100),
      message: `Spec content using ${Math.round(specPercentage * 100)}% of context`,
      suggestion: {
        action: 'split-spec',
        label: 'Split spec',
        description: 'Break spec into multiple smaller specs',
        estimatedSavings: Math.round(breakdown.specContent * 0.5),
      },
    });
  }

  return warnings;
}
