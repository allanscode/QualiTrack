import { useCallback, useEffect, useRef, useState } from 'react';
import { AuditingQueueType } from '../types';
import { checkQueueUpdates } from '../lib/helpdeskQueue';

const CHECK_INTERVAL_MS = 3 * 60_000;

interface QueueUpdateNoticeOptions {
  activeQueue: AuditingQueueType;
  enabled: boolean;
  searchTerm: string;
  loading: boolean;
  batchRunning: boolean;
}

export function useQueueUpdateNotice({
  activeQueue, enabled, searchTerm, loading, batchRunning,
}: QueueUpdateNoticeOptions) {
  const [hasUpdates, setHasUpdates] = useState(false);
  const knownIds = useRef(new Map<AuditingQueueType, Set<string>>());
  const activeQueueRef = useRef(activeQueue);
  const lastCheckedAt = useRef(0);
  const checkInFlight = useRef(false);
  const baselineGeneration = useRef(0);
  activeQueueRef.current = activeQueue;

  const rememberPage = useCallback((queue: AuditingQueueType, ticketIds: string[]) => {
    const generation = ++baselineGeneration.current;
    knownIds.current.set(queue, new Set(ticketIds));
    lastCheckedAt.current = Date.now();
    setHasUpdates(false);
    // A view pode ter ordenação própria. Estabelece a referência com a mesma
    // consulta leve usada nas verificações, sem trocar a lista renderizada.
    checkQueueUpdates(queue).then(latestIds => {
      if (baselineGeneration.current !== generation || activeQueueRef.current !== queue) return;
      knownIds.current.set(queue, new Set(latestIds));
      lastCheckedAt.current = Date.now();
    }).catch(error => {
      console.warn('[AuditingQueue] Não foi possível registrar a referência da fila:', error);
    });
  }, []);

  useEffect(() => { setHasUpdates(false); }, [activeQueue]);

  useEffect(() => {
    if (!enabled || searchTerm.trim() || loading || batchRunning) return;

    const check = async () => {
      if (document.visibilityState !== 'visible' || checkInFlight.current ||
          Date.now() - lastCheckedAt.current < CHECK_INTERVAL_MS) return;
      const baseline = knownIds.current.get(activeQueue);
      if (!baseline) return;
      const generation = baselineGeneration.current;
      checkInFlight.current = true;
      lastCheckedAt.current = Date.now();
      try {
        const latestIds = await checkQueueUpdates(activeQueue);
        if (activeQueueRef.current === activeQueue && baselineGeneration.current === generation &&
            latestIds.some(id => !baseline.has(id))) {
          setHasUpdates(true);
        }
      } catch (error) {
        console.warn('[AuditingQueue] Não foi possível conferir novidades da fila:', error);
      } finally {
        checkInFlight.current = false;
      }
    };

    const timer = window.setInterval(check, CHECK_INTERVAL_MS);
    document.addEventListener('visibilitychange', check);
    window.addEventListener('focus', check);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', check);
      window.removeEventListener('focus', check);
    };
  }, [activeQueue, enabled, searchTerm, loading, batchRunning]);

  return { hasUpdates, rememberPage };
}
