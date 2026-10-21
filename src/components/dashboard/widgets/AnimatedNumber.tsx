import { useEffect, useState } from 'react';

interface AnimatedNumberProps {
  value: number;
  active: boolean;
  decimals?: number;
  suffix?: string;
}

/** Count chart totals and labels from zero as their chart is revealed. */
export function AnimatedNumber({ value, active, decimals = 0, suffix = '' }: AnimatedNumberProps) {
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    if (!active) {
      setCurrent(0);
      return;
    }

    let frame = 0;
    const startedAt = performance.now();
    const duration = 850;
    const tick = (now: number) => {
      const progress = Math.min((now - startedAt) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCurrent(value * eased);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [active, value]);

  const displayed = active ? current : value;
  return <>{displayed.toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}{suffix}</>;
}
