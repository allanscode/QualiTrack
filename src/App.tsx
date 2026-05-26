/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { supabase, mockDb } from './lib/supabase';
import { Layout, LayoutDashboard as DashboardIcon, ClipboardCheck, Settings, LogOut, ChevronRight, ChevronLeft, Check, Palette, Search, Plus, User as UserIcon, Clock, Sun, Moon, Users, X, Monitor, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format as formatDate } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Toaster, toast } from 'sonner';
import { User, ROLE_LABELS } from './types';
import { QualityConfigProvider } from './lib/useQualityConfig';

// Components
import DashboardMain from './components/dashboard/DashboardMain';
import MonitoriaList from './components/MonitoriaList';
import MonitoriaForm from './components/MonitoriaForm';
import AdminPanel from './components/AdminPanel';

type AuthView = 'login' | 'request-access' | 'pending' | 'change-password' | 'forgot-password' | 'setup-password';

const IDLE_TIMEOUT_MS = 60 * 60 * 1000;
const IDLE_WARNING_MS = 5 * 60 * 1000;
const ABSOLUTE_TIMEOUT_MS = 8 * 60 * 60 * 1000;
const SESSION_REFRESH_MS = 50 * 60 * 1000;
const MOCK_SESSION_KEY = 'qualitrack_session';
const LAST_ACTIVITY_KEY = 'qualitrack_last_activity';

