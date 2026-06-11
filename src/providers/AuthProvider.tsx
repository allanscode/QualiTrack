import React, { useEffect, useState, useRef, useCallback } from 'react';
import { supabase, mockDb, upsertUserPreferences, isMockMode, assertSupabase } from '../lib/supabase';
import { User, UserRole, ROLE_LABELS, UserPreferences } from '../types';
import { useTheme, resolveSystemTheme, applyThemeToDOM } from './ThemeProvider';
import { useSessionManager, lastDbThemeRef, ABSOLUTE_TIMEOUT_MS, IDLE_TIMEOUT_MS, MOCK_SESSION_KEY, LAST_ACTIVITY_KEY } from '../hooks/useSessionManager';
import { isDarkColor } from '../hooks/useSidebarManager';
import { toast } from 'sonner';

export type AuthView = 'login' | 'request-access' | 'pending' | 'change-password' | 'forgot-password' | 'setup-password';

interface AuthContextType {
  currentUser: any;
  userData: User | null;
  loading: boolean;
  appReady: boolean;
  authView: AuthView;
  setAuthView: React.Dispatch<React.SetStateAction<AuthView>>;
  credentials: { email: string; password: string };
  setCredentials: React.Dispatch<React.SetStateAction<{ email: string; password: string }>>;
  requestData: { name: string; email: string };
  setRequestData: React.Dispatch<React.SetStateAction<{ name: string; email: string }>>;
  newPassword: string;
  setNewPassword: React.Dispatch<React.SetStateAction<string>>;
  confirmPassword: string;
  setConfirmPassword: React.Dispatch<React.SetStateAction<string>>;
  resetEmail: string;
  setResetEmail: React.Dispatch<React.SetStateAction<string>>;
  isExistingRequest: boolean;
  setIsExistingRequest: React.Dispatch<React.SetStateAction<boolean>>;
  prefetchedSidebarColor: string;
  setPrefetchedSidebarColor: React.Dispatch<React.SetStateAction<string>>;
  activeTab: 'dashboard' | 'monitorias' | 'admin' | 'custom_dashboard';
  setActiveTab: React.Dispatch<React.SetStateAction<'dashboard' | 'monitorias' | 'admin' | 'custom_dashboard'>>;
  handleLogin: (e: React.FormEvent) => Promise<void>;
  handleLogout: (options?: { silent?: boolean; message?: string }) => Promise<void>;
  handleForgotPassword: (e: React.FormEvent) => Promise<void>;
  handleUpdatePassword: (e: React.FormEvent) => Promise<void>;
  handleRequestAccess: (e: React.FormEvent) => Promise<void>;
  extendSession: () => void;
  showIdleWarning: boolean;
  idleCountdown: number;
  isSystemOnline: boolean;
  isReconnecting: boolean;
  setIsSystemOnline: React.Dispatch<React.SetStateAction<boolean>>;
  setIsReconnecting: React.Dispatch<React.SetStateAction<boolean>>;
  isFormOpen: boolean;
  setIsFormOpen: React.Dispatch<React.SetStateAction<boolean>>;
  isSidebarOpen: boolean;
  setIsSidebarOpen: React.Dispatch<React.SetStateAction<boolean>>;
  sidebarColor: string;
  setSidebarColor: React.Dispatch<React.SetStateAction<string>>;
  sidebarContrastClass: string;
  sidebarContrastSubtle: string;
  sidebarIsDark: boolean;
  theme: ReturnType<typeof useTheme>['theme'];
  setTheme: ReturnType<typeof useTheme>['setTheme'];
}

const AuthContext = React.createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = React.useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};

