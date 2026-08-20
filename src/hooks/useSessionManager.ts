import { useEffect, useRef, useCallback } from 'react';
import { supabase, isMockMode } from '../lib/supabase';
import { useTheme, resolveSystemTheme, applyThemeToDOM } from '../providers/ThemeProvider';
import { toast } from 'sonner';

export const IDLE_TIMEOUT_MS = 60 * 60 * 1000;
const IDLE_WARNING_MS = 5 * 60 * 1000;
export const ABSOLUTE_TIMEOUT_MS = 8 * 60 * 60 * 1000;
// REMOVED: SESSION_REFRESH_MS - autoRefreshToken handles token refresh
export const MOCK_SESSION_KEY = 'qualitrack_session';
export const LAST_ACTIVITY_KEY = 'qualitrack_last_activity';

export const lastDbThemeRef = { current: null as ('light' | 'dark' | 'system' | null) };

interface SessionManagerOptions {
  currentUser: any;
  isCleaningSessionRef: React.MutableRefObject<boolean>;
  prevUserIdRef: React.MutableRefObject<string | null>;
  sessionStartTimeRef: React.MutableRefObject<number | null>;
  showIdleWarning: boolean;
  setShowIdleWarning: (v: boolean) => void;
  setIdleCountdown: (v: number | ((prev: number) => number)) => void;
  setAppReady: (v: boolean) => void;
  setCurrentUser: (u: any) => void;
  setUserData: (u: any) => void;
  setAuthView: (v: any) => void;
  setIsSystemOnline: (v: boolean) => void;
  setIsReconnecting: (v: boolean) => void;
  setTheme: (t: any) => void;
}

