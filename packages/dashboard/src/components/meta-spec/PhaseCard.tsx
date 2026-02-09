'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import type { Phase, PhaseStatus } from '@specwright/shared';
import ConfirmModal from '@/components/ConfirmModal';

interface PhaseCardProps {
  phase: Phase;
  projectId: string;
  onStatusChange: (phaseId: string, status: PhaseStatus) => Promise<unknown>;
  onDelete: (phaseId: string) => Promise<boolean>;
}

const STATUS_CONFIG: Record<PhaseStatus, { label: string; colors: string }> = {
  not_started: {
    label: 'Not Started',
    colors: 'bg-neutral-500/10 text-neutral-400 border-neutral-500/20',
  },
  in_progress: {
    label: 'In Progress',
    colors: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  },
  completed: {
    label: 'Completed',
    colors: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  },
};

const STATUS_OPTIONS: PhaseStatus[] = ['not_started', 'in_progress', 'completed'];

export default function PhaseCard({ phase, projectId, onStatusChange, onDelete }: PhaseCardProps) {
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const status = STATUS_CONFIG[phase.status] || STATUS_CONFIG.not_started;

  const handleStatusSelect = useCallback(
    async (newStatus: PhaseStatus) => {
      setShowStatusMenu(false);
      if (newStatus !== phase.status) {
        await onStatusChange(phase.id, newStatus);
      }
    },
    [phase.id, phase.status, onStatusChange],
  );

  const handleDelete = useCallback(async () => {
    setIsDeleting(true);
    const success = await onDelete(phase.id);
    if (!success) setIsDeleting(false);
    setShowDeleteConfirm(false);
  }, [phase.id, onDelete]);

  return (
    <>
      <div className="bg-neutral-900/50 border border-neutral-800 rounded-md p-4 hover:border-neutral-700 transition-colors">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <h4 className="text-sm font-medium text-neutral-100 font-mono truncate">
              {phase.name}
            </h4>
            {phase.description && (
              <p className="text-xs text-neutral-400 font-mono mt-1 line-clamp-2">
                {phase.description}
              </p>
            )}
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Status dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowStatusMenu(!showStatusMenu)}
                className={`px-2 py-0.5 text-[10px] font-mono rounded border cursor-pointer ${status.colors}`}
              >
                {status.label}
              </button>
              {showStatusMenu && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setShowStatusMenu(false)}
                  />
                  <div className="absolute right-0 top-full mt-1 z-20 bg-neutral-800 border border-neutral-700 rounded-md shadow-lg py-1 min-w-[120px]">
                    {STATUS_OPTIONS.map((opt) => (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => handleStatusSelect(opt)}
                        className={`w-full text-left px-3 py-1.5 text-[11px] font-mono hover:bg-neutral-700 transition-colors ${
                          opt === phase.status ? 'text-emerald-400' : 'text-neutral-300'
                        }`}
                      >
                        {STATUS_CONFIG[opt].label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Delete button */}
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(true)}
              className="p-1 text-neutral-600 hover:text-red-400 hover:bg-neutral-800 rounded transition-colors"
              title="Delete phase"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        </div>

        {/* Success Criteria */}
        {phase.successCriteria.length > 0 && (
          <ul className="mt-2 space-y-0.5">
            {phase.successCriteria.map((criterion, i) => (
              <li key={i} className="text-[11px] text-neutral-500 font-mono flex items-start gap-1.5">
                <span className="text-neutral-600 mt-0.5">-</span>
                {criterion}
              </li>
            ))}
          </ul>
        )}

        {/* Create Spec link */}
        <div className="mt-3 pt-2 border-t border-neutral-800/50">
          <Link
            href={`/project/${projectId}/spec/new?phaseId=${phase.id}`}
            onClick={(e) => e.stopPropagation()}
            className="text-[11px] text-emerald-400 hover:text-emerald-300 font-mono flex items-center gap-1 transition-colors"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Create Spec
          </Link>
        </div>
      </div>

      {showDeleteConfirm && (
        <ConfirmModal
          title="Delete Phase"
          message={`Are you sure you want to delete "${phase.name}"? This cannot be undone.`}
          confirmLabel="delete"
          onConfirm={handleDelete}
          onCancel={() => setShowDeleteConfirm(false)}
          isDanger
          isLoading={isDeleting}
        />
      )}
    </>
  );
}
