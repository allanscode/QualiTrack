import React, { createContext, ReactNode, useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { User } from '../types';
import { isMockMode, requireAccessToken, supabase } from '../lib/supabase';
import { heartbeatPresence, PRESENCE_HEARTBEAT_MS } from '../lib/presence';

export interface PresenceContextType {
  onlineUsers: User[];
  terminateSession: (userId: string) => Promise<void>;
}

const PresenceContext = createContext<PresenceContextType | undefined>(undefined);

async function functionErrorMessage(error: unknown): Promise<string> {
  const context = (error as { context?: unknown } | null)?.context;
  if (context instanceof Response) {
    try {
      const payload = await context.clone().json() as { error?: unknown; message?: unknown };
      if (typeof payload.error === 'string' && payload.error) return payload.error;
      if (typeof payload.message === 'string' && payload.message) return payload.message;
    } catch {
      const body = await context.clone().text().catch(() => '');
      if (body) return body;
    }
    return `Edge Function retornou HTTP ${context.status}.`;
  }
  return error instanceof Error && error.message
    ? error.message
    : 'Não foi possível encerrar a sessão.';
}

export function PresenceProvider({ user, children }: { user: User | null; children: ReactNode }) {
  const [onlineUsers, setOnlineUsers] = useState<User[]>([]);

  const terminateSession = useCallback(async (userId: string) => {
    if (!supabase || !userId) throw new Error('Encerramento de sessão indisponível offline.');
    const accessToken = await requireAccessToken();
    const { data, error } = await supabase.functions.invoke('admin-end-user-session', {
      headers: { Authorization: `Bearer ${accessToken}` },
      body: { user_id: userId },
    });
    if (error || data?.success === false) {
      throw new Error(data?.error || await functionErrorMessage(error));
    }
    setOnlineUsers(current => current.filter(onlineUser => onlineUser.id !== userId));
  }, []);

  useEffect(() => {
    if (!user) {
      setOnlineUsers([]);
      return;
    }

    let cancelled = false;
    let running = false;
    let logoutChannel: ReturnType<NonNullable<typeof supabase>['channel']> | null = null;

    const pulse = async () => {
      if (running || cancelled) return;
      running = true;
      try {
        const activeUsers = await heartbeatPresence(user);
        if (!cancelled) setOnlineUsers(activeUsers);
      } catch (error) {
        console.error('[Presence] Falha no heartbeat compartilhado:', error);
      } finally {
        running = false;
      }
    };

    void pulse();
    const timer = window.setInterval(() => void pulse(), PRESENCE_HEARTBEAT_MS);
    const handleResume = () => {
      if (document.visibilityState === 'visible') void pulse();
    };
    document.addEventListener('visibilitychange', handleResume);
    window.addEventListener('focus', handleResume);
    window.addEventListener('online', handleResume);

    if (!isMockMode && supabase) {
      const realtimeClient = supabase;
      logoutChannel = realtimeClient
        .channel(`session-control-${user.id}`)
        .on('postgres_changes', {
          event: 'INSERT', schema: 'public', table: 'session_control_commands',
          filter: `target_user_id=eq.${user.id}`,
        }, async () => {
          toast.info('Sua sessão foi encerrada por um administrador.');
          await realtimeClient.auth.signOut({ scope: 'global' });
        })
        .subscribe((status, error) => {
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            console.error('[Presence] Canal de controle de sessão indisponível:', error);
          }
        });
    }

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', handleResume);
      window.removeEventListener('focus', handleResume);
      window.removeEventListener('online', handleResume);
      if (supabase && logoutChannel) void supabase.removeChannel(logoutChannel);
    };
  }, [user]);

  return (
    <PresenceContext value={{ onlineUsers, terminateSession }}>
      {children}
    </PresenceContext>
  );
}

export function usePresence() {
  const context = React.use(PresenceContext);
  if (context === undefined) throw new Error('usePresence must be used within a PresenceProvider');
  return context;
}