export function useSessionManager(opts: SessionManagerOptions) {
  const {
    currentUser,
    isCleaningSessionRef,
    prevUserIdRef,
    sessionStartTimeRef,
    showIdleWarning,
    setShowIdleWarning,
    setIdleCountdown,
    setAppReady,
    setCurrentUser,
    setUserData,
    setAuthView,
    setIsSystemOnline,
    setIsReconnecting,
    setTheme,
  } = opts;

  // Shared checkAbsoluteTimeout function accessible to both useEffects
  const checkAbsoluteTimeout = useCallback(() => {
    if (!sessionStartTimeRef.current) return false;
    const elapsed = Date.now() - sessionStartTimeRef.current;
    if (elapsed >= ABSOLUTE_TIMEOUT_MS) {
      return true;
    }
    return false;
  }, []);

  // Ref for lastFocusCheck to persist across effect re-runs (persists throttle state)
  const lastFocusCheckRef = useRef(0);

  // --- Session Resilience, Active Reconnection & Visibility Change (Consolidated) ---
  useEffect(() => {
    if (isMockMode || !supabase || !currentUser) return;
    const sb = supabase!;
    let reconnectInterval: ReturnType<typeof setInterval> | null = null;
    let wasOffline = false;

    const pingSupabase = async (): Promise<boolean> => {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        const { error } = await sb.from('users').select('id').limit(1).abortSignal(controller.signal);
        clearTimeout(timeout);

        if (error && error.message !== 'JWT expired') {
          console.warn('[System] Ping falhou, erro retornado pelo DB:', error);
          if (error.code === 'PGRST301' || error.message.includes('auth')) return true;
          throw error;
        }
        return true;
      } catch (e: any) {
        console.error('[System] Ping catch error:', e.message || e);
        return false;
      }
    };

    const handleOnlineStatusChange = async (online: boolean) => {
      setIsSystemOnline(online);
      if (online && wasOffline) {
        console.log('[System] Reconexão detectada! Notificando componentes...');
        setIsReconnecting(false);
        // REMOVED: manual refreshSession() - autoRefreshToken handles this
        window.dispatchEvent(new CustomEvent('qualitrack:reconnected'));
        if (reconnectInterval) {
          clearInterval(reconnectInterval);
          reconnectInterval = null;
        }
      } else if (!online && !wasOffline) {
        console.warn('[System] Conexão perdida. Iniciando reconexão ativa...');
        wasOffline = true;
        setIsReconnecting(true);
        if (!reconnectInterval) {
          reconnectInterval = setInterval(async () => {
            console.log('[System] Tentando reconectar...');
            const ok = await pingSupabase();
            if (ok) handleOnlineStatusChange(true);
          }, 5000);
        }
      }
    };

    // Heartbeat ping every 2 minutes (renamed to avoid conflict with idle effect)
    const resilienceHeartbeatInterval = setInterval(async () => {
      const ok = await pingSupabase();
      handleOnlineStatusChange(ok);
    }, 2 * 60 * 1000);

    // CONSOLIDATED: Single visibilitychange handler with 15s throttle
    // Checks absolute timeout, validates session, only refreshes if <15min to expiry (fallback only)
    const handleVisibilityChange = async () => {
      const now = Date.now();
      if (document.visibilityState !== 'visible') return;
      if (now - lastFocusCheckRef.current <= 15000) return; // 15s throttle

      if (checkAbsoluteTimeout()) return; // Check absolute timeout first

      lastFocusCheckRef.current = now;

      if (!isMockMode) {
        try {
          const { data: { session } } = await sb.auth.getSession();
          if (session) {
            const timeToExpiry = (session.expires_at || 0) - Math.floor(now / 1000);
            // Only refresh if session expires in <15min (fallback - autoRefreshToken should handle this)
            if (timeToExpiry < 900) {
              console.log('[System] Session expiring soon, triggering refresh as fallback');
              await sb.auth.refreshSession();
            }
          }
        } catch (e) {
          console.warn('[System] visibilitychange: getSession/refresh failed:', e);
        }
      }
    };

    const handleBrowserOnline = () => {
      console.log('[System] Navegador reportou: online');
      pingSupabase().then(ok => handleOnlineStatusChange(ok));
    };
    const handleBrowserOffline = () => {
      console.log('[System] Navegador reportou: offline');
      handleOnlineStatusChange(false);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('online', handleBrowserOnline);
    window.addEventListener('offline', handleBrowserOffline);

    // Initial ping
    pingSupabase().then(ok => handleOnlineStatusChange(ok));

    return () => {
      clearInterval(resilienceHeartbeatInterval);
      if (reconnectInterval) clearInterval(reconnectInterval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('online', handleBrowserOnline);
      window.removeEventListener('offline', handleBrowserOffline);
    };
  }, [isMockMode, currentUser, checkAbsoluteTimeout]);

  // --- Idle Timeout + Warning + Absolute Timeout (NO proactive refresh) ---
  const extendSessionRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (!currentUser) {
      extendSessionRef.current = () => {};
      return;
    }

    let idleTimerId: NodeJS.Timeout;
    let warningIntervalId: NodeJS.Timeout;
    let lastActivity = Number(localStorage.getItem(LAST_ACTIVITY_KEY)) || Date.now();

    const forceLogout = async (reason: string) => {
      setShowIdleWarning(false);
      setAppReady(false);
      localStorage.removeItem(MOCK_SESSION_KEY);
      localStorage.removeItem(LAST_ACTIVITY_KEY);
      // Theme preference remains stored per user.
      lastDbThemeRef.current = null;
      prevUserIdRef.current = null;
      if (!isMockMode && supabase) {
        isCleaningSessionRef.current = true;
        await supabase.auth.signOut();
      }
      setCurrentUser(null);
      setUserData(null);
      setAuthView('login');
      sessionStartTimeRef.current = null;
      toast.error(reason);
    };

    const idleElapsed = Date.now() - lastActivity;
    if (idleElapsed >= IDLE_TIMEOUT_MS) {
      forceLogout('Sessão encerrada por inatividade (60 minutos). Faça login novamente.');
      return;
    }
    if (sessionStartTimeRef.current && (Date.now() - sessionStartTimeRef.current) >= ABSOLUTE_TIMEOUT_MS) {
      forceLogout('Sessão encerrada após 8 horas contínuas. Faça login novamente.');
      return;
    }

    const doExtendSession = () => {
      setShowIdleWarning(false);
      clearInterval(warningIntervalId);
      startIdleTimer();
      // REMOVED: proactive refreshSession() - autoRefreshToken handles this
    };

    extendSessionRef.current = doExtendSession;

    const startIdleTimer = () => {
      clearTimeout(idleTimerId);
      clearInterval(warningIntervalId);
      setShowIdleWarning(false);

      idleTimerId = setTimeout(() => {
        if (checkAbsoluteTimeout()) return;

        setShowIdleWarning(true);
        setIdleCountdown(Math.ceil(IDLE_WARNING_MS / 1000));

        warningIntervalId = setInterval(() => {
          setIdleCountdown(prev => {
            if (prev <= 1) {
              clearInterval(warningIntervalId);
              if (checkAbsoluteTimeout()) return 0;
              forceLogout('Sessão encerrada por inatividade (60 minutos). Faça login novamente.');
              return 0;
            }
            return prev - 1;
          });
        }, 1000);
      }, IDLE_TIMEOUT_MS - IDLE_WARNING_MS);
    };

    const handleUserActivity = () => {
      const now = Date.now();
      if (now - lastActivity < 1000) return;
      lastActivity = now;
      localStorage.setItem(LAST_ACTIVITY_KEY, String(now));

      if (showIdleWarning) {
        setShowIdleWarning(false);
        clearInterval(warningIntervalId);
      }
      startIdleTimer();
    };

    // REMOVED: proactive refreshTimerId (SESSION_REFRESH_MS) - autoRefreshToken handles this

    const events = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart'];
    events.forEach(event => document.addEventListener(event, handleUserActivity, { passive: true }));
    // Note: visibilitychange is handled in the first useEffect (consolidated)

    startIdleTimer();

    return () => {
      clearTimeout(idleTimerId);
      clearInterval(warningIntervalId);
      events.forEach(event => document.removeEventListener(event, handleUserActivity));
    };
  }, [currentUser, isMockMode, showIdleWarning, checkAbsoluteTimeout]);

  const extendSession = useCallback(() => {
    extendSessionRef.current();
  }, []);

  return { extendSession };
}
