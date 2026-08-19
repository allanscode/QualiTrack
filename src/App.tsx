/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './lib/queryClient';
import { Layout, LayoutDashboard as DashboardIcon, ClipboardCheck, Settings, LogOut, ChevronRight, ChevronLeft, ChevronDown, Check, Palette, Search, Plus, User as UserIcon, Clock, Sun, Moon, Users, X, Monitor, AlertTriangle, BarChart3, Eye, EyeOff } from 'lucide-react';
import { m, AnimatePresence } from 'motion/react';
import { format as formatDate } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Toaster, toast } from 'sonner';
import { User, ROLE_LABELS, UserRole } from './types';
import { QualityConfigProvider } from './lib/useQualityConfig';
import { StaticDataProvider, useStaticData } from './lib/StaticDataContext';
import { ThemeProvider, useTheme, resolveSystemTheme, applyThemeToDOM, type Theme } from './providers/ThemeProvider';
import { AuthProvider, useAuth } from './providers/AuthProvider';
import { useSidebarManager } from './hooks/useSidebarManager';

// Components
const DashboardMain = React.lazy(() => import('./components/dashboard/DashboardMain'));
const MonitoriaList = React.lazy(() => import('./components/MonitoriaList'));
const MonitoriaForm = React.lazy(() => import('./components/MonitoriaForm'));
const AdminPanel = React.lazy(() => import('./components/AdminPanel'));
const CustomDashboardManagement = React.lazy(() => import('./components/CustomDashboardManagement'));

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <AppContent />
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

