import { useEffect, useState } from 'react';

interface AnimatedProgressBarProps {
  value: number;
  active: boolean;
  color: string;
  delayMs?: number;
}

/** Progress segment for dashboard charts; starts at zero and reveals once with its chart. */
export function AnimatedProgressBar({ value, active, color, delayMs = 0 }: AnimatedProgressBarProps) {
  const percentage = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!active || armed) return;

    // Give the browser a committed 0% frame before starting the transition.
    let firstFrame = 0;
    let secondFrame = 0;
    firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => setArmed(true));
    });

    return () => {
      cancelAnimationFrame(firstFrame);
      cancelAnimationFrame(secondFrame);
    };
  }, [active, armed]);

  const isRevealed = active && armed;

  return (
    <div className="h-full w-full overflow-hidden rounded-full bg-surface-subtle" aria-hidden="true">
      <div
        className="h-full rounded-full transition-[width] duration-1000 ease-out motion-reduce:transition-none"
        style={{
          width: isRevealed ? `${percentage}%` : '0%',
          backgroundColor: color,
          transitionDelay: isRevealed ? `${Math.max(0, Math.min(560, delayMs))}ms` : '0ms',
        }}
      />
    </div>
  );
}
