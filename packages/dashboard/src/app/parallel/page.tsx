'use client';

import Link from 'next/link';
import { useParallelStatus } from '@/hooks/useParallelStatus';
import { CapacityIndicator } from '@/components/parallel/CapacityIndicator';
import { WorkerCard } from '@/components/parallel/WorkerCard';
import { QueueList } from '@/components/parallel/QueueList';
import { ResourceWarnings } from '@/components/parallel/ResourceWarnings';

export default function ParallelDashboardPage() {
  const {
    workers,
    queue,
    capacity,
    isLoading,
    pauseWorker,
    resumeWorker,
    stopWorker,
    removeFromQueue,
    pauseAll,
    resumeAll,
  } = useParallelStatus();

  const runningWorkers = workers.filter(
    w => w.status === 'running' || w.status === 'paused' || w.status === 'idle'
  );
  const hasRunning = runningWorkers.some(w => w.status === 'running');
  const hasPaused = runningWorkers.some(w => w.status === 'paused');

  if (isLoading) {
    return (
      <main className="p-6">
        <p className="text-sm font-mono text-neutral-500">Loading parallel status...</p>
      </main>
    );
  }

  return (
    <main className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-semibold text-neutral-100">Parallel Execution</h1>
          <Link
            href="/"
            className="text-xs font-mono text-neutral-500 hover:text-neutral-300 transition-colors"
            onClick={(e) => e.stopPropagation()}
          >
            back to projects
          </Link>
        </div>
        <CapacityIndicator used={capacity.used} max={capacity.max} />
      </div>

      {/* Bulk controls */}
      {runningWorkers.length > 1 && (
        <div className="flex gap-2">
          {hasRunning && (
            <button
              onClick={pauseAll}
              className="px-3 py-1.5 text-xs font-mono rounded border border-neutral-700 bg-neutral-800 text-neutral-300 hover:bg-neutral-700 transition-colors"
            >
              Pause All
            </button>
          )}
          {hasPaused && (
            <button
              onClick={resumeAll}
              className="px-3 py-1.5 text-xs font-mono rounded border border-emerald-700 bg-emerald-900/30 text-emerald-400 hover:bg-emerald-900/50 transition-colors"
            >
              Resume All
            </button>
          )}
        </div>
      )}

      {/* Running Workers */}
      <section>
        <h2 className="text-sm font-mono text-neutral-400 mb-3">
          Running ({runningWorkers.length})
        </h2>
        {runningWorkers.length === 0 ? (
          <p className="text-sm text-neutral-600 font-mono">No specs currently running.</p>
        ) : (
          <div className="space-y-3">
            {runningWorkers.map(worker => (
              <WorkerCard
                key={worker.id}
                worker={worker}
                onPause={() => pauseWorker(worker.id)}
                onResume={() => resumeWorker(worker.id)}
                onStop={() => stopWorker(worker.id)}
              />
            ))}
          </div>
        )}
      </section>

      {/* Queue */}
      {queue.length > 0 && (
        <section>
          <h2 className="text-sm font-mono text-neutral-400 mb-3">
            Queued ({queue.length})
          </h2>
          <QueueList items={queue} onRemove={removeFromQueue} />
        </section>
      )}

      {/* Resource Warnings */}
      <ResourceWarnings workerCount={runningWorkers.length} />
    </main>
  );
}
