'use client';

import { useEffect, useState } from 'react';
import type { Chunk, ChunkToolCall, ChunkStatus } from '@glm/shared';

interface ExecutionPanelProps {
  chunk: Chunk | null;
  toolCalls: ChunkToolCall[];
  output: string;
  error: string | null;
  isRunning: boolean;
  startedAt: number | null;
  onCancel?: () => void;
}

const statusColors: Record<ChunkToolCall['status'], string> = {
  running: 'text-amber-400',
  completed: 'text-emerald-400',
  error: 'text-red-400',
};

// Extract the actual result from output (skip the prompt section)
function extractResult(output: string): { summary: string; fullOutput: string } {
  if (!output) return { summary: '', fullOutput: '' };

  // The output often contains the full prompt. Try to find the actual result.
  // Look for patterns that indicate the end of prompt / start of result
  const patterns = [
    /## Context[\s\S]*?Begin implementation\.\s*/i,
    /Begin implementation\.\s*/i,
  ];

  let result = output;
  for (const pattern of patterns) {
    const match = output.match(pattern);
    if (match) {
      result = output.slice(match.index! + match[0].length).trim();
      break;
    }
  }

  // If result is very similar to output, just return as-is
  if (result.length > output.length * 0.9) {
    result = output;
  }

  // Create a summary (first ~200 chars)
  const summary = result.length > 200 ? result.slice(0, 200) + '...' : result;

  return { summary: summary || 'Task completed', fullOutput: output };
}

export default function ExecutionPanel({
  chunk,
  toolCalls,
  output,
  error,
  isRunning,
  startedAt,
  onCancel,
}: ExecutionPanelProps) {
  const [elapsed, setElapsed] = useState(0);
  const [showFullOutput, setShowFullOutput] = useState(false);

  // Update elapsed time
  useEffect(() => {
    if (!isRunning || !startedAt) {
      setElapsed(0);
      return;
    }

    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);

    return () => clearInterval(interval);
  }, [isRunning, startedAt]);

  // Format elapsed time
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
  };

  // Extract result from output
  const { summary, fullOutput } = extractResult(output);
  const displayOutput = showFullOutput ? fullOutput : summary;

  if (!chunk) {
    return (
      <div className="h-full flex flex-col">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-mono text-neutral-500 uppercase tracking-wide">
            execution
          </h2>
        </div>
        <div className="flex-1 bg-neutral-900/50 border border-dashed border-neutral-800 rounded-md p-8 flex items-center justify-center">
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-10 h-10 rounded-md bg-neutral-800 mb-3">
              <svg className="w-5 h-5 text-neutral-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className="text-neutral-500 text-xs font-mono">
              select a chunk to view execution
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Terminal-style card */}
      <div className="flex-1 bg-neutral-900/50 border border-neutral-800 rounded-lg overflow-hidden flex flex-col min-h-0">
        {/* Window header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-neutral-800 bg-neutral-900/80 flex-shrink-0">
          <div className="flex items-center gap-3">
            {/* macOS window controls */}
            <div className="flex gap-1.5">
              <div className="h-3 w-3 rounded-full bg-red-500/80" />
              <div className="h-3 w-3 rounded-full bg-amber-500/80" />
              <div className="h-3 w-3 rounded-full bg-emerald-500/80" />
            </div>
            <span className="font-mono text-xs text-neutral-500 truncate max-w-[200px]">{chunk.title}</span>
          </div>
          <div className="flex items-center gap-2">
            {isRunning && (
              <>
                <span className="text-[10px] text-neutral-500 font-mono">
                  {formatTime(elapsed)}
                </span>
                {onCancel && (
                  <button
                    onClick={onCancel}
                    className="text-[10px] font-mono text-red-400 hover:text-red-300 px-2 py-0.5 bg-red-900/20 hover:bg-red-900/30 rounded transition-colors"
                  >
                    cancel
                  </button>
                )}
              </>
            )}
            {!isRunning && chunk.status && (
              <StatusBadge status={chunk.status} />
            )}
          </div>
        </div>

        {/* Tool Calls */}
        <div className="flex-shrink-0 p-3 border-b border-neutral-800/50">
          <h3 className="text-[10px] font-mono text-neutral-600 uppercase mb-2">tool calls</h3>
          {toolCalls.length === 0 ? (
            <div className="bg-neutral-900/50 border border-neutral-800/50 rounded p-2 text-center">
              <p className="text-[10px] text-neutral-600 font-mono">
                {isRunning ? 'waiting for tool calls...' : 'no tool calls'}
              </p>
            </div>
          ) : (
            <div className="bg-neutral-900/50 border border-neutral-800/50 rounded divide-y divide-neutral-800/50 max-h-[150px] overflow-auto">
              {toolCalls.map((tc) => (
                <div key={tc.id} className="px-2 py-1.5 flex items-center gap-2">
                  <span className={`font-mono text-[10px] ${statusColors[tc.status]}`}>
                    {tc.status === 'running' ? '◐' : tc.status === 'completed' ? '✓' : '✕'}
                  </span>
                  <span className="text-xs text-neutral-400 font-mono">{tc.tool}</span>
                  {tc.input && 'file_path' in tc.input && (
                    <span className="text-[10px] text-neutral-600 font-mono truncate flex-1">
                      {String(tc.input.file_path).split('/').pop()}
                    </span>
                  )}
                  {tc.completedAt && tc.startedAt && (
                    <span className="text-[10px] text-neutral-600 font-mono">
                      {((tc.completedAt - tc.startedAt) / 1000).toFixed(1)}s
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Output */}
        <div className="flex-1 min-h-0 flex flex-col p-3">
          <div className="flex items-center justify-between mb-2 flex-shrink-0">
            <h3 className="text-[10px] font-mono text-neutral-600 uppercase">output</h3>
            {output && fullOutput !== summary && (
              <button
                onClick={() => setShowFullOutput(!showFullOutput)}
                className="text-[10px] font-mono text-neutral-500 hover:text-neutral-300 transition-colors"
              >
                {showFullOutput ? '← show summary' : 'show full output →'}
              </button>
            )}
          </div>
          <div className="flex-1 bg-neutral-900/50 border border-neutral-800/50 rounded overflow-hidden">
            {error ? (
              <div className="p-3 text-xs text-red-400 bg-red-900/10 font-mono">
                <p className="font-medium mb-1">error</p>
                <p>{error}</p>
              </div>
            ) : output ? (
              <pre className="p-3 text-xs text-neutral-400 whitespace-pre-wrap font-mono overflow-auto h-full">
                {displayOutput}
              </pre>
            ) : (
              <div className="p-3 flex items-center justify-center h-full">
                <p className="text-[10px] text-neutral-600 font-mono">
                  {isRunning ? 'executing...' : 'no output yet'}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: ChunkStatus }) {
  const config: Record<ChunkStatus, { bg: string; text: string; label: string }> = {
    pending: { bg: 'bg-neutral-800', text: 'text-neutral-400', label: 'pending' },
    running: { bg: 'bg-amber-900/30', text: 'text-amber-400', label: 'running' },
    completed: { bg: 'bg-emerald-900/30', text: 'text-emerald-400', label: 'completed' },
    failed: { bg: 'bg-red-900/30', text: 'text-red-400', label: 'failed' },
    cancelled: { bg: 'bg-amber-900/20', text: 'text-amber-400', label: 'cancelled' },
  };

  const { bg, text, label } = config[status];

  return (
    <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${bg} ${text}`}>
      {label}
    </span>
  );
}
