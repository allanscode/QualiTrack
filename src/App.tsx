/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { supabase, mockDb } from './lib/supabase';
import { Layout, LayoutDashboard as DashboardIcon, ClipboardCheck, Settings, LogOut, ChevronRight, Search, Plus, User as UserIcon, Clock, Sun, Moon, Users } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format as formatDate } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Toaster, toast } from 'sonner';
import { User } from './types';

// Components
import DashboardMain from './components/dashboard/DashboardMain';
import MonitoriaList from './components/MonitoriaList';
import MonitoriaForm from './components/MonitoriaForm';
import AdminPanel from './components/AdminPanel';

type AuthView = 'login' | 'request-access' | 'pending' | 'change-password' | 'forgot-password' | 'setup-password';

export default function App() {
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [userData, setUserData] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'monitorias' | 'admin'>('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [authView, setAuthView] = useState<AuthView>('login');
  const [isDarkMode, setIsDarkMode] = useState(() => localStorage.getItem('qualitrack_theme') === 'dark');

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('qualitrack_theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('qualitrack_theme', 'light');
    }
  }, [isDarkMode]);

  const [credentials, setCredentials] = useState({ email: '', password: '' });
  const [requestData, setRequestData] = useState({ name: '', email: '' });
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resetEmail, setResetEmail] = useState('');
  const [isExistingRequest, setIsExistingRequest] = useState(false);

  const isPasswordRecoveryRef = React.useRef(false);
  const isMockMode = !supabase;

  // --- Auth Lifecycle ---
  useEffect(() => {
    const initializationTimeout = setTimeout(() => {
      setLoading(false);
    }, 10000);

    if (isMockMode) {
      const savedUser = localStorage.getItem('qualitrack_mock_user');
      if (savedUser) {
        try {
          const user = JSON.parse(savedUser);
          setUserData(user);
          setCurrentUser({ email: user.email });
        } catch (e) {}
      }
      setLoading(false);
      clearTimeout(initializationTimeout);
      return;
    }

    const hash = window.location.hash;
    if (hash && (hash.includes('type=recovery') || hash.includes('type=invite'))) {
      isPasswordRecoveryRef.current = true;
      setAuthView('change-password');
      setLoading(false);
    }

    const { data: { subscription } } = supabase!.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        isPasswordRecoveryRef.current = true;
        setAuthView('change-password');
      } else if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN') {
        if (!isPasswordRecoveryRef.current && session) {
          // Avoid async deadlocks on Windows/Localhost by deferring DB queries
          // allowing the Supabase Auth Lock to release immediately.
          setTimeout(() => {
            handleUserSession(session.user);
          }, 0);
          return; // handleUserSession will handle setLoading(false)
        }
      } else if (event === 'SIGNED_OUT') {
        setCurrentUser(null);
        setUserData(null);
        setAuthView('login');
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
    if (isMockMode || !supabase) return;

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
      if (document.visibilityState === 'visible' && now - lastFocusCheck > 15000) {
        lastFocusCheck = now;
        console.log('[System] Aba focada. Validando conexão...');
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
  }, [isMockMode]);

  // --- Inactivity Timer (60 minutes) ---
  useEffect(() => {
    if (!currentUser || isMockMode) return;

    let timeoutId: NodeJS.Timeout;

    const resetTimer = () => {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(async () => {
        // Antes de deslogar, verifica se a aba ainda está aberta/visível
        if (document.visibilityState === 'visible') {
          // Se o usuário está olhando para a tela, apenas renova a sessão em vez de deslogar
          await supabase?.auth.getSession();
          resetTimer();
        } else {
          supabase?.auth.signOut();
          toast.info('Sessão encerrada por inatividade prolongada.');
        }
      }, 60 * 60 * 1000); // 60 minutos
    };

    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];
    events.forEach(event => document.addEventListener(event, resetTimer));

    resetTimer(); // Inicia o timer

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      events.forEach(event => document.removeEventListener(event, resetTimer));
    };
  }, [currentUser]);

  const handleUserSession = async (user: any) => {
    try {
      if (isMockMode) {
        const { data } = await mockDb.get('users');
        const dbUser = data.find((u: any) => u.email === user.email && u.active);
        if (dbUser) {
          setUserData(dbUser);
          setCurrentUser(user);
          localStorage.setItem('qualitrack_mock_user', JSON.stringify(dbUser));
        }
      } else {
        const { data, error } = await supabase!.from('users').select('*').eq('email', user.email).single();
        if (data && data.active) {
          setUserData(data);
          setCurrentUser(user);
        } else if (error && error.code === 'PGRST116') {
          // Usuário não encontrado no banco
          await supabase!.auth.signOut();
          setAuthView('login');
        } else if (error) {
          // Erro de rede ou RLS (ex: timeout, failed to fetch)
          console.error('[App] Erro crítico em handleUserSession:', error);
          toast.error('Erro de conexão ao carregar seu perfil. O sistema está tentando reconectar.');
          // Mantemos o usuário como null para que fique na tela de login, mas NÃO forçamos logout ainda 
          // pois a rede pode voltar.
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
          if (!user.active) return toast.error('Esta conta está desativada.');
          setCurrentUser(user);
          setUserData(user);
          setActiveTab('dashboard');
          localStorage.setItem('qualitrack_mock_user', JSON.stringify(user));
          toast.success(`Bem-vindo, ${user.name}!`);
        } else {
          toast.error('E-mail ou senha incorretos. Tente novamente.');
        }
      } else {
        const { error } = await supabase!.auth.signInWithPassword({
          email: emailLower,
          password: credentials.password
        });
        if (error) throw error;
        toast.success('Login realizado com sucesso!');
      }
    } catch (e: any) {
      toast.error('As credenciais informadas estão incorretas ou são inválidas.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    setCurrentUser(null);
    setUserData(null);
    setAuthView('login');
    localStorage.removeItem('qualitrack_mock_user');
    if (!isMockMode && supabase) {
      supabase.auth.signOut().catch(console.error);
    }
    toast.success('Você saiu do sistema com sucesso.');
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
        toast.success('Sua senha foi atualizada com sucesso!');
        handleLogout();
      } else {
        const { error } = await supabase!.auth.updateUser({ password: newPassword });
        if (error) throw error;
        await supabase!.from('users').update({ must_change_password: false }).eq('email', userData?.email);
        window.history.replaceState({}, document.title, window.location.pathname);
        isPasswordRecoveryRef.current = false;
        handleLogout();
        toast.success('Sua nova senha foi definida com sucesso!');
      }
    } catch (e: any) {
      toast.error('Não foi possível atualizar sua senha. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const handleRequestAccess = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (isMockMode) {
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

  const renderContent = () => {
    if (loading) {
      return (
        <div className="h-screen w-screen flex items-center justify-center bg-surface-bg">
          <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }} className="w-12 h-12 border-4 border-brand-primary border-t-transparent rounded-full" />
        </div>
      );
    }

    if (!currentUser) {
      return (
        <div className="h-screen w-screen flex flex-col items-center justify-center bg-[#F9F9F6] p-6 text-[#2D3A3A] light">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-md w-full text-center space-y-8">
            <h1 className="text-5xl font-bold tracking-tight text-[#2D3A3A]">QualiTrack</h1>
            <div className="bg-white p-8 rounded-[40px] border border-[#E2E4D8] shadow-premium min-h-[400px] flex flex-col justify-center">
              <AnimatePresence mode="wait">
                {authView === 'login' && (
                  <motion.div key="login" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="space-y-6">
                    <h3 className="text-xl font-bold text-center mb-6">Acesse sua Conta</h3>
                    <form onSubmit={handleLogin} className="space-y-4 text-left">
                      <div>
                        <label className="block text-xs font-semibold text-[#7A7D71] uppercase mb-2">E-mail corporativo</label>
                        <input type="email" required className="w-full bg-[#F9F9F6] border border-[#E2E4D8] rounded-2xl py-3 px-4 text-sm focus:border-[#8E9B7B] focus:outline-none text-[#2D3A3A]" value={credentials.email} onChange={e => setCredentials({...credentials, email: e.target.value})} />
                      </div>
                      <div>
                        <div className="flex justify-between mb-2">
                          <label className="block text-xs font-semibold text-[#7A7D71] uppercase mb-2">Senha</label>
                          <button type="button" onClick={() => setAuthView('forgot-password')} className="text-[10px] font-bold text-[#8E9B7B] hover:text-[#2D3A3A] transition-colors">Esqueci a senha</button>
                        </div>
                        <input type="password" required className="w-full bg-[#F9F9F6] border border-[#E2E4D8] rounded-2xl py-3 px-4 text-sm focus:border-[#8E9B7B] focus:outline-none text-[#2D3A3A]" value={credentials.password} onChange={e => setCredentials({...credentials, password: e.target.value})} />
                      </div>
                      <button className="w-full bg-[#2D3A3A] text-white py-4 rounded-2xl font-bold shadow-lg hover:bg-opacity-90 transition-all">Entrar</button>
                    </form>
                    <button onClick={() => setAuthView('request-access')} className="text-sm font-bold text-[#8E9B7B] hover:text-[#2D3A3A]">Não tem acesso? Solicite aqui</button>
                  </motion.div>
                )}

                {authView === 'request-access' && (
                  <motion.div key="request" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="space-y-6 text-left">
                    <h3 className="text-xl font-bold text-center mb-6">Solicitar Novo Acesso</h3>
                    <form onSubmit={handleRequestAccess} className="space-y-4">
                      <div>
                        <label className="block text-xs font-semibold text-brand-muted uppercase mb-2">Nome completo</label>
                        <input type="text" required className="w-full bg-surface-bg border border-surface-border rounded-2xl py-3 px-4 text-sm focus:border-brand-accent focus:outline-none" value={requestData.name} onChange={e => setRequestData({...requestData, name: e.target.value})} />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-brand-muted uppercase mb-2">E-mail corporativo</label>
                        <input type="email" required className="w-full bg-surface-bg border border-surface-border rounded-2xl py-3 px-4 text-sm focus:border-brand-accent focus:outline-none" value={requestData.email} onChange={e => setRequestData({...requestData, email: e.target.value})} />
                      </div>
                      <button className="w-full bg-brand-primary text-white py-4 rounded-2xl font-bold shadow-lg hover:bg-opacity-90 transition-all">Enviar Solicitação</button>
                      <button type="button" onClick={() => setAuthView('login')} className="w-full text-sm font-bold text-brand-muted">Voltar para Login</button>
                    </form>
                  </motion.div>
                )}

                {authView === 'pending' && (
                  <motion.div key="pending" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="space-y-6 py-4 text-center">
                    <div className="w-16 h-16 bg-surface-subtle rounded-full flex items-center justify-center mx-auto mb-4">
                      <Clock className="w-8 h-8 text-brand-accent" />
                    </div>
                    <h3 className="text-xl font-bold">Solicitação Enviada</h3>
                    <p className="text-sm text-brand-muted">Aguarde a aprovação do administrador. Você receberá um e-mail em breve.</p>
                    <button onClick={() => setAuthView('login')} className="w-full bg-brand-primary text-white py-4 rounded-2xl font-bold shadow-lg transition-all">Voltar para o Início</button>
                  </motion.div>
                )}

                {authView === 'change-password' && (
                  <motion.div key="change" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="space-y-6 text-left">
                    <h3 className="text-xl font-bold text-center mb-6">Defina sua nova senha</h3>
                    <form onSubmit={handleUpdatePassword} className="space-y-4">
                      <div>
                        <label className="block text-xs font-semibold text-brand-muted uppercase mb-2">Nova senha</label>
                        <input type="password" required className="w-full bg-surface-bg border border-surface-border rounded-2xl py-3 px-4 text-sm focus:border-brand-accent focus:outline-none" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Mínimo 6 caracteres" />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-brand-muted uppercase mb-2">Confirmar nova senha</label>
                        <input type="password" required className="w-full bg-surface-bg border border-surface-border rounded-2xl py-3 px-4 text-sm focus:border-brand-accent focus:outline-none" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} />
                      </div>
                      <button className="w-full bg-brand-primary text-white py-4 rounded-2xl font-bold shadow-lg transition-all">Definir Nova Senha</button>
                    </form>
                  </motion.div>
                )}

                {authView === 'forgot-password' && (
                  <motion.div key="forgot" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="space-y-6 text-left">
                    <h3 className="text-xl font-bold text-center mb-6">Recuperar Senha</h3>
                    <form onSubmit={handleForgotPassword} className="space-y-4">
                      <div>
                        <label className="block text-xs font-semibold text-brand-muted uppercase mb-2">E-mail cadastrado</label>
                        <input type="email" required className="w-full bg-surface-bg border border-surface-border rounded-2xl py-3 px-4 text-sm focus:border-brand-accent focus:outline-none" value={resetEmail} onChange={e => setResetEmail(e.target.value)} />
                      </div>
                      <button className="w-full bg-brand-primary text-white py-4 rounded-2xl font-bold shadow-lg transition-all">Enviar Link</button>
                      <button type="button" onClick={() => setAuthView('login')} className="w-full py-4 text-brand-muted font-bold">Voltar</button>
                    </form>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </div>
      );
    }
  };

  return (
    <>
      <Toaster position="top-right" richColors />
      {currentUser ? (
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
          isDarkMode={isDarkMode}
          setIsDarkMode={setIsDarkMode}
          isSystemOnline={isSystemOnline}
          isReconnecting={isReconnecting}
        />
      ) : (
        renderContent()
      )}
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
  isDarkMode, 
  setIsDarkMode,
  isSystemOnline,
  isReconnecting 
}: any) {
  const [teams, setTeams] = React.useState<any[]>([]);
  const [showTeamList, setShowTeamList] = React.useState(false);

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
    backgroundColor: `var(--sidebar-bg-${(userData?.role || 'admin').replace('_', '-')})`,
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
        style={sidebarStyle}
        className="text-white flex flex-col relative z-20 transition-all border-r border-white/5"
      >
        {/* Header / Logo */}
        <div className="h-20 flex items-center px-6 overflow-hidden">
          <div className="flex items-center gap-3 whitespace-nowrap">
            <div className="w-8 h-8 bg-white/10 rounded-lg flex items-center justify-center flex-shrink-0">
              <div className="w-4 h-4 border-2 border-white rounded-[2px]" />
            </div>
            {isSidebarOpen && (
              <h2 className="font-bold text-lg tracking-tight">QualiTrack</h2>
            )}
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 space-y-1 py-4">
          <NavItem icon={<DashboardIcon className="w-5 h-5" />} label="Dashboard" active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} isOpen={isSidebarOpen} />
          <NavItem icon={<ClipboardCheck className="w-5 h-5" />} label="Monitorias" active={activeTab === 'monitorias'} onClick={() => setActiveTab('monitorias')} isOpen={isSidebarOpen} />
          {userData?.role === 'admin' && (
            <NavItem icon={<Settings className="w-5 h-5" />} label="Configurações" active={activeTab === 'admin'} onClick={() => setActiveTab('admin')} isOpen={isSidebarOpen} />
          )}
        </nav>

        {/* Footer Area - CLEAN & MINIMAL */}
        <div className="p-4 space-y-4 border-t border-white/5">
          {/* Controls row */}
          <div className={`flex items-center gap-2 ${isSidebarOpen ? 'justify-start' : 'flex-col'}`}>
            <button 
              onClick={() => setIsDarkMode(!isDarkMode)}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors text-white/60 hover:text-white"
              title="Alternar Tema"
            >
              {isDarkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <button 
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors text-white/60 hover:text-white"
              title="Recolher Menu"
            >
              <Layout className="w-4 h-4" />
            </button>
          </div>

          {/* User Profile - SOLID FLAT */}
          <div className="relative">
            <div className={`flex items-center ${isSidebarOpen ? 'gap-3' : 'flex-col gap-3'} p-2 rounded-xl bg-black/10`}>
              <button 
                onClick={() => setShowTeamList(!showTeamList)}
                className="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center text-white flex-shrink-0 hover:bg-white/20 transition-all relative"
              >
                <UserIcon className="w-5 h-5" />
                <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 border-2 border-[#2D3A3A] rounded-full" />
              </button>
              
              {isSidebarOpen && (
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold truncate text-white leading-tight">{userData?.name}</p>
                  <p className="text-[10px] font-medium text-white/40 uppercase tracking-wider mt-0.5">{userData?.role}</p>
                </div>
              )}
              
              {isSidebarOpen && (
                <button 
                  onClick={handleLogout} 
                  className="p-1.5 hover:bg-white/10 rounded-lg text-white/40 hover:text-white transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Team List Popover */}
            <AnimatePresence>
              {showTeamList && (
                <motion.div 
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  className="absolute bottom-full left-0 mb-2 w-56 bg-surface-card border border-surface-border rounded-2xl shadow-premium p-3 z-50 text-brand-primary"
                >
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
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </motion.aside>

      <main className="flex-1 flex flex-col min-w-0 overflow-hidden bg-surface-bg">
        <header className="px-8 h-20 flex items-center justify-between border-b border-surface-border/50">
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
                    : 'Parâmetros de qualidade, SLA e horários comerciais'}
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
            <DashboardMain user={userData} />
          </div>
          <div className={activeTab === 'monitorias' ? 'block animate-fade-in' : 'hidden'}>
            <MonitoriaList user={userData} onNew={() => setIsFormOpen(true)} />
          </div>
          <div className={activeTab === 'admin' ? 'block animate-fade-in' : 'hidden'}>
            <AdminPanel user={userData} />
          </div>
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
      {isOpen && (
        <span className="text-sm tracking-tight">{label}</span>
      )}
    </button>
  );
}
