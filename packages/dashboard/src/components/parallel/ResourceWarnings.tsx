'use client';

interface ResourceWarningsProps {
  workerCount: number;
}

export function ResourceWarnings({ workerCount }: ResourceWarningsProps) {
  if (workerCount < 5) return null;

  return (
    <div className="bg-yellow-900/20 border border-yellow-700/50 rounded-lg p-4">
      <h3 className="font-medium text-yellow-500 text-sm mb-1">Resource Warning</h3>
      <p className="text-xs text-yellow-400/80">
        {workerCount} worktrees active. Each worktree is a full repo copy.
        Consider cleaning up completed specs to free disk space.
      </p>
    </div>
  );
}
