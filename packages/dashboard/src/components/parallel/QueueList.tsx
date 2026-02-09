'use client';

import type { WorkerQueueItem } from '@specwright/shared';

interface QueueListProps {
  items: WorkerQueueItem[];
  onRemove: (queueId: string) => void;
}

export function QueueList({ items, onRemove }: QueueListProps) {
  if (items.length === 0) return null;

  return (
    <div className="space-y-2">
      {items.map((item, index) => (
        <div
          key={item.id}
          className="flex items-center justify-between border border-neutral-800 rounded-lg px-4 py-3 bg-neutral-900/30"
        >
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-xs font-mono text-neutral-600 w-5 text-right shrink-0">
              #{index + 1}
            </span>
            <div className="min-w-0">
              <p className="text-sm text-neutral-200 truncate">
                {item.specTitle || item.specId}
              </p>
              {item.projectName && (
                <p className="text-xs text-neutral-500">{item.projectName}</p>
              )}
            </div>
          </div>
          <button
            onClick={() => onRemove(item.id)}
            className="px-2 py-1 text-xs font-mono rounded border border-neutral-700 bg-neutral-800 text-neutral-400 hover:text-red-400 hover:border-red-800 transition-colors shrink-0"
          >
            Remove
          </button>
        </div>
      ))}
    </div>
  );
}
