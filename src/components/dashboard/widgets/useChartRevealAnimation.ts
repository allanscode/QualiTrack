import { useInView, useReducedMotion } from 'motion/react';
import { useRef } from 'react';

/** Start a chart's Recharts entrance animation the first time its plot is visible. */
export function useChartRevealAnimation() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, amount: 0.12 });
  const reduceMotion = useReducedMotion();

  return { ref, animateChart: isInView && !reduceMotion };
}
