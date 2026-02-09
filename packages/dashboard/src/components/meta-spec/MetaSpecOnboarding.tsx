'use client';

interface MetaSpecOnboardingProps {
  onCreate: () => void;
  onGenerate: () => void;
  isLoading: boolean;
}

export default function MetaSpecOnboarding({
  onCreate,
  onGenerate,
  isLoading,
}: MetaSpecOnboardingProps) {
  return (
    <div className="bg-neutral-900/50 border border-neutral-800 rounded-md p-6 text-center">
      <div className="w-10 h-10 mx-auto mb-3 rounded-full bg-neutral-800 flex items-center justify-center">
        <svg className="w-5 h-5 text-neutral-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        </svg>
      </div>
      <h3 className="text-sm font-medium text-neutral-300 font-mono mb-1">
        No Meta-Spec
      </h3>
      <p className="text-xs text-neutral-500 font-mono mb-4 max-w-sm mx-auto">
        A meta-spec defines your project vision, architecture, constraints, and phases.
        Create one to organize your specs into a structured plan.
      </p>
      <div className="flex items-center justify-center gap-3">
        <button
          type="button"
          onClick={onCreate}
          disabled={isLoading}
          className="px-3 py-1.5 text-xs font-mono text-emerald-400 border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 rounded-md transition-colors disabled:opacity-50"
        >
          Create Meta-Spec
        </button>
        <button
          type="button"
          onClick={onGenerate}
          disabled={isLoading}
          className="px-3 py-1.5 text-xs font-mono text-violet-400 border border-violet-500/30 bg-violet-500/10 hover:bg-violet-500/20 rounded-md transition-colors disabled:opacity-50 flex items-center gap-1.5"
        >
          {isLoading ? (
            <>
              <svg className="animate-spin w-3 h-3" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Generating...
            </>
          ) : (
            'Generate from Existing Specs'
          )}
        </button>
      </div>
    </div>
  );
}