function AppContent() {
  const {
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
    isFormOpen,
    setIsFormOpen,
    isSidebarOpen,
    setIsSidebarOpen,
    sidebarColor,
    setSidebarColor,
    sidebarContrastClass,
    sidebarContrastSubtle,
    sidebarIsDark,
    loadingPreferences,
  } = useAuth();

  // Alternar visibilidade da senha. Cada campo tem seu proprio estado para
  // que revelar um nao exponha os demais (ex.: na tela de nova senha, ver a
  // senha digitada sem revelar a confirmacao).
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  return (
    <>
      <Toaster position="top-right" richColors />
      <AnimatePresence>
        {showIdleWarning && currentUser && (
          <m.div
            key="idle-warning"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm"
            onClick={extendSession}
          >
            <m.div
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
                className="w-full bg-brand-accent text-white py-3.5 rounded-lg font-bold uppercase tracking-wider shadow-lg hover:bg-brand-accent/90 active:scale-[0.98] transition-all"
              >
                Continuar Conectado
              </button>
            </m.div>
          </m.div>
        )}
      </AnimatePresence>
      <AnimatePresence mode="wait">
        {loading ? (
          <m.div
            key="app-loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="h-screen w-screen flex items-center justify-center bg-surface-bg"
          >
            <m.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
              className="w-12 h-12 border-4 border-brand-primary border-t-transparent rounded-full"
            />
          </m.div>
        ) : !currentUser ? (
          <m.div
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
                    <m.div key="login" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="space-y-6">
                      <h3 className="text-xl font-bold text-center mb-6">Acesse sua Conta</h3>
                      <form onSubmit={handleLogin} className="space-y-4 text-left">
                        <div>
                          <label className="block text-xs font-semibold text-brand-muted uppercase mb-2">E-mail corporativo</label>
                          <input type="email" required className="w-full bg-surface-subtle border border-surface-border rounded-lg py-3 px-4 text-sm focus:border-brand-accent focus:outline-none text-brand-primary" value={credentials.email} onChange={e => setCredentials({...credentials, email: e.target.value})} />
                        </div>
                        <div>
                          <div className="flex justify-between mb-2">
                            <label className="block text-xs font-semibold text-brand-muted uppercase mb-2">Senha</label>
                            <button type="button" onClick={() => setAuthView('forgot-password')} className="text-[10px] font-bold text-brand-accent hover:text-brand-primary transition-colors">Esqueci a senha</button>
                          </div>
                          <div className="relative">
                            <input
                              type={showLoginPassword ? 'text' : 'password'}
                              required
                              className="w-full bg-surface-subtle border border-surface-border rounded-lg py-3 pl-4 pr-12 text-sm focus:border-brand-accent focus:outline-none text-brand-primary"
                              value={credentials.password}
                              onChange={e => setCredentials({...credentials, password: e.target.value})}
                            />
                            <button
                              type="button"
                              onClick={() => setShowLoginPassword(v => !v)}
                              aria-label={showLoginPassword ? 'Ocultar senha' : 'Mostrar senha'}
                              aria-pressed={showLoginPassword}
                              title={showLoginPassword ? 'Ocultar senha' : 'Mostrar senha'}
                              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-brand-muted hover:text-brand-primary transition-colors"
                            >
                              {showLoginPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                          </div>
                        </div>
                        <button className="w-full bg-brand-accent text-white py-4 rounded-lg font-bold uppercase tracking-wider shadow-lg hover:bg-brand-accent/90 active:scale-[0.98] transition-all flex items-center justify-center">
                          <span className="text-white">Entrar</span>
                        </button>
                      </form>
                      <button onClick={() => setAuthView('request-access')} className="text-sm font-bold text-brand-accent hover:text-brand-primary transition-colors">Não tem acesso? Solicite aqui</button>
                    </m.div>
                  )}

                  {authView === 'request-access' && (
                    <m.div key="request" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="space-y-6 text-left">
                      <h3 className="text-xl font-bold text-center mb-6 text-brand-primary">Solicitar Novo Acesso</h3>
                      <form onSubmit={handleRequestAccess} className="space-y-4">
                        <div>
                          <label className="block text-xs font-semibold text-brand-muted uppercase mb-2">Nome completo</label>
                          <input type="text" required className="w-full bg-surface-subtle border border-surface-border rounded-lg py-3 px-4 text-sm focus:border-brand-accent focus:outline-none text-brand-primary" value={requestData.name} onChange={e => setRequestData({...requestData, name: e.target.value})} />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-brand-muted uppercase mb-2">E-mail corporativo</label>
                          <input type="email" required className="w-full bg-surface-subtle border border-surface-border rounded-lg py-3 px-4 text-sm focus:border-brand-accent focus:outline-none text-brand-primary" value={requestData.email} onChange={e => setRequestData({...requestData, email: e.target.value})} />
                        </div>
                        <button className="w-full bg-brand-accent text-white py-4 rounded-lg font-bold uppercase tracking-wider shadow-lg hover:bg-brand-accent/90 active:scale-[0.98] transition-all flex items-center justify-center">
                          <span className="text-white">Enviar Solicitação</span>
                        </button>
                        <button type="button" onClick={() => setAuthView('login')} className="w-full text-sm font-bold text-brand-muted hover:text-brand-primary transition-colors mt-2 text-center">Voltar para Login</button>
                      </form>
                    </m.div>
                  )}

                  {authView === 'pending' && (
                    <m.div key="pending" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="space-y-6 py-4 text-center">
                      <div className="w-16 h-16 bg-surface-subtle rounded-full flex items-center justify-center mx-auto mb-4">
                        <Clock className="w-8 h-8 text-brand-accent" />
                      </div>
                      <h3 className="text-xl font-bold text-brand-primary">Solicitação Enviada</h3>
                      <p className="text-sm text-brand-muted">Aguarde a aprovação do administrador. Você receberá um e-mail em breve.</p>
                      <button onClick={() => setAuthView('login')} className="w-full bg-brand-accent text-white py-4 rounded-lg font-bold uppercase tracking-wider shadow-lg transition-all flex items-center justify-center">
                        <span className="text-white">Voltar para o Início</span>
                      </button>
                    </m.div>
                  )}

                  {authView === 'change-password' && (
                    <m.div key="change" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="space-y-6 text-left">
                      <h3 className="text-xl font-bold text-center mb-6 text-brand-primary">Defina sua nova senha</h3>
                      <form onSubmit={handleUpdatePassword} className="space-y-4">
                        <div>
                          <label className="block text-xs font-semibold text-brand-muted uppercase mb-2">Nova senha</label>
                          <div className="relative">
                            <input
                              type={showNewPassword ? 'text' : 'password'}
                              required
                              className="w-full bg-surface-subtle border border-surface-border rounded-lg py-3 pl-4 pr-12 text-sm focus:border-brand-accent focus:outline-none text-brand-primary"
                              value={newPassword}
                              onChange={e => setNewPassword(e.target.value)}
                              placeholder="Mínimo 6 caracteres"
                            />
                            <button
                              type="button"
                              onClick={() => setShowNewPassword(v => !v)}
                              aria-label={showNewPassword ? 'Ocultar senha' : 'Mostrar senha'}
                              aria-pressed={showNewPassword}
                              title={showNewPassword ? 'Ocultar senha' : 'Mostrar senha'}
                              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-brand-muted hover:text-brand-primary transition-colors"
                            >
                              {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-brand-muted uppercase mb-2">Confirmar nova senha</label>
                          <div className="relative">
                            <input
                              type={showConfirmPassword ? 'text' : 'password'}
                              required
                              className="w-full bg-surface-subtle border border-surface-border rounded-lg py-3 pl-4 pr-12 text-sm focus:border-brand-accent focus:outline-none text-brand-primary"
                              value={confirmPassword}
                              onChange={e => setConfirmPassword(e.target.value)}
                            />
                            <button
                              type="button"
                              onClick={() => setShowConfirmPassword(v => !v)}
                              aria-label={showConfirmPassword ? 'Ocultar senha' : 'Mostrar senha'}
                              aria-pressed={showConfirmPassword}
                              title={showConfirmPassword ? 'Ocultar senha' : 'Mostrar senha'}
                              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-brand-muted hover:text-brand-primary transition-colors"
                            >
                              {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                          </div>
                        </div>
                        <button className="w-full bg-brand-accent text-white py-4 rounded-lg font-bold uppercase tracking-wider shadow-lg hover:bg-brand-accent/90 active:scale-[0.98] transition-all flex items-center justify-center">
                          <span className="text-white">Definir Nova Senha</span>
                        </button>
                      </form>
                    </m.div>
                  )}

                  {authView === 'forgot-password' && (
                    <m.div key="forgot" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="space-y-6 text-left">
                      <h3 className="text-xl font-bold text-center mb-6 text-brand-primary">Recuperar Senha</h3>
                      <form onSubmit={handleForgotPassword} className="space-y-4">
                        <div>
                          <label className="block text-xs font-semibold text-brand-muted uppercase mb-2">E-mail cadastrado</label>
                          <input type="email" required className="w-full bg-surface-subtle border border-surface-border rounded-lg py-3 px-4 text-sm focus:border-brand-accent focus:outline-none text-brand-primary" value={resetEmail} onChange={e => setResetEmail(e.target.value)} />
                        </div>
                        <button className="w-full bg-brand-accent text-white py-4 rounded-lg font-bold uppercase tracking-wider shadow-lg hover:bg-brand-accent/90 active:scale-[0.98] transition-all flex items-center justify-center">
                          <span className="text-white">Enviar Link</span>
                        </button>
                        <button type="button" onClick={() => setAuthView('login')} className="w-full py-4 text-brand-muted font-bold hover:text-brand-primary transition-colors text-center">Voltar</button>
                      </form>
                    </m.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </m.div>
        ) : loadingPreferences || !appReady ? (
          <m.div
            key="app-transition"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="h-screen w-screen flex flex-col items-center justify-center bg-surface-bg gap-4"
          >
            <m.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
              className="w-12 h-12 border-4 border-brand-primary border-t-transparent rounded-full"
            />
            {loadingPreferences && (
              <div className="text-center text-brand-primary space-y-2">
                <p className="text-sm font-bold uppercase tracking-wider">Carregando suas preferências...</p>
                <p className="text-xs text-brand-muted">Aplicando tema e configurações do menu</p>
              </div>
            )}
          </m.div>
        ) : (
          <m.div
            key="app-main"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="h-screen w-full"
          >
            <QualityConfigProvider>
              <StaticDataProvider>
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
                  isSystemOnline={isSystemOnline}
                  isReconnecting={isReconnecting}
                  prefetchedSidebarColor={prefetchedSidebarColor}
                />
              </StaticDataProvider>
            </QualityConfigProvider>
          </m.div>
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
  isSystemOnline,
  isReconnecting,
  prefetchedSidebarColor
}: any) {
  const { resolvedTheme } = useTheme();
  const { theme } = useAuth();
  const { teams } = useStaticData();

  const {
    sidebarColor,
    sidebarColors,
    handleSidebarColorChange,
    handleThemeChange,
    sidebarIsDark,
    sidebarContrastClass,
    sidebarContrastSubtle,
    sidebarBorderClass,
    sidebarStyle,
  } = useSidebarManager({ userData, currentUser, prefetchedSidebarColor });

  const [showTeamList, setShowTeamList] = React.useState(false);
  const [sidebarAccordion, setSidebarAccordion] = React.useState<'teams' | 'avatar' | 'appearance' | 'color' | null>(null);
  const [sidebarTextVisible, setSidebarTextVisible] = React.useState(isSidebarOpen);
  const [isSettingsOpen, setIsSettingsOpen] = React.useState(activeTab === 'admin' || activeTab === 'custom_dashboard');

  // Mesmo comportamento de MonitoriaList.tsx: encolhe a barra lateral ao
  // abrir "Nova Monitoria", dando mais espaço ao formulário, e restaura o
  // estado anterior ao fechar.
  const sidebarWasOpenRef = React.useRef(isSidebarOpen);
  React.useEffect(() => {
    if (isFormOpen) {
      sidebarWasOpenRef.current = isSidebarOpen;
      setIsSidebarOpen(false);
    } else {
      setIsSidebarOpen(sidebarWasOpenRef.current);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFormOpen]);

  const toggleSidebar = () => {
    const willBeOpen = !isSidebarOpen;
    if (!willBeOpen) {
      setSidebarTextVisible(false);
    }
    setIsSidebarOpen(willBeOpen);
  };

  const handleSettingsClick = () => {
    if (!isSidebarOpen) {
      toggleSidebar();
      setIsSettingsOpen(true);
    } else {
      setIsSettingsOpen(!isSettingsOpen);
    }
  };

  React.useEffect(() => {
    if (userData && userData.role !== 'admin' && (activeTab === 'admin' || activeTab === 'custom_dashboard')) {
      setActiveTab('dashboard');
    }
  }, [userData?.role, activeTab]);

  useEffect(() => {
    if (!showTeamList) {
      setSidebarAccordion(null);
      return;
    }
    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.interactive-sidebar-popover') && !target.closest('.profile-toggle-btn')) {
        setShowTeamList(false);
      }
    };
    document.addEventListener('click', handleOutsideClick, true);
    return () => document.removeEventListener('click', handleOutsideClick, true);
  }, [showTeamList]);

  useEffect(() => {
    setShowTeamList(false);
  }, [isSidebarOpen]);

  const userTeams = teams.filter(t => (userData?.team_ids || []).includes(t.id));
  const teamNames = userTeams.map(t => t.name).join(', ');

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

      <m.aside
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
        className={`${sidebarContrastClass} flex flex-col relative z-20 transition-all transition-colors duration-300 border-r ${sidebarBorderClass} group/sidebar cursor-pointer`}
      >
        <div
          onClick={(e) => { e.stopPropagation(); toggleSidebar(); }}
          className="absolute -right-3.5 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-surface-card border border-surface-border text-brand-primary flex items-center justify-center shadow-premium hover:scale-110 active:scale-95 transition-all opacity-0 group-hover/sidebar:opacity-100 z-30 cursor-pointer"
        >
          {isSidebarOpen ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </div>
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

        <nav className="flex-1 px-3 space-y-1 py-4">
          <NavItem isDark={sidebarIsDark} icon={<DashboardIcon className="w-5 h-5" />} label="Dashboard" active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} isOpen={sidebarTextVisible} />
          <NavItem isDark={sidebarIsDark} icon={<ClipboardCheck className="w-5 h-5" />} label="Monitorias" active={activeTab === 'monitorias'} onClick={() => setActiveTab('monitorias')} isOpen={sidebarTextVisible} />
          {userData?.role === 'admin' && (
            <div className="space-y-1">
              <button
                onClick={handleSettingsClick}
                className={`
                  w-full flex items-center gap-3 px-4 h-11 rounded-xl transition-all font-bold group relative text-left cursor-pointer
                  ${((activeTab === 'admin' || activeTab === 'custom_dashboard') && !isSettingsOpen)
                    ? (sidebarIsDark ? 'bg-white/10 text-white' : 'bg-black/10 text-slate-900')
                    : (sidebarIsDark ? 'text-white/40 hover:text-white hover:bg-white/5' : 'text-slate-900/40 hover:text-slate-900 hover:bg-black/5')}
                `}
              >
                {(activeTab === 'admin' || activeTab === 'custom_dashboard') && !isSettingsOpen && (
                  <m.div
                    layoutId="active-bar"
                    className={`absolute left-0 w-1 h-6 rounded-full ${sidebarIsDark ? 'bg-white' : 'bg-slate-900'}`}
                  />
                )}
                <div className={`${((activeTab === 'admin' || activeTab === 'custom_dashboard') && !isSettingsOpen) ? 'text-current' : (sidebarIsDark ? 'text-white/30 group-hover:text-white' : 'text-slate-900/30 group-hover:text-slate-900')}`}>
                  <Settings className="w-5 h-5" />
                </div>
                <div className={`flex-1 flex items-center justify-between overflow-hidden transition-all duration-300 ${sidebarTextVisible ? 'opacity-100 max-w-full' : 'opacity-0 max-w-0'}`}>
                  <span className="text-sm tracking-tight whitespace-nowrap block pl-1">
                    Configurações
                  </span>
                  <ChevronDown className={`w-4 h-4 text-current transition-transform duration-200 ${isSettingsOpen ? 'rotate-180' : ''}`} />
                </div>
              </button>

              <AnimatePresence initial={false}>
                {isSettingsOpen && sidebarTextVisible && (
                  <m.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2, ease: "easeInOut" }}
                    className="overflow-hidden pl-1 space-y-1"
                  >
                    <SubNavItem
                      label="Geral"
                      active={activeTab === 'admin'}
                      onClick={() => setActiveTab('admin')}
                      isOpen={sidebarTextVisible}
                      isDark={sidebarIsDark}
                    />
                    <SubNavItem
                      label="Customizar Dashboards"
                      active={activeTab === 'custom_dashboard'}
                      onClick={() => setActiveTab('custom_dashboard')}
                      isOpen={sidebarTextVisible}
                      isDark={sidebarIsDark}
                    />
                  </m.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </nav>

        <div className="p-3 border-t border-white/5 interactive-sidebar-item">
          <div className="relative interactive-sidebar-item">
            <div className="flex items-center gap-3 p-2 rounded-xl bg-black/10 overflow-hidden">
              <button
                onClick={() => setShowTeamList(!showTeamList)}
                className="profile-toggle-btn w-9 h-9 rounded-lg bg-black/10 flex items-center justify-center flex-shrink-0 hover:bg-black/20 transition-all relative cursor-pointer"
              >
                <UserIcon className="w-5 h-5" />
                <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 border-2 rounded-full transition-colors duration-300" style={{ borderColor: sidebarColor || `var(--sidebar-bg-${(userData?.role || 'admin').replace('_', '-')})` }} />
              </button>

              <div className="flex-1 flex items-center gap-2 min-w-0 overflow-hidden" style={{ opacity: sidebarTextVisible ? 1 : 0, maxWidth: sidebarTextVisible ? undefined : 0, transition: 'opacity 0.15s ease' }}>
                <button
                  onClick={() => setShowTeamList(!showTeamList)}
                  className="profile-toggle-btn min-w-0 flex-1 py-1 text-left cursor-pointer hover:opacity-80 transition-opacity"
                >
                  <p className="text-xs font-bold leading-tight truncate">{userData?.name}</p>
                  <p className={`text-[10px] font-medium ${sidebarContrastSubtle} uppercase tracking-wider mt-0.5 leading-tight truncate`}>
                    {userData ? ROLE_LABELS[userData.role as UserRole] : ''}
                  </p>
                </button>

                <button
                  onClick={handleLogout}
                  className={`p-1.5 ${sidebarIsDark ? 'hover:bg-white/10 text-white/40 hover:text-white' : 'hover:bg-black/10 text-slate-900/40 hover:text-slate-900'} rounded-lg transition-colors cursor-pointer flex-shrink-0`}
                  title="Sair"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            </div>

            <AnimatePresence>
              {showTeamList && (
                <m.div
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  className={`absolute w-56 bg-surface-card border border-surface-border rounded-2xl shadow-premium z-50 text-brand-primary interactive-sidebar-popover overflow-hidden ${isSidebarOpen ? 'bottom-full left-0 mb-2' : 'bottom-0 left-full ml-2' }`}
                >
                  <div className="p-3 space-y-0.5">
                    <div>
                      <button
                        onClick={() => setSidebarAccordion(sidebarAccordion === 'teams' ? null : 'teams')}
                        className="w-full flex items-center justify-between gap-2 py-2 px-2 rounded-xl hover:bg-surface-subtle transition-colors cursor-pointer group"
                      >
                        <div className="flex items-center gap-2">
                          <Users className="w-4 h-4 text-brand-accent" />
                          <span className="text-[11px] font-black uppercase tracking-wider">Equipes</span>
                        </div>
                        <ChevronDown className={`w-3.5 h-3.5 text-brand-muted transition-transform duration-200 ${sidebarAccordion === 'teams' ? 'rotate-180' : ''}`} />
                      </button>
                      <AnimatePresence initial={false}>
                        {sidebarAccordion === 'teams' && (
                          <m.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2, ease: 'easeInOut' }}
                            className="overflow-hidden"
                          >
                            <div className="pb-2 px-2 space-y-0.5">
                              {userTeams.length > 0 ? userTeams.map(t => (
                                <div key={t.id} className="text-[11px] py-1 px-2 rounded-lg font-semibold text-brand-muted">{t.name}</div>
                              )) : (
                                <div className="text-[10px] text-brand-muted italic px-2 py-1">Nenhuma equipe vinculada</div>
                              )}
                            </div>
                          </m.div>
                        )}
                      </AnimatePresence>
                    </div>

                    <div className="border-t border-surface-border">
                      <button
                        onClick={() => setSidebarAccordion(sidebarAccordion === 'avatar' ? null : 'avatar')}
                        className="w-full flex items-center justify-between gap-2 py-2 px-2 rounded-xl hover:bg-surface-subtle transition-colors cursor-pointer group"
                      >
                        <div className="flex items-center gap-2">
                          <UserIcon className="w-4 h-4 text-brand-accent" />
                          <span className="text-[11px] font-black uppercase tracking-wider">Avatar</span>
                        </div>
                        <ChevronDown className={`w-3.5 h-3.5 text-brand-muted transition-transform duration-200 ${sidebarAccordion === 'avatar' ? 'rotate-180' : ''}`} />
                      </button>
                      <AnimatePresence initial={false}>
                        {sidebarAccordion === 'avatar' && (
                          <m.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2, ease: 'easeInOut' }}
                            className="overflow-hidden"
                          >
                            <div className="pb-2 px-2">
                              <div className="text-[10px] text-brand-muted italic py-1">Em breve</div>
                            </div>
                          </m.div>
                        )}
                      </AnimatePresence>
                    </div>

                    <div className="border-t border-surface-border">
                      <button
                        onClick={() => setSidebarAccordion(sidebarAccordion === 'appearance' ? null : 'appearance')}
                        className="w-full flex items-center justify-between gap-2 py-2 px-2 rounded-xl hover:bg-surface-subtle transition-colors cursor-pointer group"
                      >
                        <div className="flex items-center gap-2">
                          {theme === 'dark' ? <Moon className="w-4 h-4 text-brand-accent" /> : theme === 'light' ? <Sun className="w-4 h-4 text-brand-accent" /> : <Monitor className="w-4 h-4 text-brand-accent" />}
                          <span className="text-[11px] font-black uppercase tracking-wider">Aparência</span>
                          <span className="text-[10px] font-semibold text-brand-muted normal-case tracking-normal">
                            {theme === 'light' ? 'Claro' : theme === 'dark' ? 'Escuro' : 'Sistema'}
                          </span>
                        </div>
                        <ChevronDown className={`w-3.5 h-3.5 text-brand-muted transition-transform duration-200 ${sidebarAccordion === 'appearance' ? 'rotate-180' : ''}`} />
                      </button>
                      <AnimatePresence initial={false}>
                        {sidebarAccordion === 'appearance' && (
                          <m.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2, ease: 'easeInOut' }}
                            className="overflow-hidden"
                          >
                            <div className="pb-2 px-2">
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
                                      onClick={(e) => { e.stopPropagation(); handleThemeChange(opt.value as Theme); }}
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
                            </div>
                          </m.div>
                        )}
                      </AnimatePresence>
                    </div>

                    <div className="border-t border-surface-border">
                      <button
                        onClick={() => setSidebarAccordion(sidebarAccordion === 'color' ? null : 'color')}
                        className="w-full flex items-center justify-between gap-2 py-2 px-2 rounded-xl hover:bg-surface-subtle transition-colors cursor-pointer group"
                      >
                        <div className="flex items-center gap-2">
                          <Palette className="w-4 h-4 text-brand-accent" />
                          <span className="text-[11px] font-black uppercase tracking-wider">Cor do Menu</span>
                          {sidebarColor && (
                            <span className="w-3.5 h-3.5 rounded-full flex-shrink-0 border border-surface-border" style={{ backgroundColor: sidebarColor }} />
                          )}
                        </div>
                        <ChevronDown className={`w-3.5 h-3.5 text-brand-muted transition-transform duration-200 ${sidebarAccordion === 'color' ? 'rotate-180' : ''}`} />
                      </button>
                      <AnimatePresence initial={false}>
                        {sidebarAccordion === 'color' && (
                          <m.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2, ease: 'easeInOut' }}
                            className="overflow-hidden"
                          >
                            <div className="pb-2 px-2">
                              <div className="grid grid-cols-5 gap-1.5">
                                {sidebarColors.map(opt => {
                                  const isActive = sidebarColor === opt.value;
                                  return (
                                    <button
                                      key={opt.label}
                                      onClick={() => { handleSidebarColorChange(opt.value); }}
                                      className={`w-7 h-7 rounded-full ${opt.hex} border-2 hover:scale-110 active:scale-95 transition-all flex items-center justify-center cursor-pointer ${isActive ? 'border-brand-accent shadow-md scale-105' : 'border-surface-border'}`}
                                      title={opt.label}
                                    >
                                      {isActive && <Check className="w-3.5 h-3.5 text-white drop-shadow" />}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          </m.div>
                        )}
                      </AnimatePresence>
                    </div>

                    <div className="border-t border-surface-border pt-1 mt-1">
                      <button
                        onClick={() => { setShowTeamList(false); handleLogout(); }}
                        className="w-full flex items-center gap-2 py-2 px-2 rounded-xl hover:bg-red-50 dark:hover:bg-red-950/20 text-red-500 hover:text-red-600 dark:hover:text-red-400 transition-colors cursor-pointer"
                      >
                        <LogOut className="w-4 h-4" />
                        <span className="text-[11px] font-black uppercase tracking-wider">Sair</span>
                      </button>
                    </div>
                  </div>
                </m.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </m.aside>

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

        <div className="flex-1 overflow-auto px-8 pb-8 pt-6 min-w-0" style={{ scrollbarGutter: 'stable' }}>
          <React.Suspense fallback={<div className="flex justify-center items-center h-full"><div className="w-8 h-8 border-4 border-brand-accent border-t-transparent rounded-full animate-spin"></div></div>}>
            {activeTab === 'dashboard' && (
              <div className="animate-fade-in">
                <DashboardMain user={userData} activeTab={activeTab} />
              </div>
            )}
            {activeTab === 'monitorias' && (
              <div className="animate-fade-in">
                <MonitoriaList user={userData} onNew={() => setIsFormOpen(true)} activeTab={activeTab} />
              </div>
            )}
            {userData?.role === 'admin' && (
              <>
                {activeTab === 'admin' && (
                  <div className="animate-fade-in">
                    <AdminPanel user={userData} />
                  </div>
                )}
                {activeTab === 'custom_dashboard' && (
                  <div className="animate-fade-in">
                    <CustomDashboardManagement user={userData} />
                  </div>
                )}
              </>
            )}
          </React.Suspense>
        </div>
      </main>
    </div>
  );
}

function NavItem({ icon, label, active, onClick, isOpen, isDark, badge }: any) {
  return (
    <button
      onClick={onClick}
      className={`
        w-full flex items-center gap-3 px-4 h-11 rounded-xl transition-all font-bold group relative
        ${active
          ? (isDark ? 'bg-white/10 text-white' : 'bg-black/10 text-slate-900')
          : (isDark ? 'text-white/40 hover:text-white hover:bg-white/5' : 'text-slate-900/40 hover:text-slate-900 hover:bg-black/5')}
      `}
    >
      {active && (
        <m.div
          layoutId="active-bar"
          className={`absolute left-0 w-1 h-6 rounded-full ${isDark ? 'bg-white' : 'bg-slate-900'}`}
        />
      )}
      <div className={`${active ? 'text-current' : (isDark ? 'text-white/30 group-hover:text-white' : 'text-slate-900/30 group-hover:text-slate-900')}`}>
        {icon}
      </div>
      <div className={`flex-1 flex items-center justify-between overflow-hidden transition-all duration-300 ${isOpen ? 'opacity-100 max-w-full' : 'opacity-0 max-w-0'}`}>
        <span className="text-sm tracking-tight whitespace-nowrap block pl-1">
          {label}
        </span>
        {badge && (
          <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border border-dashed ml-2 leading-none whitespace-nowrap ${isDark ? 'border-white/10 text-white/40 bg-white/5' : 'border-slate-300/60 text-slate-500/80 bg-slate-50'}`}>
            {badge}
          </span>
        )}
      </div>
    </button>
  );
}

function SubNavItem({ label, active, onClick, isOpen, isDark, badge }: any) {
  return (
    <button
      onClick={onClick}
      className={`
        w-full flex items-center justify-between pl-11 pr-4 h-9 rounded-xl transition-all font-medium text-xs group relative
        ${active
          ? (isDark ? 'bg-white/5 text-white font-bold' : 'bg-black/5 text-slate-900 font-bold')
          : (isDark ? 'text-white/40 hover:text-white hover:bg-white/5' : 'text-slate-900/40 hover:text-slate-900 hover:bg-black/5')}
      `}
    >
      {active && (
        <div
          className={`absolute left-5 w-1 h-4 rounded-full ${isDark ? 'bg-white' : 'bg-slate-900'}`}
        />
      )}
      <span className="tracking-tight whitespace-nowrap block">
        {label}
      </span>
      {badge && (
        <span className={`text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-full border border-dashed ml-2 leading-none whitespace-nowrap ${isDark ? 'border-white/10 text-white/40 bg-white/5' : 'border-slate-300/60 text-slate-500/80 bg-slate-50'}`}>
          {badge}
        </span>
      )}
    </button>
  );
}
