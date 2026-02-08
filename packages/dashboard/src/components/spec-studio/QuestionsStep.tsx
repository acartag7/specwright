'use client';

import { useState } from 'react';
import type { Question } from '@specwright/shared';
import QuestionField from './QuestionField';

interface QuestionsStepProps {
  questions: Question[];
  answers: Record<string, string | string[]>;
  onAnswerChange: (questionId: string, value: string | string[]) => void;
  onBack: () => void;
  onNext: () => void;
  isGenerating: boolean;
  additionalNotes?: string;
  onAdditionalNotesChange?: (notes: string) => void;
}

export default function QuestionsStep({
  questions,
  answers,
  onAnswerChange,
  onBack,
  onNext,
  isGenerating,
  additionalNotes = '',
  onAdditionalNotesChange,
}: QuestionsStepProps) {
  const [expandedQuestions, setExpandedQuestions] = useState<Set<string>>(
    () => new Set(questions.map((q) => q.id))
  );

  const isValid = questions
    .filter((q) => q.required)
    .every((q) => {
      const answer = answers[q.id];
      if (q.type === 'multiselect') {
        return Array.isArray(answer) && answer.length > 0;
      }
      return answer && String(answer).trim().length > 0;
    });

  const toggleExpanded = (questionId: string) => {
    setExpandedQuestions((prev) => {
      const next = new Set(prev);
      if (next.has(questionId)) {
        next.delete(questionId);
      } else {
        next.add(questionId);
      }
      return next;
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-medium text-neutral-100 font-mono mb-2">
          Let me understand your requirements better
        </h2>
        <p className="text-sm text-neutral-500 font-mono">
          Answer these questions to help create a complete specification.
        </p>
      </div>

      <div className="space-y-4">
        {questions.map((question, index) => {
          const isExpanded = expandedQuestions.has(question.id);
          const hasAnswer = (() => {
            const answer = answers[question.id];
            if (question.type === 'multiselect') {
              return Array.isArray(answer) && answer.length > 0;
            }
            return answer && String(answer).trim().length > 0;
          })();

          return (
            <div
              key={question.id}
              className="bg-neutral-900/70 border border-neutral-800 rounded-lg overflow-hidden transition-colors hover:border-neutral-700"
            >
              {/* Question Header - clickable to expand/collapse */}
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  toggleExpanded(question.id);
                }}
                className="w-full px-5 py-4 flex items-center gap-3 text-left"
              >
                <span className="text-xs text-neutral-600 font-mono flex-shrink-0">
                  {index + 1}/{questions.length}
                </span>
                <span className="flex-1 text-sm text-neutral-200 font-mono">
                  {question.question}
                  {question.required && <span className="text-red-400 ml-1">*</span>}
                </span>
                {hasAnswer && !isExpanded && (
                  <span className="text-xs text-emerald-400/70 font-mono flex-shrink-0">
                    answered
                  </span>
                )}
                <svg
                  className={`w-4 h-4 text-neutral-500 transition-transform flex-shrink-0 ${
                    isExpanded ? 'rotate-180' : ''
                  }`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {/* Expandable Answer Area */}
              {isExpanded && (
                <div className="px-5 pb-5 space-y-3">
                  <QuestionField
                    question={{ ...question, question: '' }}
                    value={answers[question.id] || (question.type === 'multiselect' ? [] : '')}
                    onChange={(value) => onAnswerChange(question.id, value)}
                  />

                  {/* Why this matters - expandable info */}
                  {question.context && (
                    <WhyThisMatters context={question.context} />
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {questions.length === 0 && (
        <div className="text-center py-8">
          <p className="text-neutral-500 font-mono text-sm">No questions generated yet.</p>
        </div>
      )}

      {/* Additional Notes */}
      {questions.length > 0 && (
        <div className="bg-neutral-900/50 border border-neutral-800 rounded-lg p-5 space-y-3">
          <label className="block text-sm text-neutral-300 font-mono">
            Additional Notes
            <span className="text-neutral-600 ml-2">(optional)</span>
          </label>
          <textarea
            value={additionalNotes}
            onChange={(e) => onAdditionalNotesChange?.(e.target.value)}
            placeholder="Add any context, preferences, or details that weren't covered by the questions..."
            className="w-full min-h-[80px] px-4 py-3 bg-neutral-950 border border-neutral-800 rounded-md text-neutral-300 placeholder:text-neutral-700 font-mono text-sm focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20 resize-y"
            disabled={isGenerating}
          />
        </div>
      )}

      <div className="flex items-center justify-between pt-4">
        <button
          onClick={onBack}
          disabled={isGenerating}
          className="px-4 py-2 text-neutral-400 hover:text-neutral-200 font-mono text-sm transition-colors disabled:opacity-50 flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>

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
              Generating spec...
            </>
          ) : (
            <>
              Generate Spec
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

/** Expandable "Why this matters" info section */
function WhyThisMatters({ context }: { context: string }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="pt-1">
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        className="flex items-center gap-1.5 text-xs text-neutral-500 hover:text-neutral-400 font-mono transition-colors"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        Why this matters
        <svg
          className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {isOpen && (
        <p className="mt-2 text-xs text-neutral-500 font-mono leading-relaxed pl-5">
          {context}
        </p>
      )}
    </div>
  );
}
