import { useCallback, useEffect, useState } from 'react';

/**
 * Reveals each chart once, when its plot enters the app's actual scrolling area.
 * The dashboard scrolls inside an overflow container, so using the window as
 * the observer root can miss the point where a chart is brought into view.
 */
export function useChartRevealAnimation() {
  const [node, setNode] = useState<HTMLElement | null>(null);
  const [isInView, setIsInView] = useState(false);

  const ref = useCallback((node: HTMLElement | null) => {
    setNode(node);
  }, []);

  useEffect(() => {
    if (!node || isInView) return;

    const scrollRoot = node.closest('[data-dashboard-scroll-root]');
    const revealIfVisible = () => {
      const target = node.getBoundingClientRect();
      const root = scrollRoot?.getBoundingClientRect();
      const top = root ? root.top + (scrollRoot?.clientTop || 0) : 0;
      const left = root ? root.left + (scrollRoot?.clientLeft || 0) : 0;
      const bottom = root ? top + (scrollRoot?.clientHeight || 0) : window.innerHeight;
      const right = root ? left + (scrollRoot?.clientWidth || 0) : window.innerWidth;
      const visibleWidth = Math.max(0, Math.min(target.right, right) - Math.max(target.left, left));
      const visibleHeight = Math.max(0, Math.min(target.bottom, bottom) - Math.max(target.top, top));
      const area = Math.max(1, target.width * target.height);
      if ((visibleWidth * visibleHeight) / area < 0.12) return;
      setIsInView(true);
    };

    // The dashboard scrolls inside an overflow element. Checking its geometry
    // on both scroll sources avoids relying on the browser's viewport observer
    // when cards are portaled into their dashboard slots.
    revealIfVisible();
    const onScroll = () => requestAnimationFrame(revealIfVisible);
    scrollRoot?.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(onScroll);
    resizeObserver?.observe(node);
    if (scrollRoot) resizeObserver?.observe(scrollRoot);

    return () => {
      scrollRoot?.removeEventListener('scroll', onScroll);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      resizeObserver?.disconnect();
    };
  }, [isInView, node]);

  return { ref, animateChart: isInView };
}
