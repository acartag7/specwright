'use client';

import type { ContextMetrics, ContextWarning } from '@/lib/execution/types';

interface ContextWarningsProps {
  metrics: ContextMetrics | null;
  className?: string;
}

export function ContextWarnings({ metrics, className }: ContextWarningsProps) {
  if (!metrics || metrics.warnings.length === 0) return null;

  return (
    <div className={className}>
      {/* Status bar showing percentage */}
      <div className="flex items-center gap-2 text-sm">
        <span>Context:</span>
        <div className="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${getStatusColor(metrics.status)}`}
            style={{ width: `${Math.min(metrics.percentage * 100, 100)}%` }}
          />
        </div>
        <span className={getTextColor(metrics.status)}>
          {Math.round(metrics.percentage * 100)}%
        </span>
      </div>

      {/* Warnings list */}
      {metrics.warnings.map((warning, i) => (
        <div key={i} className={`mt-1 text-xs flex items-start gap-1 ${getWarningColor(warning.level)}`}>
          <span>{getWarningIcon(warning.level)}</span>
          <span>{warning.message}</span>
          {warning.suggestion && (
            <button
              className="ml-auto text-blue-400 hover:text-blue-300 underline"
              onClick={() => {/* TODO: wire up suggestion actions */}}
            >
              {warning.suggestion.label}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

function getStatusColor(status: ContextMetrics['status']): string {
  switch (status) {
    case 'peak': return 'bg-green-500';
    case 'good': return 'bg-blue-500';
    case 'degrading': return 'bg-yellow-500';
    case 'poor': return 'bg-red-500';
  }
}

function getTextColor(status: ContextMetrics['status']): string {
  switch (status) {
    case 'peak': return 'text-green-400';
    case 'good': return 'text-blue-400';
    case 'degrading': return 'text-yellow-400';
    case 'poor': return 'text-red-400';
  }
}

function getWarningColor(level: ContextWarning['level']): string {
  switch (level) {
    case 'info': return 'text-zinc-400';
    case 'warning': return 'text-yellow-400';
    case 'critical': return 'text-red-400';
  }
}

function getWarningIcon(level: ContextWarning['level']): string {
  switch (level) {
    case 'info': return 'i';
    case 'warning': return '!';
    case 'critical': return '!!';
  }
}
