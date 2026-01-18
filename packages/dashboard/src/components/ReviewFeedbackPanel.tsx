'use client';

import type { ReviewStatus } from '@specwright/shared';

interface ReviewFeedbackPanelProps {
  status: ReviewStatus;
  feedback: string;
  model?: string;
  durationMs?: number;
  onClose?: () => void;
}

const statusConfig: Record<ReviewStatus, { icon: string; color: string; bg: string; border: string; label: string }> = {
  pass: {
    icon: '✓',
    color: 'text-emerald-400',
    bg: 'bg-emerald-900/20',
    border: 'border-emerald-500/30',
    label: 'Passed',
  },
  needs_fix: {
    icon: '⚠',
    color: 'text-amber-400',
    bg: 'bg-amber-900/20',
    border: 'border-amber-500/30',
    label: 'Needs Fix',
  },
  fail: {
    icon: '✕',
    color: 'text-red-400',
    bg: 'bg-red-900/20',
    border: 'border-red-500/30',
    label: 'Failed',
  },
  error: {
    icon: '⚡',
    color: 'text-orange-400',
    bg: 'bg-orange-900/20',
    border: 'border-orange-500/30',
    label: 'Error',
  },
  skipped: {
    icon: '—',
    color: 'text-neutral-500',
    bg: 'bg-neutral-800/50',
    border: 'border-neutral-700',
    label: 'Skipped',
  },
};

export default function ReviewFeedbackPanel({
  status,
  feedback,
  model = 'Haiku',
  durationMs,
  onClose,
}: ReviewFeedbackPanelProps) {
  const config = statusConfig[status];

  return (
    <div className={`${config.bg} border ${config.border} rounded-md p-3`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className={`${config.color} font-mono text-sm`}>{config.icon}</span>
          <span className={`${config.color} font-mono text-xs font-medium`}>{config.label}</span>
        </div>
        <div className="flex items-center gap-2">
          {durationMs !== undefined && (
            <span className="text-[10px] text-neutral-500 font-mono">
              {(durationMs / 1000).toFixed(1)}s
            </span>
          )}
          {onClose && (
            <button
              onClick={onClose}
              className="p-0.5 text-neutral-500 hover:text-neutral-300 transition-colors"
              title="Close"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Feedback content */}
      <p className="text-[11px] text-neutral-300 font-mono whitespace-pre-wrap leading-relaxed">
        {feedback}
      </p>

      {/* Footer */}
      <p className="text-[9px] text-neutral-600 font-mono mt-2">
        Reviewed with {model}
      </p>
    </div>
  );
}
