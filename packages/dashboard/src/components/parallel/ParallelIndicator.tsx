'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';

export function ParallelIndicator() {
  const [activeCount, setActiveCount] = useState(0);

  useEffect(() => {
    let mounted = true;

    async function fetchCount() {
      try {
        const res = await fetch('/api/parallel/status');
        if (res.ok && mounted) {
          const data = await res.json();
          setActiveCount(data.capacity?.used ?? 0);
        }
      } catch {
        // Silently ignore — indicator is non-critical
      }
    }

    fetchCount();
    const interval = setInterval(fetchCount, 5000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  if (activeCount === 0) return null;

  return (
    <Link
      href="/parallel"
      className="flex items-center gap-2 text-xs font-mono text-neutral-400 hover:text-neutral-200 transition-colors"
      onClick={(e) => e.stopPropagation()}
    >
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
      </span>
      <span>
        {activeCount} spec{activeCount > 1 ? 's' : ''} running
      </span>
    </Link>
  );
}
