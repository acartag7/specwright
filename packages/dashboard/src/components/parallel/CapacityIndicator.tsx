'use client';

interface CapacityIndicatorProps {
  used: number;
  max: number;
}

export function CapacityIndicator({ used, max }: CapacityIndicatorProps) {
  const percentage = max > 0 ? Math.round((used / max) * 100) : 0;
  const isFull = used >= max;

  return (
    <div className="flex items-center gap-2 text-sm font-mono">
      <div className="flex gap-1">
        {Array.from({ length: max }, (_, i) => (
          <div
            key={i}
            className={`w-2 h-4 rounded-sm ${
              i < used
                ? isFull
                  ? 'bg-amber-500'
                  : 'bg-emerald-500'
                : 'bg-neutral-700'
            }`}
          />
        ))}
      </div>
      <span className={isFull ? 'text-amber-400' : 'text-neutral-400'}>
        {used}/{max}
      </span>
    </div>
  );
}