const enrichUserWithTeamIds = async (dbUser: any): Promise<any> => {
  try {
    if (isMockMode) {
      const { data: utData } = await mockDb.get('user_teams');
      const userTeamIds = (utData || []).filter((ut: any) => ut.user_id === dbUser.id).map((ut: any) => ut.team_id);
      return { ...dbUser, team_ids: userTeamIds.length > 0 ? userTeamIds : (dbUser.team_ids || []) };
    }
    const sb = supabase ?? assertSupabase();
    const { data: utData } = await sb.from('user_teams').select('team_id').eq('user_id', dbUser.id);
    const userTeamIds = (utData || []).map((ut: any) => ut.team_id);
    return { ...dbUser, team_ids: userTeamIds.length > 0 ? userTeamIds : (dbUser.team_ids || []) };
  } catch {}
  return dbUser;
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [userData, setUserData] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [appReady, setAppReady] = useState(() => {
    const saved = localStorage.getItem('qualitrack_theme');
    return !!saved && saved !== 'system';
  });
  const [prefetchedSidebarColor, setPrefetchedSidebarColor] = useState('');
  const [activeTab, setActiveTab] = useState<'dashboard' | 'monitorias' | 'admin' | 'custom_dashboard'>(() => {
    const hash = typeof window !== 'undefined' ? window.location.hash.replace('#', '') : '';
    if (hash === 'dashboard' || hash === 'monitorias' || hash === 'admin' || hash === 'custom_dashboard') {
      return hash as any;
    }
    const saved = typeof window !== 'undefined' ? localStorage.getItem('qualitrack_active_tab') : null;
    if (saved === 'dashboard' || saved === 'monitorias' || saved === 'admin' || saved === 'custom_dashboard') {
      return saved as any;
    }
    return 'dashboard';
  });
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [authView, setAuthView] = useState<AuthView>('login');

  const prevUserIdRef = useRef<string | null>(null);

  const [credentials, setCredentials] = useState({ email: '', password: '' });
  const [requestData, setRequestData] = useState({ name: '', email: '' });
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resetEmail, setResetEmail] = useState('');
  const [isExistingRequest, setIsExistingRequest] = useState(false);

  const isPasswordRecoveryRef = useRef(false);
  const isCleaningSessionRef = useRef(false);
  const isInviteFlowRef = useRef(false);

  const [showIdleWarning, setShowIdleWarning] = useState(false);
  const [idleCountdown, setIdleCountdown] = useState(300);
  const sessionStartTimeRef = useRef<number | null>(null);

  const [isSystemOnline, setIsSystemOnline] = useState(true);
  const [isReconnecting, setIsReconnecting] = useState(false);

  const [sidebarColor, setSidebarColor] = useState('');
  const [sidebarContrastClass, setSidebarContrastClass] = useState('');
  const [sidebarContrastSubtle, setSidebarContrastSubtle] = useState('');
  const [sidebarIsDark, setSidebarIsDark] = useState(false);

  // --- Update sidebar contrast derived values when color or theme changes ---
  useEffect(() => {
    const isDark = isDarkColor(sidebarColor, resolvedTheme);
    setSidebarIsDark(isDark);
    setSidebarContrastClass(isDark ? 'text-white' : 'text-slate-900');
    setSidebarContrastSubtle(isDark ? 'text-white/40' : 'text-slate-700/60');
  }, [sidebarColor, resolvedTheme]);

  // --- Sync activeTab with localStorage and URL hash ---
  useEffect(() => {
    localStorage.setItem('qualitrack_active_tab', activeTab);
    const currentHash = window.location.hash.replace('#', '');
    if (currentHash !== activeTab) {
      window.location.hash = activeTab;
    }
  }, [activeTab]);

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace('#', '');
      if (hash === 'dashboard' || hash === 'monitorias' || hash === 'admin' || hash === 'custom_dashboard') {
        setActiveTab(hash as any);
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // --- handleUserSession ---
  const handleUserSessionRef = useRef<((user: any) => Promise<void>) | null>(null);

  const handleUserSession = useCallback(async (user: any) => {
    try {
      let resolvedThemeValue: 'light' | 'dark' = 'light';
      let resolvedSidebarColor = '';

      if (isMockMode) {
        const { data: prefRows } = await mockDb.get('user_preferences');
        const myPref = (prefRows || []).find((r: any) => r.user_id === user.id);
        resolvedThemeValue = myPref?.preferences?.theme === 'dark' ? 'dark' : 'light';
        resolvedSidebarColor = myPref?.preferences?.sidebar_color || '';
      } else {
        const sb = supabase ?? assertSupabase();
        const { data: prefData } = await sb
          .from('user_preferences')
          .select('preferences')
          .eq('user_id', user.id)
          .single();
        resolvedThemeValue = prefData?.preferences?.theme === 'dark' ? 'dark' : 'light';
        resolvedSidebarColor = prefData?.preferences?.sidebar_color || '';
      }

      localStorage.setItem('qualitrack_theme', resolvedThemeValue);
      setTheme(resolvedThemeValue);
      applyThemeToDOM(resolvedThemeValue);
      setPrefetchedSidebarColor(resolvedSidebarColor);
      if (user.email) {
        localStorage.setItem(`qualitrack_sidebar_color_${user.email}`, resolvedSidebarColor);
      }
      setAppReady(true);

      if (isMockMode) {
        const { data } = await mockDb.get('users');
        const dbUser = (data || []).find((u: any) => u.email === user.email && u.active);
        if (dbUser) {
          const enriched = await enrichUserWithTeamIds(dbUser);
          setUserData(enriched);
          setCurrentUser(user);
          const savedTab = window.location.hash.replace('#', '') || localStorage.getItem('qualitrack_active_tab') || 'dashboard';
          if (savedTab === 'dashboard' || savedTab === 'monitorias' || savedTab === 'admin' || savedTab === 'custom_dashboard') {
            setActiveTab(savedTab as any);
          } else {
            setActiveTab('dashboard');
          }
          if (!sessionStartTimeRef.current) sessionStartTimeRef.current = Date.now();
          localStorage.setItem(MOCK_SESSION_KEY, JSON.stringify({
            userId: dbUser.id,
            sessionStartedAt: sessionStartTimeRef.current,
            sessionExpiresAt: sessionStartTimeRef.current + ABSOLUTE_TIMEOUT_MS,
          }));
          localStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now()));
        }
      } else {
        const sb = supabase ?? assertSupabase();
        const { data, error } = await sb.from('users').select('*').eq('email', user.email).single();
        if (data && data.active) {
          const enriched = await enrichUserWithTeamIds(data);
          setUserData(enriched);
          setCurrentUser(user);
          const savedTab = window.location.hash.replace('#', '') || localStorage.getItem('qualitrack_active_tab') || 'dashboard';
          if (savedTab === 'dashboard' || savedTab === 'monitorias' || savedTab === 'admin' || savedTab === 'custom_dashboard') {
            setActiveTab(savedTab as any);
          } else {
            setActiveTab('dashboard');
          }
          if (!sessionStartTimeRef.current) sessionStartTimeRef.current = Date.now();
          localStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now()));
        } else if (error && error.code === 'PGRST116') {
          setAppReady(false);
          await sb.auth.signOut();
          setAuthView('login');
        } else if (error) {
          console.error('[AuthProvider] Erro crítico em handleUserSession:', error);
          toast.error('Erro de conexão ao carregar seu perfil. O sistema está tentando reconectar.');
        } else {
          setAppReady(false);
          setAuthView('request-access');
          setRequestData({ name: user.name || '', email: user.email });
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [setTheme]);

  // Keep ref in sync for use inside effects
  useEffect(() => {
    handleUserSessionRef.current = handleUserSession;
  }, [handleUserSession]);

  // --- Auth Lifecycle ---
  useEffect(() => {
    const initializationTimeout = setTimeout(() => {
      setLoading(false);
    }, 10000);

    if (isMockMode) {
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
                const dbUser = (data || []).find((u: any) => u.id === parsed.userId && u.active);
                if (dbUser) {
                  const enriched = await enrichUserWithTeamIds(dbUser);
                  setCurrentUser(enriched);
                  setUserData(enriched);
                  const savedTab = window.location.hash.replace('#', '') || localStorage.getItem('qualitrack_active_tab') || 'dashboard';
                  if (savedTab === 'dashboard' || savedTab === 'monitorias' || savedTab === 'admin' || savedTab === 'custom_dashboard') {
                    setActiveTab(savedTab as any);
                  }
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

    const sb = supabase ?? assertSupabase();
    const { data: { subscription } } = sb.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        isPasswordRecoveryRef.current = true;
        setAuthView('change-password');
      } else if (event === 'INITIAL_SESSION') {
        if (isInviteFlowRef.current && session) {
          return;
        }
        if (session) {
          if (!sessionStartTimeRef.current) {
            sessionStartTimeRef.current = Date.now();
          }
          setTimeout(() => {
            handleUserSessionRef.current?.(session.user);
          }, 0);
          return;
        }
        setCurrentUser(null);
        setUserData(null);
        setAuthView('login');
      } else if (event === 'SIGNED_IN') {
        if (!isPasswordRecoveryRef.current && session) {
          sessionStartTimeRef.current = Date.now();
          setTimeout(() => {
            handleUserSessionRef.current?.(session.user);
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
        setAppReady(false);
        setCurrentUser(null);
        setUserData(null);
        setAuthView('login');
        localStorage.setItem('qualitrack_theme', 'system');
        setTheme('system');
        applyThemeToDOM(resolveSystemTheme());
        lastDbThemeRef.current = null;
        prevUserIdRef.current = null;
      } else if (event === 'TOKEN_REFRESHED') {
        // Token renovado silenciosamente
      }
      setLoading(false);
      clearTimeout(initializationTimeout);
    });

    return () => {
      clearTimeout(initializationTimeout);
      subscription.unsubscribe();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // --- Session Management (extracted to useSessionManager hook) ---
  const { extendSession } = useSessionManager({
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
  });

  // --- handleLogin ---
  const handleLogin = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const emailLower = credentials.email.toLowerCase();
      if (isMockMode) {
        const { data: users } = await mockDb.get('users');
        const user = (users || []).find((u: any) =>
          u.email.toLowerCase() === emailLower && u.password === credentials.password
        );

        if (user) {
          if (!user.active) {
            setLoading(false);
            toast.error('Esta conta está desativada.'); return;
          }

          const { data: prefRows } = await mockDb.get('user_preferences');
          const myPref = (prefRows || []).find((r: any) => r.user_id === user.id);
          const resolvedThemeValue: 'light' | 'dark' = myPref?.preferences?.theme === 'dark' ? 'dark' : 'light';
          const resolvedSidebarColor: string = myPref?.preferences?.sidebar_color || '';
          localStorage.setItem('qualitrack_theme', resolvedThemeValue);
          setTheme(resolvedThemeValue);
          applyThemeToDOM(resolvedThemeValue);
          setPrefetchedSidebarColor(resolvedSidebarColor);
          localStorage.setItem(`qualitrack_sidebar_color_${user.email}`, resolvedSidebarColor);
          setAppReady(true);

          const enriched = await enrichUserWithTeamIds(user);
          setCurrentUser(enriched);
          setUserData(enriched);
          setActiveTab('dashboard');
          localStorage.setItem('qualitrack_active_tab', 'dashboard');
          window.location.hash = 'dashboard';
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
        const sb = supabase ?? assertSupabase();
        const { error } = await sb.auth.signInWithPassword({
          email: emailLower,
          password: credentials.password
        });
        if (error) throw error;
        toast.success('Login realizado com sucesso!');
      }
    } catch (e: any) {
      toast.error('As credenciais informadas estão incorretas ou são inválidas.');
      setLoading(false);
    }
  }, [credentials, setTheme]);

  // --- handleLogout ---
  const handleLogout = useCallback(async (options?: { silent?: boolean; message?: string }) => {
    setAppReady(false);
    setCurrentUser(null);
    setUserData(null);
    setActiveTab('dashboard');
    localStorage.removeItem('qualitrack_active_tab');
    window.location.hash = 'dashboard';
    setAuthView('login');
    setPrefetchedSidebarColor('');
    setCredentials({ email: '', password: '' });
    setShowIdleWarning(false);
    sessionStartTimeRef.current = null;
    prevUserIdRef.current = null;
    localStorage.removeItem(MOCK_SESSION_KEY);
    localStorage.setItem('qualitrack_theme', 'system');
    setTheme('system');
    applyThemeToDOM(resolveSystemTheme());
    lastDbThemeRef.current = null;
    if (!isMockMode) {
      (supabase ?? assertSupabase()).auth.signOut().catch(console.error);
    }
    if (!options?.silent) {
      toast.success(options?.message || 'Você saiu do sistema com sucesso.');
    }
  }, [setTheme]);

  // --- handleForgotPassword ---
  const handleForgotPassword = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (isMockMode) {
        toast.success('Funcionalidade simulada no modo Mock.');
      } else {
        const sb = supabase ?? assertSupabase();
        const { error } = await sb.auth.resetPasswordForEmail(resetEmail.toLowerCase(), {
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
  }, [resetEmail]);

  // --- handleUpdatePassword ---
  const handleUpdatePassword = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 6) { toast.error('A senha deve ter pelo menos 6 caracteres.'); return; }
    if (newPassword !== confirmPassword) { toast.error('As senhas não coincidem.'); return; }
    setLoading(true);
    try {
      if (isMockMode) {
        if (!userData?.id) throw new Error('Sessão expirada.');
        await mockDb.update('users', userData.id, { password: newPassword, must_change_password: false });
        handleLogout({ silent: true });
        toast.success('Sua senha foi atualizada com sucesso!');
      } else {
        const sb = supabase ?? assertSupabase();
        const { data: { user }, error: userError } = await sb.auth.getUser();
        if (userError || !user) throw userError || new Error('Usuário não autenticado.');

        const { error } = await sb.auth.updateUser({ password: newPassword });
        if (error) throw error;
        await sb.from('users').update({ must_change_password: false }).eq('email', user.email);
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
  }, [newPassword, confirmPassword, userData?.id, handleLogout]);

  // --- handleRequestAccess ---
  const handleRequestAccess = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (isMockMode) {
        await mockDb.insert('access_requests', { name: requestData.name, email: requestData.email.toLowerCase(), status: 'pending' });
        toast.success('Solicitação simulada enviada!');
        setAuthView('pending');
      } else {
        const sb = supabase ?? assertSupabase();
        const { error } = await sb.from('access_requests').insert([
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
  }, [requestData]);

  return (
    <AuthContext.Provider value={{
      currentUser,
      userData,
      loading,
      appReady,
      authView,
      setAuthView,
      credentials,
      setCredentials,
      requestData,
      setRequestData,
      newPassword,
      setNewPassword,
      confirmPassword,
      setConfirmPassword,
      resetEmail,
      setResetEmail,
      isExistingRequest,
      setIsExistingRequest,
      prefetchedSidebarColor,
      setPrefetchedSidebarColor,
      activeTab,
      setActiveTab,
      handleLogin,
      handleLogout,
      handleForgotPassword,
      handleUpdatePassword,
      handleRequestAccess,
      extendSession,
      showIdleWarning,
      idleCountdown,
      isSystemOnline,
      isReconnecting,
      setIsSystemOnline,
      setIsReconnecting,
      isFormOpen,
      setIsFormOpen,
      isSidebarOpen,
      setIsSidebarOpen,
      sidebarColor,
      setSidebarColor,
      sidebarContrastClass,
      sidebarContrastSubtle,
      sidebarIsDark,
      theme,
      setTheme,
    }}>
      {children}
    </AuthContext.Provider>
  );
}
