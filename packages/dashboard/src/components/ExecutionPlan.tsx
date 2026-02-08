'use client';

import { useMemo } from 'react';
import type { Chunk } from '@specwright/shared';
import { buildExecutionPlan, calculateLayout, calculateCriticalPath, groupByLayers } from '@/lib/graph-layout';
import { buildWaveSchedule } from '@/lib/execution/wave-scheduler';

interface ExecutionPlanProps {
  chunks: Chunk[];
  onRunAll?: () => void;
  isRunning?: boolean;
}

export default function ExecutionPlan({
  chunks,
  onRunAll,
  isRunning,
}: ExecutionPlanProps) {
  const chunkMap = useMemo(
    () => new Map(chunks.map(c => [c.id, c])),
    [chunks]
  );

  const plan = useMemo(() => buildExecutionPlan(chunks), [chunks]);
  const waveSchedule = useMemo(() => buildWaveSchedule(chunks), [chunks]);

  const graph = useMemo(() => calculateLayout(chunks), [chunks]);
  const criticalPath = useMemo(() => calculateCriticalPath(graph), [graph]);
  const layers = useMemo(() => groupByLayers(graph), [graph]);

  // Get critical path titles
  const criticalPathTitles = criticalPath.map(id => {
    const chunk = chunkMap.get(id);
    return chunk?.title || id;
  });

  // Calculate stats
  const totalPending = chunks.filter(c =>
    c.status === 'pending' || c.status === 'failed' || c.status === 'cancelled'
  ).length;
  const totalCompleted = chunks.filter(c => c.status === 'completed').length;
  const parallelWaves = waveSchedule.waves.filter(w => w.parallel).length;
  const totalWaves = waveSchedule.waves.length;

  if (chunks.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="bg-neutral-900/50 border border-dashed border-neutral-800 rounded-md p-6 text-center">
          <p className="text-neutral-600 text-xs font-mono">
            no chunks yet. break your spec into executable tasks.
          </p>
        </div>
      </div>
    );
  }

  if (plan.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="bg-emerald-950/20 border border-emerald-500/30 rounded-md p-6 text-center">
          <p className="text-emerald-400 text-xs font-mono">
            All chunks completed!
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header with Run button */}
      <div className="flex-shrink-0 flex items-center justify-between mb-4 px-1">
        <div>
          <h3 className="text-sm font-mono text-neutral-200">Execution Plan</h3>
          <p className="text-[10px] font-mono text-neutral-500 mt-1">
            {totalPending} chunks to run | {totalWaves} {totalWaves === 1 ? 'wave' : 'waves'} | {parallelWaves} parallel
          </p>
        </div>
        {onRunAll && (
          <button
            onClick={onRunAll}
            disabled={isRunning}
            className={`text-xs font-mono px-4 py-2 rounded transition-colors flex items-center gap-2 ${
              isRunning
                ? 'bg-amber-500/20 text-amber-400 cursor-not-allowed'
                : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/30'
            }`}
          >
            {isRunning ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Running...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
                Run All
              </>
            )}
          </button>
        )}
      </div>

      {/* Wave steps */}
      <div className="flex-1 overflow-auto space-y-3 pb-4">
        {waveSchedule.waves.map((wave) => (
          <div
            key={wave.index}
            className="border border-neutral-800 rounded-lg overflow-hidden"
          >
            {/* Wave header */}
            <div className="px-3 py-2 bg-neutral-900/50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono text-neutral-950 bg-neutral-400 px-1.5 py-0.5 rounded font-bold">
                  W{wave.index}
                </span>
                <span className="text-[11px] font-mono text-neutral-400">
                  {wave.parallel ? 'Parallel' : 'Sequential'}
                  <span className="text-neutral-600 ml-2">
                    ({wave.chunks.length} {wave.chunks.length === 1 ? 'chunk' : 'chunks'})
                  </span>
                </span>
              </div>
              {wave.parallel && (
                <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded">
                  parallel
                </span>
              )}
            </div>

            {/* Chunks in this wave */}
            <div className="p-3 bg-neutral-950/50 space-y-2">
              {wave.chunks.map((chunk, chunkIdx) => {
                const fullChunk = chunkMap.get(chunk.id);

                return (
                  <div
                    key={chunk.id}
                    className="flex items-start gap-2 text-xs font-mono"
                  >
                    <span className="text-neutral-600 w-4 text-right flex-shrink-0">
                      {wave.parallel ? '||' : chunkIdx === wave.chunks.length - 1 ? '\\-' : '|-'}
                    </span>
                    <div className="flex-1 min-w-0">
                      <span className="text-neutral-200">{chunk.title}</span>
                      {fullChunk && fullChunk.dependencies.length > 0 && (
                        <div className="text-[10px] text-neutral-500 mt-0.5">
                          depends on: {fullChunk.dependencies.slice(0, 3).map(depId => {
                            const dep = chunkMap.get(depId);
                            return dep?.title || depId;
                          }).join(', ')}
                          {fullChunk.dependencies.length > 3 && ` +${fullChunk.dependencies.length - 3}`}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Serialization reasons */}
      {waveSchedule.serializedChunks.length > 0 && (
        <div className="flex-shrink-0 mt-2 p-3 bg-blue-950/10 border border-blue-500/20 rounded-lg space-y-1">
          <span className="text-[11px] font-mono text-blue-400">File overlap serialization</span>
          {waveSchedule.serializedChunks.map((sr, idx) => {
            const titleA = chunkMap.get(sr.chunkA)?.title || sr.chunkA;
            const titleB = chunkMap.get(sr.chunkB)?.title || sr.chunkB;
            const shortFiles = sr.overlappingFiles.slice(0, 2).join(', ');
            const extra = sr.overlappingFiles.length > 2 ? ` +${sr.overlappingFiles.length - 2}` : '';
            return (
              <p key={idx} className="text-[10px] font-mono text-neutral-400">
                {titleA} and {titleB} both modify {shortFiles}{extra} — running sequentially
              </p>
            );
          })}
        </div>
      )}

      {/* Critical path */}
      {criticalPath.length > 1 && (
        <div className="flex-shrink-0 mt-2 p-3 bg-amber-950/10 border border-amber-500/20 rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[11px] font-mono text-amber-400">Critical Path</span>
            <span className="text-[10px] font-mono text-neutral-500">
              (longest dependency chain - {criticalPath.length} chunks)
            </span>
          </div>
          <div className="text-[10px] font-mono text-neutral-400">
            {criticalPathTitles.map((title, idx) => (
              <span key={idx}>
                {title.length > 20 ? title.slice(0, 18) + '...' : title}
                {idx < criticalPathTitles.length - 1 && (
                  <span className="text-amber-500/60 mx-1">{'->'}</span>
                )}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Summary */}
      <div className="flex-shrink-0 mt-3 px-1 text-[10px] font-mono text-neutral-500">
        <div className="flex items-center gap-4">
          <span>{totalCompleted} completed</span>
          <span>{totalPending} pending</span>
          <span>{layers.length} {layers.length === 1 ? 'layer' : 'layers'}</span>
        </div>
      </div>
    </div>
  );
}
