import { useReducedMotion } from 'motion/react';
import { useCallback, useEffect, useState } from 'react';

/**
 * Reveals each chart once, when its plot enters the app's actual scrolling area.
 * The dashboard scrolls inside an overflow container, so using the window as
 * the observer root can miss the point where a chart is brought into view.
 */
export function useChartRevealAnimation() {
  const [node, setNode] = useState<HTMLDivElement | null>(null);
  const [isInView, setIsInView] = useState(false);
  const reduceMotion = useReducedMotion();

  const ref = useCallback((node: HTMLDivElement | null) => {
    setNode(node);
  }, []);

  useEffect(() => {
    if (!node || isInView) return;

    if (typeof IntersectionObserver === 'undefined') {
      setIsInView(true);
      return;
    }

    const scrollRoot = node.closest('[data-dashboard-scroll-root]');
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting || entry.intersectionRatio < 0.12) return;
      setIsInView(true);
      observer.disconnect();
    }, {
      root: scrollRoot,
      threshold: [0, 0.12],
      rootMargin: '0px 0px -4% 0px',
    });

    observer.observe(node);
    return () => observer.disconnect();
  }, [isInView, node]);

  return { ref, animateChart: isInView && !reduceMotion };
}
