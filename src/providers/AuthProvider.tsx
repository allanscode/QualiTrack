import React, { useEffect, useState, useRef, useCallback } from 'react';
import { supabase, mockDb, upsertUserPreferences, isMockMode, assertSupabase, initialUrlHash, initialUrlSearch } from '../lib/supabase';
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
  loadingPreferences: boolean;
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
  // Refs to track current state without triggering re-renders/subscriptions
  const currentUserRef = useRef<any>(null);
  const appReadyRef = useRef(false);
  
  const [prefetchedSidebarColor, setPrefetchedSidebarColor] = useState('');

  // Keep refs in sync with state for use in callbacks without re-subscriptions
  useEffect(() => { currentUserRef.current = currentUser; }, [currentUser]);
  useEffect(() => { appReadyRef.current = appReady; }, [appReady]);

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
  const pkceFlowRef = useRef(false);
  const pkceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [showIdleWarning, setShowIdleWarning] = useState(false);
  const [idleCountdown, setIdleCountdown] = useState(300);
  const sessionStartTimeRef = useRef<number | null>(null);

  const [isSystemOnline, setIsSystemOnline] = useState(true);
  const [isReconnecting, setIsReconnecting] = useState(false);

  const [sidebarColor, setSidebarColor] = useState('');
  const [sidebarContrastClass, setSidebarContrastClass] = useState('');
  const [sidebarContrastSubtle, setSidebarContrastSubtle] = useState('');
  const [sidebarIsDark, setSidebarIsDark] = useState(false);
  const [loadingPreferences, setLoadingPreferences] = useState(false);

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
    // Don't override hash if it contains auth params (access_token, code, type) needed by Supabase
    const hasAuthParams = currentHash.includes('access_token=') || currentHash.includes('type=') || currentHash.includes('code=');
    if (currentHash !== activeTab && !hasAuthParams) {
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
    // Guard: if app is already ready and user matches, skip re-loading preferences
    if (appReadyRef.current && currentUserRef.current?.id === user.id) {
      console.log('[Auth] handleUserSession: User already loaded, skipping');
      return;
    }
    setLoadingPreferences(true);
    try {
      let themeValue: 'light' | 'dark' | 'system' = 'system';
      let resolvedSidebarColor = '';

      if (isMockMode) {
        const { data: prefRows } = await mockDb.get('user_preferences');
        const myPref = (prefRows || []).find((r: any) => r.user_id === user.id);
        themeValue = (myPref?.preferences?.theme as 'light' | 'dark' | 'system') || 'system';
        resolvedSidebarColor = myPref?.preferences?.sidebar_color || '';
      } else {
        const sb = supabase ?? assertSupabase();
        const { data: prefData } = await sb
          .from('user_preferences')
          .select('preferences')
          .eq('user_id', user.id)
          .single();
        themeValue = (prefData?.preferences?.theme as 'light' | 'dark' | 'system') || 'system';
        resolvedSidebarColor = prefData?.preferences?.sidebar_color || '';
      }

      // Save literal theme (including 'system') to localStorage
      localStorage.setItem('qualitrack_theme', themeValue);
      // Pass the literal theme to setTheme - ThemeProvider will resolve 'system' for DOM
      setTheme(themeValue);
      // Apply resolved theme to DOM immediately
      const resolved = themeValue === 'system' ? resolveSystemTheme() : themeValue;
      applyThemeToDOM(resolved);
      setPrefetchedSidebarColor(resolvedSidebarColor);
      if (user.email) {
        localStorage.setItem(`qualitrack_sidebar_color_${user.email}`, resolvedSidebarColor);
      }
      setAppReady(true);

      // Minimum loading time to avoid flash (500ms)
      await new Promise(r => setTimeout(r, 500));

      if (isMockMode) {
        const { data } = await mockDb.get('users');
        const dbUser = (data || []).find((u: any) => u.email === user.email && u.active);
        if (dbUser) {
          const enriched = await enrichUserWithTeamIds(dbUser);

          // must_change_password: manda para a tela ja existente de definir
          // nova senha, SEM liberar o dashboard. setCurrentUser fica de fora
          // de proposito — App.tsx usa !currentUser para decidir entre telas
          // de auth e o dashboard, entao ficar sem ele mantem a pessoa presa
          // na troca de senha mesmo com sessao valida.
          if (enriched.must_change_password) {
            // setLoading/setLoadingPreferences ficam a cargo do finally desta
            // função — ele roda mesmo após este return.
            setUserData(enriched);
            setAuthView('change-password');
            toast.info('Defina uma nova senha para continuar.');
            return;
          }

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

          // must_change_password: mesma logica do branch mock acima. A
          // sessao do Supabase permanece ativa (nao chamamos signOut aqui) —
          // handleUpdatePassword usa sb.auth.updateUser(), que exige sessao
          // valida. Sem setCurrentUser, App.tsx mantem a pessoa nas telas de
          // auth em vez do dashboard, mesmo autenticada no Supabase.
          if (enriched.must_change_password) {
            // setLoading/setLoadingPreferences ficam a cargo do finally desta
            // função — ele roda mesmo após este return.
            setUserData(enriched);
            setAuthView('change-password');
            toast.info('Defina uma nova senha para continuar.');
            return;
          }

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
      // Small additional delay so loading screen is visible
      await new Promise(r => setTimeout(r, 100));
      setLoadingPreferences(false);
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

    // Use pre-captured URL params saved before Supabase client processed them
    if (initialUrlHash.includes('error_code=otp_expired') || initialUrlSearch.includes('error_code=otp_expired')) {
      toast.error('O link expirou ou já foi utilizado. Por favor, solicite um novo link de recuperação.');
      setAuthView('forgot-password');
      window.history.replaceState(null, '', window.location.pathname);
      setLoading(false);
      return;
    }

    if (initialUrlHash && (initialUrlHash.includes('type=recovery') || initialUrlHash.includes('type=invite'))) {
      isPasswordRecoveryRef.current = true;
      isInviteFlowRef.current = true;
      setAuthView('change-password');
      setLoading(false);
    }

    if (initialUrlSearch && (initialUrlSearch.includes('type=invite') || initialUrlSearch.includes('type=recovery'))) {
      isPasswordRecoveryRef.current = true;
      isInviteFlowRef.current = true;
      setAuthView('change-password');
      setLoading(false);
    }

    // Detect auth redirect flow (PKCE code exchange or access_token from invite/recovery)
    const isAuthRedirect = (initialUrlSearch && (initialUrlSearch.includes('code=') || initialUrlSearch.includes('access_token='))) ||
      (initialUrlHash && (initialUrlHash.includes('code=') || initialUrlHash.includes('access_token=')));
    if (isAuthRedirect) {
      pkceFlowRef.current = true;
      pkceTimerRef.current = setTimeout(() => {
        if (pkceFlowRef.current) {
          toast.error('A autenticação via link expirou ou é inválida. Por favor, faça login novamente.');
          setAuthView('login');
          setLoading(false);
          pkceFlowRef.current = false;
        }
      }, 20000);
    }

    const sb = supabase ?? assertSupabase();
    const { data: { subscription } } = sb.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        if (pkceFlowRef.current && pkceTimerRef.current) {
          clearTimeout(pkceTimerRef.current);
          pkceTimerRef.current = null;
          pkceFlowRef.current = false;
        }
        isPasswordRecoveryRef.current = true;
        setAuthView('change-password');
      } else if (event === 'INITIAL_SESSION') {
        if (isInviteFlowRef.current && session) {
          // Clear PKCE timer — SIGNED_IN/PASSWORD_RECOVERY may have fired before our subscription
          if (pkceFlowRef.current && pkceTimerRef.current) {
            clearTimeout(pkceTimerRef.current);
            pkceTimerRef.current = null;
            pkceFlowRef.current = false;
          }
          return;
        }
        // Guard: if user is already loaded and app is ready, skip re-loading
        if (session && currentUserRef.current?.id === session.user.id && appReadyRef.current) {
          console.log('[Auth] INITIAL_SESSION: User already loaded, skipping handleUserSession');
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
        if (!isPasswordRecoveryRef.current) {
          setCurrentUser(null);
          setUserData(null);
          setAuthView('login');
        }
      } else if (event === 'SIGNED_IN') {
        if (pkceFlowRef.current && pkceTimerRef.current) {
          clearTimeout(pkceTimerRef.current);
          pkceTimerRef.current = null;
          pkceFlowRef.current = false;
        }
        if (!isPasswordRecoveryRef.current && session) {
          // Guard: if user is already loaded and app is ready, skip re-loading
          if (currentUserRef.current?.id === session.user.id && appReadyRef.current) {
            console.log('[Auth] SIGNED_IN: User already loaded, skipping handleUserSession');
            return;
          }
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
        // Don't reset theme/sidebar_color preferences on logout
        // They are per-user preferences and should persist across sessions
        setAppReady(false);
        setCurrentUser(null);
        setUserData(null);
        setAuthView('login');
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
      if (pkceTimerRef.current) {
        clearTimeout(pkceTimerRef.current);
        pkceTimerRef.current = null;
      }
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

    const emailLower = credentials.email.toLowerCase();

    // ATENCAO — esta trava e uma barreira de USABILIDADE, nao um controle de
    // seguranca. Ela roda no navegador, entao um atacante que chame
    // /auth/v1/token diretamente (curl, script) a ignora por completo.
    // A protecao real contra forca bruta e server-side e precisa ser
    // configurada no painel do Supabase:
    //   Authentication > Rate Limits  (limite de tentativas de sign in)
    //   Authentication > Attack Protection > CAPTCHA (hCaptcha/Turnstile)
    // Verificado neste projeto: 10 tentativas seguidas com senha errada via
    // API retornaram 400, sem nenhum 429 — sem essa configuracao, nao ha
    // limite efetivo.
    const lockKey = `qualitrack_login_attempts_${emailLower}`;
    const MAX_TENTATIVAS = 5;
    const BLOQUEIO_MS = 5 * 60 * 1000;
    let tentativas = 0;
    try {
      const raw = localStorage.getItem(lockKey);
      if (raw) {
        const parsed = JSON.parse(raw) as { count: number; until?: number };
        if (parsed.until && Date.now() < parsed.until) {
          const restam = Math.ceil((parsed.until - Date.now()) / 60000);
          toast.error(`Muitas tentativas. Tente novamente em ${restam} min ou use "Esqueci a senha".`);
          return;
        }
        tentativas = parsed.until && Date.now() >= parsed.until ? 0 : (parsed.count || 0);
      }
    } catch { /* localStorage indisponivel: segue sem a trava */ }

    setLoading(true);
    try {
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
          const themeValue: 'light' | 'dark' | 'system' = (myPref?.preferences?.theme as 'light' | 'dark' | 'system') || 'system';
          const resolvedSidebarColor: string = myPref?.preferences?.sidebar_color || '';
          localStorage.setItem('qualitrack_theme', themeValue);
          setTheme(themeValue);
          const resolved = themeValue === 'system' ? resolveSystemTheme() : themeValue;
          applyThemeToDOM(resolved);
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
          try { localStorage.removeItem(lockKey); } catch { /* ignora */ }
          toast.success(`Bem-vindo, ${user.name}!`);
        } else {
          // Mesma contagem do fluxo Supabase, para o comportamento nao divergir
          // entre os modos.
          const n = tentativas + 1;
          try {
            localStorage.setItem(lockKey, n >= MAX_TENTATIVAS
              ? JSON.stringify({ count: 0, until: Date.now() + BLOQUEIO_MS })
              : JSON.stringify({ count: n }));
          } catch { /* ignora */ }
          toast.error(n >= MAX_TENTATIVAS
            ? 'Muitas tentativas. Aguarde 5 minutos ou use "Esqueci a senha".'
            : 'E-mail ou senha incorretos. Tente novamente.');
        }
        setLoading(false);
      } else {
        const sb = supabase ?? assertSupabase();
        const { error } = await sb.auth.signInWithPassword({
          email: emailLower,
          password: credentials.password
        });
        if (error) throw error;
        try { localStorage.removeItem(lockKey); } catch { /* ignora */ }
        toast.success('Login realizado com sucesso!');
      }
    } catch (e: any) {
      const novasTentativas = tentativas + 1;
      try {
        if (novasTentativas >= MAX_TENTATIVAS) {
          localStorage.setItem(lockKey, JSON.stringify({ count: 0, until: Date.now() + BLOQUEIO_MS }));
        } else {
          localStorage.setItem(lockKey, JSON.stringify({ count: novasTentativas }));
        }
      } catch { /* ignora */ }

      const restantes = MAX_TENTATIVAS - novasTentativas;
      if (novasTentativas >= MAX_TENTATIVAS) {
        toast.error('Muitas tentativas. Aguarde 5 minutos ou use "Esqueci a senha".');
      } else {
        toast.error(
          restantes <= 2
            ? `Credenciais incorretas. ${restantes} tentativa(s) antes do bloqueio temporário.`
            : 'As credenciais informadas estão incorretas ou são inválidas.'
        );
      }
      setLoading(false);
    }
  }, [credentials, setTheme]);

  // --- handleLogout ---
  const handleLogout = useCallback(async (options?: { silent?: boolean; message?: string }) => {
    // Don't reset theme/sidebar_color preferences on logout
    // They are per-user preferences and should persist across sessions
    // Only save current preferences to DB before logout if needed
    if (userData?.id) {
      // Preferences are already saved immediately on change via useSidebarManager
      // No need to save again here
    }
    
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
    // Don't reset qualitrack_theme - keep user's preference
    lastDbThemeRef.current = null;
    if (!isMockMode) {
      (supabase ?? assertSupabase()).auth.signOut().catch(console.error);
    }
    if (!options?.silent) {
      toast.success(options?.message || 'Você saiu do sistema com sucesso.');
    }
  }, [userData?.id]);

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
      // A mensagem anterior culpava sempre o e-mail digitado, mesmo quando a
      // causa era outra. O caso mais comum e o limite de envio do Supabase
      // Auth (429 over_email_send_rate_limit): no SMTP compartilhado do plano
      // free sao poucos e-mails por hora, somando convites e recuperacoes.
      // Mandar o usuario "conferir o e-mail" nesse cenario leva a tentativas
      // repetidas, que so consomem mais cota.
      const code = e?.code || e?.error_code;
      const status = e?.status;
      if (code === 'over_email_send_rate_limit' || status === 429) {
        toast.error('Limite de envio de e-mails atingido. Aguarde alguns minutos e tente de novo.');
      } else {
        toast.error(e?.message
          ? `Não foi possível enviar o e-mail de recuperação: ${e.message}`
          : 'Não foi possível enviar o e-mail de recuperação. Verifique o e-mail digitado.');
      }
      console.error('[Auth] Falha ao enviar recuperação de senha:', e);
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

        // A partir daqui a senha JÁ mudou no Auth — sucesso ou falha do que
        // vem a seguir não desfaz isso. Limpeza da URL (token de
        // recovery/invite) e dos refs de fluxo não dependem da RPC abaixo,
        // então rodam incondicionalmente, evitando deixar token na barra de
        // endereço mesmo se a RPC falhar.
        window.history.replaceState({}, document.title, window.location.pathname);
        isPasswordRecoveryRef.current = false;
        isInviteFlowRef.current = false;

        // Escrita direta em users.must_change_password sempre falhou aqui:
        // users_admin_write nunca autorizou usuário comum a mexer na própria
        // linha, e o erro (0 linhas afetadas por RLS) era descartado — a
        // senha do Auth mudava, mas a flag continuava true, prendendo a
        // pessoa num loop de "trocar senha" a cada login. A função
        // clear_own_must_change_password (SECURITY DEFINER) zera só essa
        // flag, só na própria linha, sem alargar a policy de escrita da
        // tabela — o que reabriria o auto-escalonamento de role que foi
        // fechado antes.
        //
        // Erro tratado aqui dentro, SEM `throw`: se a RPC falhar depois que
        // updateUser já teve sucesso, o catch genérico do fim da função
        // mostraria "Não foi possível atualizar sua senha" — mascarando que
        // a senha JÁ mudou. A pessoa tentaria de novo com a senha antiga,
        // levaria "credenciais inválidas", e se descobrisse a senha nova
        // cairia de novo no loop de troca obrigatória (flag nunca foi
        // zerada). Mensagem específica evita isso.
        const { error: clearError } = await sb.rpc('clear_own_must_change_password');
        if (clearError) {
          console.error('[handleUpdatePassword] Senha trocada no Auth, mas clear_own_must_change_password falhou:', clearError);
          handleLogout({ silent: true });
          toast.error('Sua senha foi alterada com sucesso, mas não foi possível concluir a liberação do acesso. Entre em contato com o suporte antes de tentar entrar novamente — use a senha nova que você acabou de definir.');
          return;
        }

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
      loadingPreferences,
    }}>
      {children}
    </AuthContext.Provider>
  );
}
