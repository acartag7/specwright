'use client';

import { useState } from 'react';
import type { ReviewWarning } from '@specwright/shared';

interface ReviewWarningsProps {
  warnings: ReviewWarning[];
  onDismiss?: () => void;
}

const warningConfig: Record<ReviewWarning['type'], { icon: string; color: string; bg: string }> = {
  rate_limit: { icon: '⏱', color: 'text-orange-400', bg: 'bg-orange-900/20' },
  review_error: { icon: '⚡', color: 'text-red-400', bg: 'bg-red-900/20' },
  needs_fix: { icon: '⚠', color: 'text-amber-400', bg: 'bg-amber-900/20' },
};

export default function ReviewWarnings({ warnings, onDismiss }: ReviewWarningsProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [isDismissed, setIsDismissed] = useState(false);

  if (isDismissed || warnings.length === 0) return null;

  const totalCount = warnings.reduce((sum, w) => sum + w.count, 0);

  const handleDismiss = () => {
    setIsDismissed(true);
    onDismiss?.();
  };

  return (
    <div className="bg-neutral-900/80 border border-neutral-800 rounded-md overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-3 py-2 hover:bg-neutral-800/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-amber-400 font-mono text-xs">⚠</span>
          <span className="text-neutral-300 font-mono text-xs">
            {totalCount} review issue{totalCount !== 1 ? 's' : ''}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleDismiss();
            }}
            className="p-0.5 text-neutral-500 hover:text-neutral-300 transition-colors"
            title="Dismiss"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <svg
            className={`w-3.5 h-3.5 text-neutral-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="px-3 pb-2 space-y-1.5">
          {warnings.map((warning, index) => {
            const config = warningConfig[warning.type];
            return (
              <div
                key={`${warning.type}-${index}`}
                className={`flex items-center gap-2 px-2 py-1.5 rounded ${config.bg}`}
              >
                <span className={`${config.color} font-mono text-xs`}>{config.icon}</span>
                <span className={`${config.color} font-mono text-[11px] flex-1`}>
                  {warning.message}
                </span>
                {warning.chunkIds.length > 0 && (
                  <span className="text-neutral-500 font-mono text-[10px]">
                    ({warning.chunkIds.length} chunk{warning.chunkIds.length !== 1 ? 's' : ''})
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
