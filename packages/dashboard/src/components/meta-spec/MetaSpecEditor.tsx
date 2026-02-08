'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import type { MetaSpec } from '@specwright/shared';

interface MetaSpecEditorProps {
  metaSpec: MetaSpec;
  onUpdate: (data: Partial<SectionData>) => Promise<unknown>;
  onImprove: (section: string, content: string) => Promise<string | null>;
  isSaving: boolean;
  isAiLoading: boolean;
}

interface SectionData {
  vision: string;
  architecture: string;
  constraints: string;
  nonGoals: string;
}

type SectionKey = keyof SectionData;

const SECTIONS: { key: SectionKey; label: string; placeholder: string }[] = [
  {
    key: 'vision',
    label: 'Vision',
    placeholder: 'Describe the overall vision and purpose of this project...',
  },
  {
    key: 'architecture',
    label: 'Architecture',
    placeholder: 'Describe the high-level architecture, key components, and how they interact...',
  },
  {
    key: 'constraints',
    label: 'Constraints',
    placeholder: 'List technical constraints, limitations, and requirements...',
  },
  {
    key: 'nonGoals',
    label: 'Non-Goals',
    placeholder: 'What is explicitly out of scope for this project...',
  },
];

function AutoResizeTextarea({
  value,
  onChange,
  onBlur,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  onBlur: () => void;
  placeholder: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
      placeholder={placeholder}
      rows={3}
      className="w-full bg-neutral-900 border border-neutral-700 rounded-md px-3 py-2 text-sm text-neutral-100 font-mono placeholder:text-neutral-600 focus:outline-none focus:border-emerald-500/50 resize-none overflow-hidden"
    />
  );
}

export default function MetaSpecEditor({
  metaSpec,
  onUpdate,
  onImprove,
  isSaving,
  isAiLoading,
}: MetaSpecEditorProps) {
  const [localValues, setLocalValues] = useState<SectionData>({
    vision: metaSpec.vision,
    architecture: metaSpec.architecture,
    constraints: metaSpec.constraints,
    nonGoals: metaSpec.nonGoals,
  });
  const [collapsedSections, setCollapsedSections] = useState<Set<SectionKey>>(new Set());
  const [improvingSection, setImprovingSection] = useState<SectionKey | null>(null);

  // Sync when metaSpec changes externally
  useEffect(() => {
    setLocalValues({
      vision: metaSpec.vision,
      architecture: metaSpec.architecture,
      constraints: metaSpec.constraints,
      nonGoals: metaSpec.nonGoals,
    });
  }, [metaSpec]);

  const toggleSection = useCallback((key: SectionKey) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const handleChange = useCallback((key: SectionKey, value: string) => {
    setLocalValues((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleBlur = useCallback(
    (key: SectionKey) => {
      if (localValues[key] !== metaSpec[key]) {
        onUpdate({ [key]: localValues[key] });
      }
    },
    [localValues, metaSpec, onUpdate],
  );

  const handleImprove = useCallback(
    async (key: SectionKey) => {
      if (!localValues[key].trim()) return;
      setImprovingSection(key);
      const improved = await onImprove(key, localValues[key]);
      if (improved) {
        setLocalValues((prev) => ({ ...prev, [key]: improved }));
        onUpdate({ [key]: improved });
      }
      setImprovingSection(null);
    },
    [localValues, onImprove, onUpdate],
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-xs text-neutral-500 font-mono uppercase tracking-wider">
          Meta-Spec
        </h2>
        {isSaving && (
          <span className="text-[10px] text-neutral-500 font-mono flex items-center gap-1">
            <svg className="animate-spin w-3 h-3" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            Saving...
          </span>
        )}
      </div>

      {SECTIONS.map(({ key, label, placeholder }) => {
        const isCollapsed = collapsedSections.has(key);
        const isImproving = improvingSection === key;
        const charCount = localValues[key].length;

        return (
          <div
            key={key}
            className="bg-neutral-900/50 border border-neutral-800 rounded-md overflow-hidden"
          >
            <button
              type="button"
              onClick={() => toggleSection(key)}
              className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-neutral-800/50 transition-colors"
            >
              <span className="text-sm font-medium text-neutral-200 font-mono">
                {label}
              </span>
              <svg
                className={`w-4 h-4 text-neutral-500 transition-transform ${isCollapsed ? '' : 'rotate-180'}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {!isCollapsed && (
              <div className="px-4 pb-3 space-y-2">
                <AutoResizeTextarea
                  value={localValues[key]}
                  onChange={(v) => handleChange(key, v)}
                  onBlur={() => handleBlur(key)}
                  placeholder={placeholder}
                />
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-neutral-600 font-mono">
                    {charCount} chars
                  </span>
                  <button
                    type="button"
                    onClick={() => handleImprove(key)}
                    disabled={isAiLoading || !localValues[key].trim()}
                    className="px-2 py-1 text-[10px] font-mono text-violet-400 border border-violet-500/30 bg-violet-500/10 hover:bg-violet-500/20 rounded transition-colors disabled:opacity-50 flex items-center gap-1"
                  >
                    {isImproving ? (
                      <>
                        <svg className="animate-spin w-3 h-3" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        Improving...
                      </>
                    ) : (
                      'Improve with AI'
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
