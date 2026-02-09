'use client';

import type { Worker } from '@specwright/shared';

interface WorkerCardProps {
  worker: Worker;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
}

function StatusBadge({ status }: { status: Worker['status'] }) {
  const colors: Record<string, string> = {
    running: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    paused: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    idle: 'bg-neutral-500/20 text-neutral-400 border-neutral-500/30',
    completed: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    failed: 'bg-red-500/20 text-red-400 border-red-500/30',
  };

  return (
    <span className={`text-xs font-mono px-2 py-0.5 rounded border ${colors[status] || colors.idle}`}>
      {status}
    </span>
  );
}

export function WorkerCard({ worker, onPause, onResume, onStop }: WorkerCardProps) {
  const progress = worker.progress;
  const progressPercent = progress.total > 0
    ? Math.round((progress.current / progress.total) * 100)
    : 0;

  return (
    <div className="border border-neutral-800 rounded-lg p-4 bg-neutral-900/50">
      <div className="flex justify-between items-start">
        <div className="min-w-0 flex-1">
          <h3 className="font-medium text-sm text-neutral-100 truncate">
            {worker.specTitle || worker.specId}
          </h3>
          {worker.projectName && (
            <p className="text-xs text-neutral-500 mt-0.5">{worker.projectName}</p>
          )}
        </div>
        <StatusBadge status={worker.status} />
      </div>

      {progress.total > 0 && (
        <div className="mt-3">
          <div className="flex justify-between text-xs text-neutral-400 mb-1 font-mono">
            <span>Chunk {progress.current} of {progress.total}</span>
            <span>
              {progress.passed} passed
              {progress.failed > 0 && <span className="text-red-400">, {progress.failed} failed</span>}
            </span>
          </div>
          <div className="w-full h-1.5 bg-neutral-800 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                progress.failed > 0 ? 'bg-red-500' : 'bg-emerald-500'
              }`}
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      )}

      {worker.currentChunkTitle && (
        <p className="text-xs text-neutral-500 mt-2 font-mono truncate">
          {worker.currentStep === 'reviewing' ? 'Reviewing' : 'Executing'}: {worker.currentChunkTitle}
        </p>
      )}

      <div className="flex gap-2 mt-3">
        {worker.status === 'running' && (
          <button
            onClick={onPause}
            className="px-2.5 py-1 text-xs font-mono rounded border border-neutral-700 bg-neutral-800 text-neutral-300 hover:bg-neutral-700 transition-colors"
          >
            Pause
          </button>
        )}
        {worker.status === 'paused' && (
          <button
            onClick={onResume}
            className="px-2.5 py-1 text-xs font-mono rounded border border-emerald-700 bg-emerald-900/30 text-emerald-400 hover:bg-emerald-900/50 transition-colors"
          >
            Resume
          </button>
        )}
        <button
          onClick={onStop}
          className="px-2.5 py-1 text-xs font-mono rounded border border-red-800 bg-red-900/20 text-red-400 hover:bg-red-900/40 transition-colors"
        >
          Stop
        </button>
      </div>
    </div>
  );
}
