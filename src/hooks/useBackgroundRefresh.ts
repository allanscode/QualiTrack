import { useEffect, useRef } from 'react';

/** Revalidate visible screens without clearing their content or polling hidden tabs. */
export function useBackgroundRefresh(refresh: () => void | Promise<unknown>, enabled = true) {
  const latest = useRef(refresh);
  latest.current = refresh;
  useEffect(() => {
    if (!enabled) return;
    let lastRefresh = Date.now();
    const check = () => {
      if (document.visibilityState !== 'visible' || Date.now() - lastRefresh < 180_000) return;
      lastRefresh = Date.now();
      void latest.current();
    };
    const timer = window.setInterval(check, 180_000);
    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', check);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', check);
      document.removeEventListener('visibilitychange', check);
    };
  }, [enabled]);
}
