'use client';

import { useState } from 'react';

export type ChunkDetailLevel = 'minimal' | 'standard' | 'detailed';

interface ReviewStepProps {
  spec: string;
  onSpecChange: (spec: string) => void;
  onBack: () => void;
  onNext: (chunkPreference: ChunkDetailLevel) => void;
  onRefine: (feedback: string) => Promise<void>;
  isRefining: boolean;
}

const CHUNK_OPTIONS: { value: ChunkDetailLevel; label: string; description: string }[] = [
  { value: 'minimal', label: 'Minimal', description: '2-3 chunks' },
  { value: 'standard', label: 'Standard', description: '4-6 chunks' },
  { value: 'detailed', label: 'Detailed', description: '7-10 chunks' },
];

export default function ReviewStep({
  spec,
  onSpecChange,
  onBack,
  onNext,
  onRefine,
  isRefining,
}: ReviewStepProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [chunkPreference, setChunkPreference] = useState<ChunkDetailLevel>('standard');

  const handleRefine = async () => {
    if (!feedback.trim()) return;
    await onRefine(feedback);
    setFeedback('');
  };

  // If there's pending feedback, refine first before proceeding
  const handleNext = async () => {
    if (feedback.trim()) {
      await onRefine(feedback);
      setFeedback('');
    }
    onNext(chunkPreference);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-medium text-neutral-100 font-mono mb-2">
            Here's your spec
          </h2>
          <p className="text-sm text-neutral-500 font-mono">
            Review and refine until it looks right.
          </p>
        </div>
        <button
          onClick={() => setIsEditing(!isEditing)}
          className="px-3 py-1.5 text-neutral-400 hover:text-neutral-200 border border-neutral-800 rounded-md font-mono text-xs transition-colors"
        >
          {isEditing ? 'Preview' : 'Edit manually'}
        </button>
      </div>

      {/* Spec Content */}
      <div className="border border-neutral-800 rounded-md overflow-hidden">
        {isEditing ? (
          <textarea
            value={spec}
            onChange={(e) => onSpecChange(e.target.value)}
            className="w-full min-h-[300px] max-h-[500px] px-4 py-3 bg-neutral-900 text-neutral-300 font-mono text-sm focus:outline-none resize-y"
            disabled={isRefining}
          />
        ) : (
          <div className="max-h-[400px] overflow-auto px-4 py-3 bg-neutral-900/50">
            <div className="prose prose-invert prose-sm max-w-none font-mono">
              <pre className="whitespace-pre-wrap text-neutral-300 text-sm">{spec}</pre>
            </div>
          </div>
        )}
      </div>

      {/* Refinement Input */}
      <div className="space-y-3">
        <label className="block text-sm text-neutral-400 font-mono">
          Want to refine?
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="Add refresh token support..."
            className="flex-1 px-3 py-2 bg-neutral-900 border border-neutral-800 rounded-md text-neutral-300 placeholder:text-neutral-700 font-mono text-sm focus:outline-none focus:border-emerald-500/50"
            disabled={isRefining}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && feedback.trim()) {
                handleRefine();
              }
            }}
          />
          <button
            onClick={handleRefine}
            disabled={!feedback.trim() || isRefining}
            className="px-4 py-2 bg-violet-500/10 text-violet-400 border border-violet-500/30 rounded-md font-mono text-sm hover:bg-violet-500/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isRefining ? (
              <>
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Refining...
              </>
            ) : (
              'Refine'
            )}
          </button>
        </div>
      </div>

      {/* Chunk Detail Preference */}
      <div className="space-y-3 pt-2">
        <label className="block text-sm text-neutral-400 font-mono">
          How detailed should the breakdown be?
        </label>
        <div className="flex gap-2">
          {CHUNK_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setChunkPreference(option.value)}
              disabled={isRefining}
              className={`flex-1 px-3 py-2 rounded-md font-mono text-sm transition-colors ${
                chunkPreference === option.value
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  : 'bg-neutral-900 text-neutral-400 border border-neutral-800 hover:border-neutral-700'
              } disabled:opacity-50`}
            >
              <div className="font-medium">{option.label}</div>
              <div className="text-xs opacity-70">{option.description}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between pt-4">
        <button
          onClick={onBack}
          disabled={isRefining}
          className="px-4 py-2 text-neutral-400 hover:text-neutral-200 font-mono text-sm transition-colors disabled:opacity-50 flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>

        <button
          onClick={handleNext}
          disabled={isRefining || !spec.trim()}
          className="px-4 py-2 bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 rounded-md font-mono text-sm hover:bg-emerald-500/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {isRefining ? (
            <>
              <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              {feedback.trim() ? 'Refining...' : 'Generating chunks...'}
            </>
          ) : (
            <>
              {feedback.trim() ? 'Refine & Continue' : 'Looks Good'}
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
