'use client';

import type { Spec } from '@specwright/shared';
import { useSpecStudio } from '../../hooks/useSpecStudio';
import StepIndicator from './StepIndicator';
import IntentStep from './IntentStep';
import QuestionsStep from './QuestionsStep';
import ReviewStep from './ReviewStep';
import ChunksStep from './ChunksStep';
import ConfirmModal from '../ConfirmModal';

interface SpecStudioWizardProps {
  projectId: string;
  projectName: string;
  projectDirectory: string;
  specId?: string;
  existingSpec?: Spec;
  onComplete: () => void;
}

export default function SpecStudioWizard({
  projectId,
  projectName,
  projectDirectory,
  specId,
  existingSpec,
  onComplete,
}: SpecStudioWizardProps) {
  const studio = useSpecStudio({
    projectId,
    projectName,
    projectDirectory,
    specId,
    existingSpec,
    onComplete,
  });

  if (studio.isLoading) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:64px_64px]">
        <div className="flex items-center gap-3 text-neutral-400 font-mono">
          <svg className="animate-spin w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          Loading studio...
        </div>
      </div>
    );
  }

  if (studio.error && !studio.studioState) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:64px_64px]">
        <div className="text-center">
          <h2 className="text-xl font-medium text-neutral-100 mb-2 font-mono">{studio.error}</h2>
          <button
            onClick={() => studio.handleNavigationAttempt('/')}
            className="text-emerald-400 hover:text-emerald-300 text-sm font-mono"
          >
            Back to projects
          </button>
        </div>
      </div>
    );
  }

  if (!studio.studioState) return null;

  const { studioState } = studio;

  return (
    <div className="min-h-screen bg-neutral-950 flex flex-col bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:64px_64px]">
      {/* Header */}
      <header className="border-b border-neutral-800/80 bg-neutral-950/90 backdrop-blur-sm sticky top-0 z-10">
        <div className="px-6 py-3 flex items-center gap-4">
          <button
            onClick={() => studio.handleNavigationAttempt('/')}
            className="p-1.5 text-neutral-500 hover:text-neutral-300 hover:bg-neutral-800 rounded-md transition-colors"
            title="Back to projects"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </button>
          <div className="flex items-center gap-2 text-sm font-mono">
            <span className="text-neutral-500">/</span>
            <span className="text-neutral-400">project</span>
            <span className="text-neutral-500">/</span>
            <span className="text-neutral-100">{projectName}</span>
          </div>
          <div className="flex-1" />
          <StepIndicator
            currentStep={studioState.step}
            maxCompletedIndex={studio.maxCompletedIndex}
            onStepClick={studio.goToStep}
          />
          {studio.isSaving && (
            <span className="text-[10px] text-neutral-500 font-mono">saving...</span>
          )}
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex items-start justify-center p-6">
        <div className="w-full max-w-3xl">
          {/* Error Banner */}
          {studio.error && (
            <div className="mb-4 p-3 bg-red-900/20 border border-red-500/30 rounded-md">
              <p className="text-sm text-red-400 font-mono">{studio.error}</p>
              <button
                onClick={() => studio.setError(null)}
                className="text-xs text-red-500 hover:text-red-400 mt-1 font-mono"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Step Content */}
          <div className="bg-neutral-900/50 border border-neutral-800 rounded-lg overflow-hidden">
            <div className="px-6 py-4 border-b border-neutral-800 flex items-center gap-3">
              <div className="flex gap-1.5">
                <div className="h-3 w-3 rounded-full bg-red-500/80" />
                <div className="h-3 w-3 rounded-full bg-amber-500/80" />
                <div className="h-3 w-3 rounded-full bg-emerald-500/80" />
              </div>
              <span className="font-mono text-xs text-neutral-600">spec-studio</span>
              <div className="flex-1" />
              <span className="font-mono text-xs text-neutral-600">{projectDirectory}</span>
            </div>

            <div className="p-6">
              {studioState.step === 'intent' && (
                <IntentStep
                  intent={studioState.intent}
                  onChange={studio.handleIntentChange}
                  onNext={studio.handleIntentNext}
                  isGenerating={studio.isGenerating}
                />
              )}

              {studioState.step === 'questions' && (
                <QuestionsStep
                  questions={studioState.questions}
                  answers={studioState.answers}
                  onAnswerChange={studio.handleAnswerChange}
                  onBack={studio.handleQuestionsBack}
                  onNext={studio.handleQuestionsNext}
                  isGenerating={studio.isGenerating}
                  additionalNotes={studio.additionalNotes}
                  onAdditionalNotesChange={studio.setAdditionalNotes}
                />
              )}

              {(studioState.step === 'review' || studioState.step === 'config') && (
                <ReviewStep
                  spec={studioState.generatedSpec}
                  onSpecChange={studio.handleSpecChange}
                  onBack={studio.handleReviewBack}
                  onNext={studio.handleReviewNext}
                  onRefine={studio.handleRefine}
                  isRefining={studio.isGenerating}
                />
              )}

              {studioState.step === 'chunks' && (
                <ChunksStep
                  chunks={studioState.suggestedChunks}
                  onChunksChange={studio.handleChunksChange}
                  onBack={studio.handleChunksBack}
                  onComplete={studio.handleComplete}
                  isCompleting={studio.isGenerating}
                />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Warning Modal */}
      {studio.showNavigationWarning && (
        <ConfirmModal
          title="Unsaved Changes"
          message="You have unsaved changes in the spec wizard. Are you sure you want to leave? Your progress will be lost."
          confirmLabel="Leave"
          cancelLabel="Stay"
          onConfirm={studio.handleConfirmNavigation}
          onCancel={studio.handleCancelNavigation}
          isDanger
        />
      )}
    </div>
  );
}
