import { useEffect, useMemo, useRef } from 'react';
import { createPageCacheWriter, readPageCache } from '../lib/pageCache';

/** Scoped snapshots complement each page's existing fetch/realtime lifecycle. */
export function usePageCache<T>(scope: string, page: string) {
  const identity = JSON.stringify([scope, page]);
  const current = useRef(identity);
  current.current = identity;
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  return useMemo(() => {
    const key = [scope, page];
    const write = createPageCacheWriter<T>(key);
    return {
      initial: readPageCache<T>(key),
      write: (data: T) => {
        if (mounted.current && current.current === identity) write(data);
      },
      isCurrent: () => mounted.current && current.current === identity,
    };
  }, [identity, scope, page]);
}
