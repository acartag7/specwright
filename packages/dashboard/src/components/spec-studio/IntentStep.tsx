'use client';

interface IntentStepProps {
  intent: string;
  onChange: (intent: string) => void;
  onNext: () => void;
  isGenerating: boolean;
}

const MIN_CHARS = 20;

export default function IntentStep({
  intent,
  onChange,
  onNext,
  isGenerating,
}: IntentStepProps) {
  const isValid = intent.trim().length >= MIN_CHARS;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-medium text-neutral-100 font-mono mb-2">
          What do you want to build?
        </h2>
        <p className="text-sm text-neutral-500 font-mono">
          Describe what you want to create. Be as detailed as you like.
        </p>
      </div>

      <div className="space-y-2">
        <textarea
          value={intent}
          onChange={(e) => onChange(e.target.value)}
          placeholder="I want to add user authentication to my Express API. Users should be able to register and login. Use JWT tokens for session management..."
          className="w-full min-h-[200px] px-4 py-3 bg-neutral-900 border border-neutral-800 rounded-md text-neutral-300 placeholder:text-neutral-700 font-mono text-sm focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20 resize-y"
          disabled={isGenerating}
        />
        <div className="flex items-center justify-between">
          <span className={`text-[10px] font-mono ${intent.length >= MIN_CHARS ? 'text-neutral-600' : 'text-neutral-500'}`}>
            {intent.length} characters {!isValid && `(${MIN_CHARS} minimum)`}
          </span>
        </div>
      </div>

      <div className="flex justify-end">
        <button
          onClick={onNext}
          disabled={!isValid || isGenerating}
          className="px-4 py-2 bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 rounded-md font-mono text-sm hover:bg-emerald-500/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {isGenerating ? (
            <>
              <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Generating questions...
            </>
          ) : (
            <>
              Continue
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