export default function App() {
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [userData, setUserData] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'monitorias' | 'admin'>('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [authView, setAuthView] = useState<AuthView>('login');
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>(() => {
    // Se estivermos na tela de login (sem usuário logado), sempre seguimos o sistema
    // para evitar que a preferência do usuário anterior "vaze" para o próximo.
    const saved = localStorage.getItem('qualitrack_theme') as any;
    if (saved && (localStorage.getItem(MOCK_SESSION_KEY) || localStorage.getItem('supabase.auth.token'))) {
      return saved;
    }
    return 'system';
  });

  // Atualiza o tema quando o usuário loga ou desloga
  useEffect(() => {
    if (!currentUser) {
      setTheme('system');
    } else {
      const saved = localStorage.getItem('qualitrack_theme') as any;
      if (saved) setTheme(saved);
    }
  }, [currentUser]);

  // Efeito para aplicar o tema no root (html)
  useEffect(() => {
    const root = document.documentElement;
    const applyTheme = () => {
      let isDark = false;
      if (theme === 'system') {
        isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      } else {
        isDark = theme === 'dark';
      }

      if (isDark) {
        root.classList.add('dark');
        root.style.colorScheme = 'dark';
      } else {
        root.classList.remove('dark');
        root.style.colorScheme = 'light';
      }
    };

    applyTheme();
    localStorage.setItem('qualitrack_theme', theme);

    if (theme === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const listener = () => applyTheme();
      mediaQuery.addEventListener('change', listener);
      return () => mediaQuery.removeEventListener('change', listener);
    }
  }, [theme]);

  const [credentials, setCredentials] = useState({ email: '', password: '' });
  const [requestData, setRequestData] = useState({ name: '', email: '' });
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resetEmail, setResetEmail] = useState('');
  const [isExistingRequest, setIsExistingRequest] = useState(false);

  const isPasswordRecoveryRef = React.useRef(false);
  const isCleaningSessionRef = React.useRef(false);
  const isInviteFlowRef = React.useRef(false);
  const isMockMode = !supabase;

  // --- Session State ---
  const [showIdleWarning, setShowIdleWarning] = useState(false);
  const [idleCountdown, setIdleCountdown] = useState(300); // 5 min em segundos
  const sessionStartTimeRef = useRef<number | null>(null);

  // --- Auth Lifecycle ---
  useEffect(() => {
    const initializationTimeout = setTimeout(() => {
      setLoading(false);
    }, 10000);

    if (isMockMode) {
      // Restaura sessão mock do localStorage
      const stored = localStorage.getItem(MOCK_SESSION_KEY);
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          const now = Date.now();
            if (parsed.sessionExpiresAt && parsed.sessionExpiresAt > now) {
              const lastActivityStored = Number(localStorage.getItem(LAST_ACTIVITY_KEY));
              if (lastActivityStored && (now - lastActivityStored) >= IDLE_TIMEOUT_MS) {
                localStorage.removeItem(MOCK_SESSION_KEY);
                localStorage.removeItem(LAST_ACTIVITY_KEY);
              } else if (parsed.sessionStartedAt && (now - parsed.sessionStartedAt) >= ABSOLUTE_TIMEOUT_MS) {
                localStorage.removeItem(MOCK_SESSION_KEY);
                localStorage.removeItem(LAST_ACTIVITY_KEY);
              } else {
                mockDb.get('users').then(async ({ data }) => {
                  const dbUser = data.find((u: any) => u.id === parsed.userId && u.active);
                  if (dbUser) {
                    const enriched = await enrichUserWithTeamIds(dbUser);
                    setCurrentUser(enriched);
                    setUserData(enriched);
                    setActiveTab('dashboard');
                    sessionStartTimeRef.current = parsed.sessionStartedAt || now;
                  } else {
                    localStorage.removeItem(MOCK_SESSION_KEY);
                    localStorage.removeItem(LAST_ACTIVITY_KEY);
                  }
                });
              }
      } else {
        localStorage.removeItem(MOCK_SESSION_KEY);
        localStorage.removeItem(LAST_ACTIVITY_KEY);
      }
    } catch {
      localStorage.removeItem(MOCK_SESSION_KEY);
      localStorage.removeItem(LAST_ACTIVITY_KEY);
    }
      }
      setLoading(false);
      clearTimeout(initializationTimeout);
      return;
    }

    const hash = window.location.hash;
    const search = window.location.search;

    if (hash.includes('error_code=otp_expired') || search.includes('error_code=otp_expired')) {
      toast.error('O link expirou ou já foi utilizado. Por favor, solicite um novo link de recuperação.');
      setAuthView('forgot-password');
      window.history.replaceState(null, '', window.location.pathname);
      setLoading(false);
      return;
    }

    if (hash && (hash.includes('type=recovery') || hash.includes('type=invite'))) {
      isPasswordRecoveryRef.current = true;
      isInviteFlowRef.current = true;
      setAuthView('change-password');
      setLoading(false);
    }

    if (search && (search.includes('type=invite') || search.includes('type=recovery'))) {
      isPasswordRecoveryRef.current = true;
      isInviteFlowRef.current = true;
      setAuthView('change-password');
      setLoading(false);
    }

    const { data: { subscription } } = supabase!.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        isPasswordRecoveryRef.current = true;
        setAuthView('change-password');
      } else if (event === 'INITIAL_SESSION') {
        if (isInviteFlowRef.current && session) {
          return;
        }
        if (session) {
          // Sessão persistida — restaura sem pedir login
          // Para sessão restaurada, estimamos o início como agora menos o tempo decorrido
          // Se não houver sessão prévia (login novo), usa Date.now()
          if (!sessionStartTimeRef.current) {
            sessionStartTimeRef.current = Date.now();
          }
          setTimeout(() => {
            handleUserSession(session.user);
          }, 0);
          return;
        }
        // Sem sessão — mostra login
        setCurrentUser(null);
        setUserData(null);
        setAuthView('login');
      } else if (event === 'SIGNED_IN') {
        if (!isPasswordRecoveryRef.current && session) {
          sessionStartTimeRef.current = Date.now();
          setTimeout(() => {
            handleUserSession(session.user);
          }, 0);
          return;
        }
      } else if (event === 'SIGNED_OUT') {
        if (isCleaningSessionRef.current) {
          isCleaningSessionRef.current = false;
          setLoading(false);
          clearTimeout(initializationTimeout);
          return;
        }
        setCurrentUser(null);
        setUserData(null);
        setAuthView('login');
      } else if (event === 'TOKEN_REFRESHED') {
        // Token renovado silenciosamente — sem ação necessária
      }
      setLoading(false);
      clearTimeout(initializationTimeout);
    });

    return () => {
      clearTimeout(initializationTimeout);
      subscription.unsubscribe();
    };
  }, []);

  const [isSystemOnline, setIsSystemOnline] = useState(true);
  const [isReconnecting, setIsReconnecting] = useState(false);

  // --- Session Resilience & Active Reconnection ---
  useEffect(() => {
    if (isMockMode || !supabase || !currentUser) return;

    let lastFocusCheck = 0;
    let reconnectInterval: ReturnType<typeof setInterval> | null = null;
    let wasOffline = false;

    const pingSupabase = async (): Promise<boolean> => {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        // Usamos um limit(1) em vez de head: true porque head tem comportamentos estranhos no Supabase JS
        const { error } = await supabase.from('users').select('id').limit(1).abortSignal(controller.signal);
        clearTimeout(timeout);
        
        if (error && error.message !== 'JWT expired') {
          console.warn('[System] Ping falhou, erro retornado pelo DB:', error);
          // Se for erro de auth, a rede pode estar OK
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
        // Transição offline → online: reconectou!
        console.log('[System] ✅ Reconexão detectada! Notificando componentes...');
        wasOffline = false;
        setIsReconnecting(false);
        // Tenta renovar sessão após reconexão
        try { await supabase.auth.refreshSession(); } catch {}
        // Notifica TODOS os componentes para recarregarem
        window.dispatchEvent(new CustomEvent('qualitrack:reconnected'));
        // Para o polling agressivo
        if (reconnectInterval) {
          clearInterval(reconnectInterval);
          reconnectInterval = null;
        }
      } else if (!online && !wasOffline) {
        // Transição online → offline
        console.warn('[System] ⚠️ Conexão perdida. Iniciando reconexão ativa...');
        wasOffline = true;
        setIsReconnecting(true);
        // Inicia polling agressivo a cada 5 segundos até reconectar
        if (!reconnectInterval) {
          reconnectInterval = setInterval(async () => {
            console.log('[System] 🔄 Tentando reconectar...');
            const ok = await pingSupabase();
            if (ok) handleOnlineStatusChange(true);
          }, 5000);
        }
      }
    };

    // Heartbeat periódico: a cada 2 minutos verifica se a conexão está viva
    const heartbeatInterval = setInterval(async () => {
      const ok = await pingSupabase();
      handleOnlineStatusChange(ok);
    }, 2 * 60 * 1000);

    // Ping inicial
    pingSupabase().then(ok => handleOnlineStatusChange(ok));

    // Tab Focus Recovery: quando o usuário volta para a aba
    const handleVisibilityChange = async () => {
      const now = Date.now();
      if (document.visibilityState === 'visible') {
        console.log('[System] Aba focada. Disparando recarregamento de dados...');
        window.dispatchEvent(new CustomEvent('qualitrack:refresh-monitorias'));
        
        if (now - lastFocusCheck > 15000) {
          lastFocusCheck = now;
          console.log('[System] Verificando conexão...');
          setIsReconnecting(true);
          const ok = await pingSupabase();
          if (ok) {
            // Se a sessão está quase expirando, renova
            try {
              const { data: { session } } = await supabase.auth.getSession();
              if (session) {
                const timeToExpiry = (session.expires_at || 0) - Math.floor(now / 1000);
                if (timeToExpiry < 900) await supabase.auth.refreshSession();
              }
            } catch {}
            setIsSystemOnline(true);
            setIsReconnecting(false);
            // Se estava offline, notifica reconexão
            if (wasOffline) {
              wasOffline = false;
              if (reconnectInterval) { clearInterval(reconnectInterval); reconnectInterval = null; }
              window.dispatchEvent(new CustomEvent('qualitrack:reconnected'));
            }
          } else {
            handleOnlineStatusChange(false);
          }
        }
      }
    };

    // Listeners nativos do navegador para online/offline
    const handleBrowserOnline = () => {
      console.log('[System] Navegador reportou: online');
      pingSupabase().then(ok => handleOnlineStatusChange(ok));
    };
    const handleBrowserOffline = () => {
      console.log('[System] Navegador reportou: offline');
      handleOnlineStatusChange(false);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleVisibilityChange);
    window.addEventListener('online', handleBrowserOnline);
    window.addEventListener('offline', handleBrowserOffline);

    return () => {
      clearInterval(heartbeatInterval);
      if (reconnectInterval) clearInterval(reconnectInterval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleVisibilityChange);
      window.removeEventListener('online', handleBrowserOnline);
      window.removeEventListener('offline', handleBrowserOffline);
    };
  }, [isMockMode, currentUser]);

  // --- Unified Session Management: Idle Timeout + Warning + Absolute Timeout + Proactive Refresh ---
  const extendSessionRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (!currentUser) {
      extendSessionRef.current = () => {};
      return;
    }

    let idleTimerId: NodeJS.Timeout;
    let warningIntervalId: NodeJS.Timeout;
    let refreshTimerId: NodeJS.Timeout;
    let lastActivity = Number(localStorage.getItem(LAST_ACTIVITY_KEY)) || Date.now();

    const forceLogout = async (reason: string) => {
      setShowIdleWarning(false);
      localStorage.removeItem(MOCK_SESSION_KEY);
      localStorage.removeItem(LAST_ACTIVITY_KEY);
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

    // Verifica se a sessão já expirou por inatividade ou tempo absoluto
    const idleElapsed = Date.now() - lastActivity;
    if (idleElapsed >= IDLE_TIMEOUT_MS) {
      forceLogout('Sessão encerrada por inatividade (60 minutos). Faça login novamente.');
      return;
    }
    if (sessionStartTimeRef.current && (Date.now() - sessionStartTimeRef.current) >= ABSOLUTE_TIMEOUT_MS) {
      forceLogout('Sessão encerrada após 8 horas contínuas. Faça login novamente.');
      return;
    }

    const checkAbsoluteTimeout = () => {
      if (!sessionStartTimeRef.current) return false;
      const elapsed = Date.now() - sessionStartTimeRef.current;
      if (elapsed >= ABSOLUTE_TIMEOUT_MS) {
        forceLogout('Sessão encerrada após 8 horas contínuas. Faça login novamente.');
        return true;
      }
      return false;
    };

    const doExtendSession = () => {
      setShowIdleWarning(false);
      clearInterval(warningIntervalId);
      startIdleTimer();
      if (!isMockMode && supabase) {
        supabase.auth.refreshSession().catch(() => {});
      }
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

    if (!isMockMode && supabase) {
      refreshTimerId = setInterval(async () => {
        if (!currentUser) return;
        if (checkAbsoluteTimeout()) return;
        try {
          await supabase.auth.refreshSession();
        } catch {}
      }, SESSION_REFRESH_MS);
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && currentUser) {
        if (checkAbsoluteTimeout()) return;
        if (!isMockMode && supabase) {
          supabase.auth.getSession().then(({ data: { session } }) => {
            if (session) {
              const timeToExpiry = (session.expires_at || 0) - Math.floor(Date.now() / 1000);
              if (timeToExpiry < 900) {
                supabase.auth.refreshSession().catch(() => {});
              }
            }
          });
        }
      }
    };

    const events = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart'];
    events.forEach(event => document.addEventListener(event, handleUserActivity, { passive: true }));
    document.addEventListener('visibilitychange', handleVisibilityChange);

    startIdleTimer();

    return () => {
      clearTimeout(idleTimerId);
      clearInterval(warningIntervalId);
      clearInterval(refreshTimerId);
      events.forEach(event => document.removeEventListener(event, handleUserActivity));
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [currentUser, isMockMode]);

  const extendSession = useCallback(() => {
    extendSessionRef.current();
  }, []);

  const enrichUserWithTeamIds = async (dbUser: any): Promise<any> => {
    try {
      if (isMockMode) {
        const { data: utData } = await mockDb.get('user_teams');
        const userTeamIds = (utData || []).filter((ut: any) => ut.user_id === dbUser.id).map((ut: any) => ut.team_id);
        return { ...dbUser, team_ids: userTeamIds.length > 0 ? userTeamIds : (dbUser.team_ids || []) };
      } else if (supabase) {
        const { data: utData } = await supabase.from('user_teams').select('team_id').eq('user_id', dbUser.id);
        const userTeamIds = (utData || []).map((ut: any) => ut.team_id);
        return { ...dbUser, team_ids: userTeamIds.length > 0 ? userTeamIds : (dbUser.team_ids || []) };
      }
    } catch {}
    return dbUser;
  };

  const handleUserSession = async (user: any) => {
    try {
      if (isMockMode) {
        const { data } = await mockDb.get('users');
        const dbUser = data.find((u: any) => u.email === user.email && u.active);
        if (dbUser) {
          const enriched = await enrichUserWithTeamIds(dbUser);
          setUserData(enriched);
          setCurrentUser(user);
          setActiveTab('dashboard');
          if (!sessionStartTimeRef.current) sessionStartTimeRef.current = Date.now();
          localStorage.setItem(MOCK_SESSION_KEY, JSON.stringify({
            userId: dbUser.id,
            sessionStartedAt: sessionStartTimeRef.current,
            sessionExpiresAt: sessionStartTimeRef.current + ABSOLUTE_TIMEOUT_MS,
          }));
          localStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now()));
        }
      } else {
        const { data, error } = await supabase!.from('users').select('*').eq('email', user.email).single();
        if (data && data.active) {
          const enriched = await enrichUserWithTeamIds(data);
          setUserData(enriched);
          setCurrentUser(user);
          setActiveTab('dashboard');
          if (!sessionStartTimeRef.current) sessionStartTimeRef.current = Date.now();
          localStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now()));
        } else if (error && error.code === 'PGRST116') {
          await supabase!.auth.signOut();
          setAuthView('login');
        } else if (error) {
          console.error('[App] Erro crítico em handleUserSession:', error);
          toast.error('Erro de conexão ao carregar seu perfil. O sistema está tentando reconectar.');
        } else {
          setAuthView('request-access');
          setRequestData({ name: user.name || '', email: user.email });
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const emailLower = credentials.email.toLowerCase();
      if (isMockMode) {
        const { data: users } = await mockDb.get('users');
        const user = users.find((u: any) => 
          u.email.toLowerCase() === emailLower && 
          u.password === credentials.password
        );

        if (user) {
          if (!user.active) {
            setLoading(false);
            return toast.error('Esta conta está desativada.');
          }
          const enriched = await enrichUserWithTeamIds(user);
          setCurrentUser(enriched);
          setUserData(enriched);
        setActiveTab('dashboard');
        setCredentials({ email: '', password: '' });
        sessionStartTimeRef.current = Date.now();
          localStorage.setItem(MOCK_SESSION_KEY, JSON.stringify({
            userId: user.id,
            sessionStartedAt: sessionStartTimeRef.current,
            sessionExpiresAt: sessionStartTimeRef.current + ABSOLUTE_TIMEOUT_MS,
          }));
          localStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now()));
          toast.success(`Bem-vindo, ${user.name}!`);
        } else {
          toast.error('E-mail ou senha incorretos. Tente novamente.');
        }
        setLoading(false);
      } else {
        const { error } = await supabase!.auth.signInWithPassword({
          email: emailLower,
          password: credentials.password
        });
        if (error) throw error;
        toast.success('Login realizado com sucesso!');
        // Não definimos loading como false aqui; o handleUserSession fará isso
        // após carregar com sucesso o perfil do usuário do banco de dados.
      }
    } catch (e: any) {
      toast.error('As credenciais informadas estão incorretas ou são inválidas.');
      setLoading(false);
    }
  };

  const handleLogout = async (options?: { silent?: boolean; message?: string }) => {
    setCurrentUser(null);
    setUserData(null);
    setActiveTab('dashboard');
    setAuthView('login');
    setCredentials({ email: '', password: '' });
    setShowIdleWarning(false);
    sessionStartTimeRef.current = null;
    localStorage.removeItem(MOCK_SESSION_KEY);
    if (!isMockMode && supabase) {
      supabase.auth.signOut().catch(console.error);
    }
    if (!options?.silent) {
      toast.success(options?.message || 'Você saiu do sistema com sucesso.');
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (isMockMode) {
        toast.success('Funcionalidade simulada no modo Mock.');
      } else {
        const { error } = await supabase!.auth.resetPasswordForEmail(resetEmail.toLowerCase(), {
          redirectTo: window.location.origin,
        });
        if (error) throw error;
        toast.success('E-mail de recuperação enviado! Verifique sua caixa de entrada.');
        setAuthView('login');
      }
    } catch (e: any) {
      toast.error('Não foi possível enviar o e-mail de recuperação. Verifique o e-mail digitado.');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 6) return toast.error('A senha deve ter pelo menos 6 caracteres.');
    if (newPassword !== confirmPassword) return toast.error('As senhas não coincidem.');
    setLoading(true);
    try {
      if (isMockMode) {
        if (!userData?.id) throw new Error('Sessão expirada.');
        await mockDb.update('users', userData.id, { password: newPassword, must_change_password: false });
        handleLogout({ silent: true });
        toast.success('Sua senha foi atualizada com sucesso!');
      } else {
        const { data: { user }, error: userError } = await supabase!.auth.getUser();
        if (userError || !user) throw userError || new Error('Usuário não autenticado.');

        const { error } = await supabase!.auth.updateUser({ password: newPassword });
        if (error) throw error;
        await supabase!.from('users').update({ must_change_password: false }).eq('email', user.email);
        window.history.replaceState({}, document.title, window.location.pathname);
        isPasswordRecoveryRef.current = false;
        isInviteFlowRef.current = false;
        handleLogout({ silent: true });
        toast.success('Sua nova senha foi definida com sucesso! Faça login com suas novas credenciais.');
      }
    } catch (e: any) {
      console.error('[handleUpdatePassword] Erro ao atualizar senha:', e);
      toast.error(`Não foi possível atualizar sua senha: ${e.message || e}`);
    } finally {
      setLoading(false);
    }
  };

  const handleRequestAccess = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (isMockMode) {
        await mockDb.insert('access_requests', { name: requestData.name, email: requestData.email.toLowerCase(), status: 'pending' });
        toast.success('Solicitação simulada enviada!');
        setAuthView('pending');
      } else {
        const { error } = await supabase.from('access_requests').insert([
          { name: requestData.name, email: requestData.email.toLowerCase(), status: 'pending' }
        ]);
        if (error) throw error;
        setAuthView('pending');
      }
    } catch (e: any) {
      toast.error('Não foi possível enviar sua solicitação. Tente novamente mais tarde.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
    <Toaster position="top-right" richColors />
    <AnimatePresence>
      {showIdleWarning && currentUser && (
        <motion.div
          key="idle-warning"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm"
          onClick={extendSession}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="bg-surface-card border border-surface-border rounded-3xl p-8 max-w-md w-full mx-4 shadow-premium text-center"
            onClick={e => e.stopPropagation()}
          >
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
              <AlertTriangle className="w-8 h-8 text-amber-500" />
            </div>
            <h3 className="text-xl font-black text-brand-primary mb-2">Sessão expirando</h3>
            <p className="text-sm text-brand-muted mb-1">
              Sua sessão expirará em <span className="font-black text-amber-500 text-lg">{Math.floor(idleCountdown / 60)}:{String(idleCountdown % 60).padStart(2, '0')}</span> devido à inatividade.
            </p>
            <p className="text-xs text-brand-muted mb-6">Clique no botão abaixo para continuar conectado.</p>
            <button
              onClick={extendSession}
              className="w-full bg-brand-accent text-white py-3.5 rounded-2xl font-bold shadow-lg hover:bg-brand-accent/90 active:scale-[0.98] transition-all"
            >
              Continuar conectado
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
    <AnimatePresence mode="wait">
        {loading ? (
          <motion.div
            key="app-loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="h-screen w-screen flex items-center justify-center bg-surface-bg"
          >
            <motion.div 
              animate={{ rotate: 360 }} 
              transition={{ duration: 1, repeat: Infinity, ease: "linear" }} 
              className="w-12 h-12 border-4 border-brand-primary border-t-transparent rounded-full" 
            />
          </motion.div>
        ) : !currentUser ? (
          <motion.div
            key="app-auth"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="h-screen w-screen flex flex-col items-center justify-center bg-surface-bg p-6 text-brand-primary"
          >
            <div className="max-w-md w-full text-center space-y-8">
              <h1 className="text-5xl font-bold tracking-tight text-brand-primary">QualiTrack</h1>
              <div className="bg-surface-card p-8 rounded-[40px] border border-surface-border shadow-premium min-h-[400px] flex flex-col justify-center">
                <AnimatePresence mode="wait">
                  {authView === 'login' && (
                    <motion.div key="login" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="space-y-6">
                      <h3 className="text-xl font-bold text-center mb-6">Acesse sua Conta</h3>
                      <form onSubmit={handleLogin} className="space-y-4 text-left">
                        <div>
                          <label className="block text-xs font-semibold text-brand-muted uppercase mb-2">E-mail corporativo</label>
                          <input type="email" required className="w-full bg-surface-subtle border border-surface-border rounded-2xl py-3 px-4 text-sm focus:border-brand-accent focus:outline-none text-brand-primary" value={credentials.email} onChange={e => setCredentials({...credentials, email: e.target.value})} />
                        </div>
                        <div>
                          <div className="flex justify-between mb-2">
                            <label className="block text-xs font-semibold text-brand-muted uppercase mb-2">Senha</label>
                            <button type="button" onClick={() => setAuthView('forgot-password')} className="text-[10px] font-bold text-brand-accent hover:text-brand-primary transition-colors">Esqueci a senha</button>
                          </div>
                          <input type="password" required className="w-full bg-surface-subtle border border-surface-border rounded-2xl py-3 px-4 text-sm focus:border-brand-accent focus:outline-none text-brand-primary" value={credentials.password} onChange={e => setCredentials({...credentials, password: e.target.value})} />
                        </div>
                        <button className="w-full bg-brand-accent text-white py-4 rounded-2xl font-bold shadow-lg hover:bg-brand-accent/90 active:scale-[0.98] transition-all flex items-center justify-center">
                          <span className="text-white">Entrar</span>
                        </button>
                      </form>
                      <button onClick={() => setAuthView('request-access')} className="text-sm font-bold text-brand-accent hover:text-brand-primary transition-colors">Não tem acesso? Solicite aqui</button>
                    </motion.div>
                  )}

                  {authView === 'request-access' && (
                    <motion.div key="request" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="space-y-6 text-left">
                      <h3 className="text-xl font-bold text-center mb-6 text-brand-primary">Solicitar Novo Acesso</h3>
                      <form onSubmit={handleRequestAccess} className="space-y-4">
                        <div>
                          <label className="block text-xs font-semibold text-brand-muted uppercase mb-2">Nome completo</label>
                          <input type="text" required className="w-full bg-surface-subtle border border-surface-border rounded-2xl py-3 px-4 text-sm focus:border-brand-accent focus:outline-none text-brand-primary" value={requestData.name} onChange={e => setRequestData({...requestData, name: e.target.value})} />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-brand-muted uppercase mb-2">E-mail corporativo</label>
                          <input type="email" required className="w-full bg-surface-subtle border border-surface-border rounded-2xl py-3 px-4 text-sm focus:border-brand-accent focus:outline-none text-brand-primary" value={requestData.email} onChange={e => setRequestData({...requestData, email: e.target.value})} />
                        </div>
                        <button className="w-full bg-brand-accent text-white py-4 rounded-2xl font-bold shadow-lg hover:bg-brand-accent/90 active:scale-[0.98] transition-all flex items-center justify-center">
                          <span className="text-white">Enviar Solicitação</span>
                        </button>
                        <button type="button" onClick={() => setAuthView('login')} className="w-full text-sm font-bold text-brand-muted hover:text-brand-primary transition-colors mt-2 text-center">Voltar para Login</button>
                      </form>
                    </motion.div>
                  )}

                  {authView === 'pending' && (
                    <motion.div key="pending" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="space-y-6 py-4 text-center">
                      <div className="w-16 h-16 bg-surface-subtle rounded-full flex items-center justify-center mx-auto mb-4">
                        <Clock className="w-8 h-8 text-brand-accent" />
                      </div>
                      <h3 className="text-xl font-bold text-brand-primary">Solicitação Enviada</h3>
                      <p className="text-sm text-brand-muted">Aguarde a aprovação do administrador. Você receberá um e-mail em breve.</p>
                      <button onClick={() => setAuthView('login')} className="w-full bg-brand-accent text-white py-4 rounded-2xl font-bold shadow-lg transition-all flex items-center justify-center">
                        <span className="text-white">Voltar para o Início</span>
                      </button>
                    </motion.div>
                  )}

                  {authView === 'change-password' && (
                    <motion.div key="change" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="space-y-6 text-left">
                      <h3 className="text-xl font-bold text-center mb-6 text-brand-primary">Defina sua nova senha</h3>
                      <form onSubmit={handleUpdatePassword} className="space-y-4">
                        <div>
                          <label className="block text-xs font-semibold text-brand-muted uppercase mb-2">Nova senha</label>
                          <input type="password" required className="w-full bg-surface-subtle border border-surface-border rounded-2xl py-3 px-4 text-sm focus:border-brand-accent focus:outline-none text-brand-primary" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Mínimo 6 caracteres" />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-brand-muted uppercase mb-2">Confirmar nova senha</label>
                          <input type="password" required className="w-full bg-surface-subtle border border-surface-border rounded-2xl py-3 px-4 text-sm focus:border-brand-accent focus:outline-none text-brand-primary" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} />
                        </div>
                        <button className="w-full bg-brand-accent text-white py-4 rounded-2xl font-bold shadow-lg hover:bg-brand-accent/90 active:scale-[0.98] transition-all flex items-center justify-center">
                          <span className="text-white">Definir Nova Senha</span>
                        </button>
                      </form>
                    </motion.div>
                  )}

                  {authView === 'forgot-password' && (
                    <motion.div key="forgot" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="space-y-6 text-left">
                      <h3 className="text-xl font-bold text-center mb-6 text-brand-primary">Recuperar Senha</h3>
                      <form onSubmit={handleForgotPassword} className="space-y-4">
                        <div>
                          <label className="block text-xs font-semibold text-brand-muted uppercase mb-2">E-mail cadastrado</label>
                          <input type="email" required className="w-full bg-surface-subtle border border-surface-border rounded-2xl py-3 px-4 text-sm focus:border-brand-accent focus:outline-none text-brand-primary" value={resetEmail} onChange={e => setResetEmail(e.target.value)} />
                        </div>
                        <button className="w-full bg-brand-accent text-white py-4 rounded-2xl font-bold shadow-lg hover:bg-brand-accent/90 active:scale-[0.98] transition-all flex items-center justify-center">
                          <span className="text-white">Enviar Link</span>
                        </button>
                        <button type="button" onClick={() => setAuthView('login')} className="w-full py-4 text-brand-muted font-bold hover:text-brand-primary transition-colors text-center">Voltar</button>
                      </form>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="app-main"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="h-screen w-full"
          >
        <QualityConfigProvider>
        <MainApp
          isSidebarOpen={isSidebarOpen}
          setIsSidebarOpen={setIsSidebarOpen}
          currentUser={currentUser}
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            userData={userData}
            handleLogout={handleLogout}
            isFormOpen={isFormOpen}
            setIsFormOpen={setIsFormOpen}
            theme={theme}
            setTheme={setTheme}
            isSystemOnline={isSystemOnline}
            isReconnecting={isReconnecting}
          />
        </QualityConfigProvider>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function MainApp({
  isSidebarOpen,
  setIsSidebarOpen,
  currentUser,
  activeTab,
  setActiveTab,
  userData,
  handleLogout,
  isFormOpen,
  setIsFormOpen,
  theme,
  setTheme,
  isSystemOnline,
  isReconnecting
}: any) {
  const [teams, setTeams] = React.useState<any[]>([]);
  const [showTeamList, setShowTeamList] = React.useState(false);
  const [sidebarTextVisible, setSidebarTextVisible] = React.useState(isSidebarOpen);

  const toggleSidebar = () => {
    const willBeOpen = !isSidebarOpen;
    if (!willBeOpen) {
      setSidebarTextVisible(false);
    }
    setIsSidebarOpen(willBeOpen);
  };

  // Reset activeTab to dashboard if user doesn't have admin role
  React.useEffect(() => {
    if (userData && userData.role !== 'admin' && activeTab === 'admin') {
      setActiveTab('dashboard');
    }
  }, [userData?.role]);
  const [sidebarColor, setSidebarColor] = useState<string>(() => {
    if (typeof window !== 'undefined') {
    const email = userData?.email || currentUser?.email || '';
      if (email) {
        return localStorage.getItem(`qualitrack_sidebar_color_${email}`) || '';
      }
    }
    return '';
  });

  useEffect(() => {
    const email = userData?.email || currentUser?.email;
    if (email) {
      const cached = localStorage.getItem(`qualitrack_sidebar_color_${email}`);
      if (cached !== null) {
        setSidebarColor(cached);
      } else {
        const metadataColor = currentUser?.user_metadata?.sidebar_color || userData?.sidebar_color;
        if (metadataColor) {
          setSidebarColor(metadataColor);
          localStorage.setItem(`qualitrack_sidebar_color_${email}`, metadataColor);
        } else {
          setSidebarColor('');
        }
      }
    }
  }, [userData?.email, currentUser?.user_metadata?.sidebar_color, userData?.sidebar_color, currentUser?.email]);

  // Fechar o menu de equipes/configurações ao clicar fora
  useEffect(() => {
    if (!showTeamList) return;
    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.interactive-sidebar-popover') && !target.closest('.profile-toggle-btn')) {
        setShowTeamList(false);
      }
    };
    document.addEventListener('click', handleOutsideClick, true);
    return () => document.removeEventListener('click', handleOutsideClick, true);
  }, [showTeamList]);

  // Fechar o menu ao abrir ou recolher o sidebar para evitar que fique flutuando desalinhado
  useEffect(() => {
    setShowTeamList(false);
  }, [isSidebarOpen]);

  const handleSidebarColorChange = async (color: string) => {
    setSidebarColor(color);
    const email = userData?.email || currentUser?.email;
    if (email) {
      localStorage.setItem(`qualitrack_sidebar_color_${email}`, color);
      if (!supabase) {
        if (userData?.id) {
          await mockDb.update('users', userData.id, { sidebar_color: color });
        }
      } else {
        await supabase.auth.updateUser({
          data: { sidebar_color: color }
        });
      }
    }
  };

  useEffect(() => {
    const loadTeams = async () => {
      if (!supabase) {
        const { data } = await mockDb.get('teams');
        setTeams(data || []);
      } else {
        const { data } = await supabase.from('teams').select('*');
        setTeams(data || []);
      }
    };
    loadTeams();
  }, []);

  const userTeams = teams.filter(t => (userData?.team_ids || []).includes(t.id));
  const teamNames = userTeams.map(t => t.name).join(', ');

  const sidebarStyle = {
    backgroundColor: sidebarColor || `var(--sidebar-bg-${(userData?.role || 'admin').replace('_', '-')})`,
  };

  return (
    <div className="h-screen w-full flex bg-surface-bg text-brand-primary font-sans overflow-hidden">
      <AnimatePresence>
        {isFormOpen && (
          <MonitoriaForm
            user={userData}
            onCancel={() => setIsFormOpen(false)}
            onSaved={() => { setIsFormOpen(false); setActiveTab('monitorias'); }}
          />
        )}
      </AnimatePresence>

  <motion.aside
    initial={false}
    animate={{ width: isSidebarOpen ? 260 : 80 }}
    transition={{ duration: 0.3, ease: "easeInOut" }}
    onAnimationComplete={() => setSidebarTextVisible(isSidebarOpen)}
    style={sidebarStyle}
    onClick={(e) => {
      const target = e.target as HTMLElement;
      if (target.closest('button') || target.closest('a') || target.closest('input') || target.closest('select') || target.closest('.interactive-sidebar-item')) {
        return;
      }
      toggleSidebar();
    }}
        className="text-white flex flex-col relative z-20 transition-all border-r border-white/5 group/sidebar cursor-pointer"
      >
        {/* Floating toggle button on hover */}
        <div 
      onClick={(e) => {
        e.stopPropagation();
        toggleSidebar();
      }}
          className="absolute -right-3.5 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-surface-card border border-surface-border text-brand-primary flex items-center justify-center shadow-premium hover:scale-110 active:scale-95 transition-all opacity-0 group-hover/sidebar:opacity-100 z-30 cursor-pointer"
        >
          {isSidebarOpen ? (
            <ChevronLeft className="w-4 h-4" />
          ) : (
            <ChevronRight className="w-4 h-4" />
          )}
        </div>
        {/* Header / Logo */}
        <div className="h-20 flex items-center px-6 overflow-hidden">
          <div className="flex items-center gap-3 whitespace-nowrap">
            <div className="w-8 h-8 bg-white/10 rounded-lg flex items-center justify-center flex-shrink-0">
              <div className="w-4 h-4 border-2 border-white rounded-[2px]" />
            </div>
        {sidebarTextVisible && (
          <h2 className="font-bold text-lg tracking-tight">QualiTrack</h2>
        )}
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 space-y-1 py-4">
        <NavItem icon={<DashboardIcon className="w-5 h-5" />} label="Dashboard" active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} isOpen={sidebarTextVisible} />
        <NavItem icon={<ClipboardCheck className="w-5 h-5" />} label="Monitorias" active={activeTab === 'monitorias'} onClick={() => setActiveTab('monitorias')} isOpen={sidebarTextVisible} />
        {userData?.role === 'admin' && (
          <NavItem icon={<Settings className="w-5 h-5" />} label="Configurações" active={activeTab === 'admin'} onClick={() => setActiveTab('admin')} isOpen={sidebarTextVisible} />
        )}
        </nav>

    {/* Footer Area - User Profile */}
    <div className="p-3 border-t border-white/5 interactive-sidebar-item">
      <div className="relative interactive-sidebar-item">
        <div className="flex items-center gap-3 p-2 rounded-xl bg-black/10 overflow-hidden">
          <button
            onClick={() => setShowTeamList(!showTeamList)}
            className="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center text-white flex-shrink-0 hover:bg-white/20 transition-all relative cursor-pointer"
          >
            <UserIcon className="w-5 h-5" />
            <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 border-2 rounded-full" style={{ borderColor: sidebarColor || `var(--sidebar-bg-${(userData?.role || 'admin').replace('_', '-')})` }} />
          </button>

          <div className="flex-1 flex items-center gap-2 min-w-0 overflow-hidden" style={{ opacity: sidebarTextVisible ? 1 : 0, maxWidth: sidebarTextVisible ? undefined : 0, transition: 'opacity 0.15s ease' }}>
            <button
              onClick={() => setShowTeamList(!showTeamList)}
              className="min-w-0 flex-1 py-1 text-left cursor-pointer hover:opacity-80 transition-opacity"
            >
              <p className="text-xs font-bold text-white leading-tight truncate">{userData?.name}</p>
              <p className="text-[10px] font-medium text-white/40 uppercase tracking-wider mt-0.5 leading-tight truncate">
                {userData ? ROLE_LABELS[userData.role] : ''}
              </p>
            </button>

            <button
              onClick={handleLogout}
              className="p-1.5 hover:bg-white/10 rounded-lg text-white/40 hover:text-white transition-colors cursor-pointer flex-shrink-0"
              title="Sair"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Team List & Settings Popover */}
            <AnimatePresence>
              {showTeamList && (
                <motion.div 
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  className={`absolute w-56 bg-surface-card border border-surface-border rounded-2xl shadow-premium p-4 z-50 text-brand-primary interactive-sidebar-popover ${
                    isSidebarOpen ? 'bottom-full left-0 mb-2' : 'bottom-0 left-full ml-2'
                  }`}
                >
                  <button 
                    onClick={() => setShowTeamList(false)}
                    className="absolute top-3.5 right-3.5 text-brand-muted hover:text-brand-primary p-1 rounded-lg hover:bg-surface-subtle transition-colors cursor-pointer"
                    title="Fechar"
                  >
                    <X className="w-4 h-4" />
                  </button>

                  <div className="flex items-center gap-2 mb-2 pb-2 border-b border-surface-border">
                    <Users className="w-4 h-4 text-brand-accent" />
                    <span className="text-xs font-black uppercase tracking-wider">Suas Equipes</span>
                  </div>
                  <div className="space-y-1">
                    {userTeams.length > 0 ? userTeams.map(t => (
                      <div key={t.id} className="text-xs py-1.5 px-2 hover:bg-surface-subtle rounded-lg font-bold">
                        • {t.name}
                      </div>
                    )) : (
                      <div className="text-[10px] text-brand-muted italic p-2">Nenhuma equipe vinculada</div>
                    )}
                  </div>

                  {/* Theme Selector Section */}
                  <div className="flex items-center gap-2 mt-3 pt-3 border-t border-surface-border mb-2">
                    {theme === 'dark' ? <Moon className="w-4 h-4 text-brand-accent" /> : theme === 'light' ? <Sun className="w-4 h-4 text-brand-accent" /> : <Monitor className="w-4 h-4 text-brand-accent" />}
                    <span className="text-xs font-black uppercase tracking-wider">Aparência</span>
                  </div>
                  <div className="grid grid-cols-3 gap-1 bg-surface-subtle p-1 rounded-xl border border-surface-border">
                    {[
                      { value: 'light', label: 'Claro', icon: Sun },
                      { value: 'dark', label: 'Escuro', icon: Moon },
                      { value: 'system', label: 'Sistema', icon: Monitor }
                    ].map(opt => {
                      const Icon = opt.icon;
                      const isActive = theme === opt.value;
                      return (
                        <button
                          key={opt.value}
                          onClick={(e) => {
                            e.stopPropagation();
                            setTheme(opt.value as any);
                          }}
                          className={`flex flex-col items-center gap-1 py-1.5 px-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                            isActive 
                              ? 'bg-surface-card text-brand-primary shadow-sm border border-surface-border' 
                              : 'text-brand-muted hover:text-brand-primary hover:bg-surface-card/30 border border-transparent'
                          }`}
                        >
                          <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-brand-accent' : 'text-brand-muted'}`} />
                          <span>{opt.label}</span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Color Selector Section */}
                  <div className="flex items-center gap-2 mt-3 pt-3 border-t border-surface-border mb-2">
                    <Palette className="w-4 h-4 text-brand-accent" />
                    <span className="text-xs font-black uppercase tracking-wider">Cor do Menu</span>
                  </div>
                  <div className="grid grid-cols-5 gap-1.5 pt-1">
                    {[
                      { value: '', label: 'Padrão', hex: 'bg-gradient-to-br from-brand-muted/20 to-brand-primary/20' },
                      { value: '#475569', label: 'Slate', hex: 'bg-[#475569]' },
                      { value: '#1E293B', label: 'Escuro', hex: 'bg-[#1E293B]' },
                      { value: '#111827', label: 'Carvão', hex: 'bg-[#111827]' },
                      { value: '#0F172A', label: 'Meia-noite', hex: 'bg-[#0F172A]' },
                      { value: '#047857', label: 'Esmeralda', hex: 'bg-[#047857]' },
                      { value: '#14532D', label: 'Floresta', hex: 'bg-[#14532D]' },
                      { value: '#0D9488', label: 'Menta', hex: 'bg-[#0D9488]' },
                      { value: '#1E40AF', label: 'Azul', hex: 'bg-[#1E40AF]' },
                      { value: '#0284C7', label: 'Céu', hex: 'bg-[#0284C7]' },
                      { value: '#881337', label: 'Vinho', hex: 'bg-[#881337]' },
                      { value: '#E11D48', label: 'Rubi', hex: 'bg-[#E11D48]' },
                      { value: '#6D28D9', label: 'Roxo', hex: 'bg-[#6D28D9]' },
                      { value: '#5B21B6', label: 'Lavanda', hex: 'bg-[#5B21B6]' },
                      { value: '#86198F', label: 'Fúcsia', hex: 'bg-[#86198F]' },
                      { value: '#B45309', label: 'Bronze', hex: 'bg-[#B45309]' },
                      { value: '#EA580C', label: 'Pôr do Sol', hex: 'bg-[#EA580C]' },
                      { value: '#3F6212', label: 'Oliva', hex: 'bg-[#3F6212]' },
                      { value: '#451A03', label: 'Café', hex: 'bg-[#451A03]' },
                      { value: '#1D4ED8', label: 'Safira', hex: 'bg-[#1D4ED8]' }
                    ].map(opt => {
                      const isActive = sidebarColor === opt.value;
                      return (
                        <button
                          key={opt.label}
                          onClick={() => handleSidebarColorChange(opt.value)}
                          className={`w-7 h-7 rounded-full ${opt.hex} border-2 hover:scale-110 active:scale-95 transition-all flex items-center justify-center cursor-pointer ${isActive ? 'border-brand-accent shadow-md scale-105' : 'border-surface-border'}`}
                          title={opt.label}
                        >
                          {isActive && <Check className="w-3.5 h-3.5 text-white drop-shadow" />}
                        </button>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </motion.aside>

      <main className="flex-1 flex flex-col min-w-0 overflow-hidden bg-surface-bg">
        <header className="px-8 h-20 flex items-center gap-4 border-b border-surface-border/50">
          <button 
            onClick={() => toggleSidebar()}
            className="sidebar-toggle-btn p-2 hover:bg-surface-subtle border border-surface-border/40 rounded-xl transition-all text-brand-muted hover:text-brand-primary shadow-sm flex-shrink-0 flex items-center justify-center w-10 h-10 cursor-pointer"
            title={isSidebarOpen ? "Recolher Menu" : "Expandir Menu"}
          >
            <Layout className="w-4 h-4 layout-icon" />
            {isSidebarOpen ? (
              <ChevronLeft className="w-4 h-4 arrow-icon" />
            ) : (
              <ChevronRight className="w-4 h-4 arrow-icon" />
            )}
          </button>

          <div className="min-w-0 flex-1">
            <div className="flex flex-col">
              <h2 className="text-xl font-black text-brand-primary tracking-tight">
                {activeTab === 'dashboard' 
                  ? `Olá, ${userData?.name.split(' ')[0]}! 👋` 
                  : activeTab === 'monitorias' 
                    ? 'Gestão de Monitorias' 
                    : 'Configurações do Sistema'}
              </h2>
              <p className="text-[10px] font-black text-brand-muted uppercase tracking-widest mt-0.5">
                {activeTab === 'dashboard' 
                  ? (userData?.role === 'suporte' 
                      ? 'Acompanhe seu desempenho e evolução individual' 
                      : userData?.role === 'qualidade' 
                        ? 'Gestão de produtividade e análise de qualidade'
                        : 'Visão executiva da performance e KPIs globais')
                  : activeTab === 'monitorias' 
                    ? 'Fluxo de auditoria, contestações e reavaliações' 
                    : 'Parâmetros de qualidade, prazos de ação e horários comerciais'}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-6">
            <div className="hidden xl:flex flex-col items-end">
              <p className="text-[10px] font-black text-brand-muted uppercase tracking-widest">{formatDate(new Date(), "EEEE, dd 'de' MMMM", { locale: ptBR })}</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <div className={`w-1.5 h-1.5 rounded-full ${isSystemOnline ? 'bg-success animate-pulse' : 'bg-error'} ${isReconnecting ? 'animate-bounce' : ''}`} />
                <span className={`text-[9px] font-bold uppercase tracking-tight ${isSystemOnline ? 'text-brand-primary' : 'text-error'}`}>
                  {isReconnecting ? 'Reconectando...' : isSystemOnline ? 'Sistema Online' : 'Sistema Offline'}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-4">
              {userData?.role === 'qualidade' && (
                <button 
                  onClick={() => setIsFormOpen(true)} 
                  className="bg-brand-primary text-brand-on-primary h-10 px-5 rounded-xl text-xs font-black shadow-premium hover:opacity-90 transition-all flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" /> Nova Monitoria
                </button>
              )}
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-auto px-8 pb-8 pt-6 min-w-0">
          <div className={activeTab === 'dashboard' ? 'block animate-fade-in' : 'hidden'}>
            <DashboardMain user={userData} activeTab={activeTab} />
          </div>
          <div className={activeTab === 'monitorias' ? 'block animate-fade-in' : 'hidden'}>
            <MonitoriaList user={userData} onNew={() => setIsFormOpen(true)} activeTab={activeTab} />
          </div>
        {userData?.role === 'admin' && (
          <div className={activeTab === 'admin' ? 'block animate-fade-in' : 'hidden'}>
            <AdminPanel user={userData} />
          </div>
        )}
        </div>
      </main>
    </div>
  );
}

function NavItem({ icon, label, active, onClick, isOpen }: any) {
  return (
    <button 
      onClick={onClick}
      className={`
        w-full flex items-center gap-3 px-4 h-11 rounded-xl transition-all font-bold group relative
        ${active 
          ? 'bg-white/10 text-white' 
          : 'text-white/40 hover:text-white hover:bg-white/5'}
      `}
    >
      {active && (
        <motion.div 
          layoutId="active-bar"
          className="absolute left-0 w-1 h-6 bg-white rounded-full"
        />
      )}
      <div className={`flex-shrink-0 ${active ? 'text-white' : 'text-white/30 group-hover:text-white'}`}>
        {icon}
      </div>
      <div className={`flex-1 overflow-hidden transition-all duration-300 ${isOpen ? 'opacity-100 max-w-full' : 'opacity-0 max-w-0'}`}>
        <span className="text-sm tracking-tight whitespace-nowrap block pl-1">
          {label}
        </span>
      </div>
    </button>
  );
}
