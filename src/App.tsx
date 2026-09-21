import { ProtectedAuthForm } from './components/ui/ProtectedAuthForm';
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './lib/queryClient';
import { Layout, LayoutDashboard as DashboardIcon, ClipboardCheck, Settings, LogOut, ChevronRight, ChevronLeft, ChevronDown, Search, Plus, User as UserIcon, Clock, Sun, Moon, Users, X, Monitor, AlertTriangle, BarChart3, Eye, EyeOff, Layers, Bell, CheckCheck, Mail, MailOpen } from 'lucide-react';
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
import { useMonitoriaData } from './hooks/useMonitoriaData';

import { lazyWithRetry } from './utils/lazyWithRetry';

// Components
const DashboardMain = lazyWithRetry(() => import('./components/dashboard/DashboardMain'));
const MonitoriaList = lazyWithRetry(() => import('./components/MonitoriaList'));
const MonitoriaForm = lazyWithRetry(() => import('./components/MonitoriaForm'));
const AdminPanel = lazyWithRetry(() => import('./components/AdminPanel'));
const CustomDashboardManagement = lazyWithRetry(() => import('./components/CustomDashboardManagement'));
const AuditingQueueView = lazyWithRetry(() => import('./components/AuditingQueueView'));

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
      <Toaster position="top-right" richColors closeButton duration={4000} />
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
            className="auth-screen h-screen w-screen flex flex-col items-center justify-center bg-surface-bg p-6 text-brand-primary"
          >
            <div className="auth-content max-w-md w-full text-center space-y-8">
              <h1 className="inline-flex items-center gap-1 bg-[#0A1F44] px-3 py-1.5 rounded-xl text-5xl font-bold tracking-tight">
                <span className="text-white">Qualidade</span>
                <span className="inline-flex items-center bg-white px-1.5 py-0.5 rounded-md leading-none">
                  <span className="text-[#B3141B]">W</span><span className="text-[#0A1F44]">P</span>
                </span>
              </h1>
              <div className="auth-card bg-surface-card p-8 rounded-[40px] border border-surface-border shadow-premium min-h-[400px] flex flex-col justify-center">
                <AnimatePresence mode="wait">
                  {authView === 'login' && (
                    <m.div key="login" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="space-y-6">
                      <h3 className="text-xl font-bold text-center mb-6">Acesse sua Conta</h3>
                      <ProtectedAuthForm onSubmit={handleLogin} className="space-y-4 text-left">
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
                      </ProtectedAuthForm>
                      <button onClick={() => setAuthView('request-access')} className="text-sm font-bold text-brand-accent hover:text-brand-primary transition-colors">Não tem acesso? Solicite aqui</button>
                    </m.div>
                  )}

                  {authView === 'request-access' && (
                    <m.div key="request" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="space-y-6 text-left">
                      <h3 className="text-xl font-bold text-center mb-6 text-brand-primary">Solicitar Novo Acesso</h3>
                      <ProtectedAuthForm onSubmit={handleRequestAccess} className="space-y-4">
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
                      </ProtectedAuthForm>
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
                      <ProtectedAuthForm onSubmit={handleForgotPassword} className="space-y-4">
                        <div>
                          <label className="block text-xs font-semibold text-brand-muted uppercase mb-2">E-mail cadastrado</label>
                          <input type="email" required className="w-full bg-surface-subtle border border-surface-border rounded-lg py-3 px-4 text-sm focus:border-brand-accent focus:outline-none text-brand-primary" value={resetEmail} onChange={e => setResetEmail(e.target.value)} />
                        </div>
                        <button className="w-full bg-brand-accent text-white py-4 rounded-lg font-bold uppercase tracking-wider shadow-lg hover:bg-brand-accent/90 active:scale-[0.98] transition-all flex items-center justify-center">
                          <span className="text-white">Enviar Link</span>
                        </button>
                        <button type="button" onClick={() => setAuthView('login')} className="w-full py-4 text-brand-muted font-bold hover:text-brand-primary transition-colors text-center">Voltar</button>
                      </ProtectedAuthForm>
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
}: any) {
  const { theme } = useAuth();
  const { users, teams, forms, refreshAll } = useStaticData();
  const { monitorias } = useMonitoriaData(userData, activeTab);
  const [formPrefillData, setFormPrefillData] = React.useState<any>(undefined);
  const [isSettingsHovered, setIsSettingsHovered] = React.useState(false);

  const handleStartAuditFromQueue = (prefill: any) => {
    // O agente pode ter sido criado agora mesmo (conta provisória) pela
    // Edge Function de triagem — se ainda não está no cache local de
    // usuários, atualiza para que o formulário já abra com o nome
    // preenchido no lugar de um seletor vazio.
    if (prefill.evaluated_id && !users.some((u: User) => u.id === prefill.evaluated_id)) {
      refreshAll();
    }

    setFormPrefillData({
      ticket_id: prefill.ticket_id,
      ticket_subject: prefill.ticket_subject,
      form_id: prefill.form_id,
      evaluated_id: prefill.evaluated_id,
      team_id: prefill.team_id,
      channel: prefill.channel,
      satisfaction_result: prefill.satisfaction_result,
      satisfaction_has_record: prefill.satisfaction_has_record,
      satisfaction_record_text: prefill.satisfaction_record_text,
      isAiLocked: prefill.isAiLocked,
      customerType: prefill.customerType,
      ticket_fields: prefill.ticket_fields || prefill.aiEvaluation?.ticket_fields,
      aiEvaluation: prefill.aiEvaluation,
      childAiEvaluation: prefill.child_evaluation || prefill.childAiEvaluation,
      dialogue: prefill.dialogue || prefill.aiEvaluation?.dialogue,
      ...(prefill.aiEvaluation ? {
        answers: prefill.aiEvaluation.suggested_answers,
        question_observations: prefill.aiEvaluation.suggested_observations,
        selected_critical_errors: Object.keys(prefill.aiEvaluation.suggested_critical_errors).filter(k => prefill.aiEvaluation.suggested_critical_errors[k]),
        evaluator_note: prefill.aiEvaluation.summary
      } : {})
    });
    setIsFormOpen(true);
  };

  const {
    sidebarColor,
    handleThemeChange,
    sidebarIsDark,
    sidebarContrastClass,
    sidebarContrastSubtle,
    sidebarBorderClass,
    sidebarStyle,
  } = useSidebarManager({ userData });

  const [showTeamList, setShowTeamList] = React.useState(false);
  const [showNotifications, setShowNotifications] = React.useState(false);
  const [readNotificationIds, setReadNotificationIds] = React.useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem('qualitrack_read_notifications');
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch {
      return new Set();
    }
  });

  const [sidebarAccordion, setSidebarAccordion] = React.useState<'teams' | 'avatar' | 'appearance' | null>(null);
  const [sidebarTextVisible, setSidebarTextVisible] = React.useState(isSidebarOpen);
  const [isSettingsOpen, setIsSettingsOpen] = React.useState(activeTab === 'admin' || activeTab === 'custom_dashboard');
  const [isQueueModalOpen, setIsQueueModalOpen] = React.useState(false);

  const [sessionStartTime] = React.useState(() => new Date());

  const notifications = React.useMemo(() => {
    const list: Array<{
      id: string;
      title: string;
      message: string;
      time: string;
      type: 'contestacao' | 'monitoria' | 'fila' | 'sistema';
      iconBg: string;
      icon: React.ReactNode;
      targetTab?: string;
      read: boolean;
    }> = [];

    // Notificações para Suporte
    if (userData?.role === 'suporte') {
      const myMonitorias = monitorias.filter((m: any) => m.evaluated_id === userData.id);
      const contested = myMonitorias.filter((m: any) => m.status === 'contestado');
      if (contested.length > 0) {
        const itemDate = contested[0].updated_at || contested[0].created_at;
        const timeStr = itemDate
          ? formatDate(new Date(itemDate), "dd/MM 'às' HH:mm")
          : `Hoje às ${formatDate(sessionStartTime, 'HH:mm')}`;
        list.push({
          id: `contested-${contested[0].id}`,
          title: 'Contestação em Análise',
          message: `Sua contestação da monitoria #${contested[0].ticket_id || contested[0].id.slice(0, 6)} está sendo reavaliada pela Qualidade.`,
          time: timeStr,
          type: 'contestacao',
          iconBg: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
          icon: <AlertTriangle className="w-3.5 h-3.5" />,
          targetTab: 'monitorias',
          read: readNotificationIds.has(`contested-${contested[0].id}`)
        });
      }
      if (myMonitorias.length > 0) {
        const latest = myMonitorias[0];
        const timeStr = latest.created_at
          ? formatDate(new Date(latest.created_at), "dd/MM 'às' HH:mm")
          : `Hoje às ${formatDate(sessionStartTime, 'HH:mm')}`;
        list.push({
          id: `eval-${latest.id}`,
          title: 'Nova Avaliação Disponível',
          message: `Monitoria referente ao chamado #${latest.ticket_id} foi publicada com nota ${latest.score}%.`,
          time: timeStr,
          type: 'monitoria',
          iconBg: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
          icon: <ClipboardCheck className="w-3.5 h-3.5" />,
          targetTab: 'monitorias',
          read: readNotificationIds.has(`eval-${latest.id}`)
        });
      }
    }

    // Notificações para Qualidade / Gestores / Admin
    if (userData?.role === 'qualidade' || userData?.role === 'gestor_qualidade' || userData?.role === 'admin') {
      const pendingContestations = monitorias.filter((m: any) => m.status === 'contestado');
      if (pendingContestations.length > 0) {
        const itemDate = pendingContestations[0]?.updated_at || pendingContestations[0]?.created_at;
        const timeStr = itemDate
          ? formatDate(new Date(itemDate), "dd/MM 'às' HH:mm")
          : `Hoje às ${formatDate(sessionStartTime, 'HH:mm')}`;
        list.push({
          id: `admin-contest-${pendingContestations.length}`,
          title: `${pendingContestations.length} Contestação(ões) Pendente(s)`,
          message: 'Monitorias contestadas por analistas aguardando reanálise e parecer da equipe de Qualidade.',
          time: timeStr,
          type: 'contestacao',
          iconBg: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
          icon: <AlertTriangle className="w-3.5 h-3.5" />,
          targetTab: 'monitorias',
          read: readNotificationIds.has(`admin-contest-${pendingContestations.length}`)
        });
      }

      list.push({
        id: 'queue-csat-negativas',
        title: 'Fila de Triagem Atualizada',
        message: 'Chamados com CSAT Ruim e Chamados Filhos disponíveis para auditoria com IA.',
        time: `Hoje às ${formatDate(sessionStartTime, 'HH:mm')}`,
        type: 'fila',
        iconBg: 'bg-brand-highlight/10 text-brand-highlight',
        icon: <Layers className="w-3.5 h-3.5" />,
        targetTab: 'filas',
        read: readNotificationIds.has('queue-csat-negativas')
      });
    }

    // Notificação do sistema: status de conexão e IA (exclusivo para Administrador)
    if (userData?.role === 'admin') {
      list.push({
        id: 'system-status-ok',
        title: 'Sistema QualiTrack Conectado',
        message: 'Integração Zendesk API e IA Gemini 2.5 Flash sincronizadas em tempo real.',
        time: `Hoje às ${formatDate(sessionStartTime, 'HH:mm')}`,
        type: 'sistema',
        iconBg: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
        icon: <Clock className="w-3.5 h-3.5" />,
        read: readNotificationIds.has('system-status-ok')
      });
    }

    return list;
  }, [userData, monitorias, readNotificationIds, sessionStartTime]);

  const unreadNotificationsCount = notifications.filter(n => !n.read).length;

  const markAllNotificationsAsRead = () => {
    const allIds = new Set(notifications.map(n => n.id));
    setReadNotificationIds(allIds);
    try {
      localStorage.setItem('qualitrack_read_notifications', JSON.stringify(Array.from(allIds)));
    } catch {}
    toast.success('Todas as notificações foram marcadas como lidas.');
  };

  const handleNotificationClick = (item: any) => {
    const next = new Set(readNotificationIds);
    next.add(item.id);
    setReadNotificationIds(next);
    try {
      localStorage.setItem('qualitrack_read_notifications', JSON.stringify(Array.from(next)));
    } catch {}
    if (item.targetTab) {
      setActiveTab(item.targetTab);
    }
    setShowNotifications(false);
  };

  // Encolhe a barra lateral ao abrir "Nova Monitoria" ou qualquer card/modal
  // de inspeção/confronto ou configurações, dando foco e todo o espaço para a tela,
  // e restaura o estado anterior ao fechar.
  const sidebarWasOpenRef = React.useRef(isSidebarOpen);
  React.useEffect(() => {
    if (isFormOpen || isQueueModalOpen) {
      sidebarWasOpenRef.current = isSidebarOpen;
      setIsSidebarOpen(false);
    } else {
      setIsSidebarOpen(sidebarWasOpenRef.current);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFormOpen, isQueueModalOpen]);

  // Listener universal para qualquer modal aberto via qualitrack:modal
  React.useEffect(() => {
    const handleGlobalModal = (e: any) => {
      const open = !!e.detail?.open;
      if (open) {
        sidebarWasOpenRef.current = isSidebarOpen;
        setIsSidebarOpen(false);
      } else {
        setIsSidebarOpen(sidebarWasOpenRef.current);
      }
    };
    window.addEventListener('qualitrack:modal', handleGlobalModal);
    return () => window.removeEventListener('qualitrack:modal', handleGlobalModal);
  }, [isSidebarOpen]);

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
    setShowNotifications(false);
  }, [isSidebarOpen]);

  useEffect(() => {
    if (!showNotifications) return;
    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.notifications-popover') && !target.closest('.notifications-toggle-btn')) {
        setShowNotifications(false);
      }
    };
    document.addEventListener('click', handleOutsideClick, true);
    return () => document.removeEventListener('click', handleOutsideClick, true);
  }, [showNotifications]);

  const userTeams = teams.filter(t => (userData?.team_ids || []).includes(t.id));
  const teamNames = userTeams.map(t => t.name).join(', ');

  return (
    <div className="h-screen w-full flex bg-surface-bg text-brand-primary font-sans overflow-hidden">
      <AnimatePresence>
        {isFormOpen && (
          <MonitoriaForm
            user={userData}
            initialData={formPrefillData}
            onCancel={() => { setIsFormOpen(false); setFormPrefillData(undefined); }}
            // O id da monitoria salva não é usado aqui; a lista recarrega ao trocar de aba.
            onSaved={() => { setIsFormOpen(false); setFormPrefillData(undefined); setActiveTab('monitorias'); }}
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
              <h2 className="inline-flex items-center gap-0.5 bg-[#0A1F44] px-2 py-1 rounded-lg font-bold text-lg tracking-tight">
                <span className="text-white">Qualidade</span>
                <span className="inline-flex items-center bg-white px-1 py-px rounded leading-none">
                  <span className="text-[#B3141B]">W</span><span className="text-[#0A1F44]">P</span>
                </span>
              </h2>
            )}
          </div>
        </div>

        <nav className="flex-1 px-3 space-y-1 py-4">
          <NavItem isDark={sidebarIsDark} icon={AnimatedDashboardIcon} label="Dashboard" active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} isOpen={sidebarTextVisible} />
          <NavItem isDark={sidebarIsDark} icon={AnimatedMonitoriasIcon} label="Monitorias" active={activeTab === 'monitorias'} onClick={() => setActiveTab('monitorias')} isOpen={sidebarTextVisible} />
          {userData?.role !== 'suporte' && (
            <NavItem isDark={sidebarIsDark} icon={AnimatedLayersIcon} label="Filas de Triagem" active={activeTab === 'filas'} onClick={() => setActiveTab('filas')} isOpen={sidebarTextVisible} />
          )}
          {userData?.role === 'admin' && (
            <div className="space-y-1">
              <button
                onClick={handleSettingsClick}
                onMouseEnter={() => setIsSettingsHovered(true)}
                onMouseLeave={() => setIsSettingsHovered(false)}
                className={`
                  w-full flex items-center gap-3 px-4 h-11 rounded-xl transition-all font-bold group relative text-left cursor-pointer
                  ${((activeTab === 'admin' || activeTab === 'custom_dashboard') && !isSettingsOpen)
                    ? (sidebarIsDark ? 'bg-white/10 text-white' : 'bg-black/10 text-black')
                    : (sidebarIsDark ? 'text-white/40 hover:text-white hover:bg-white/5' : 'text-slate-800 hover:text-black hover:bg-black/5')}
                `}
              >
                {(activeTab === 'admin' || activeTab === 'custom_dashboard') && !isSettingsOpen && (
                  <m.div
                    layoutId="active-bar"
                    className={`absolute left-0 w-1 h-6 rounded-full ${sidebarIsDark ? 'bg-white' : 'bg-black'}`}
                  />
                )}
                <div className={`${((activeTab === 'admin' || activeTab === 'custom_dashboard') && !isSettingsOpen) ? 'text-current' : (sidebarIsDark ? 'text-white/30 group-hover:text-white' : 'text-slate-700 group-hover:text-black')}`}>
                  <AnimatedSettingsIcon isHovered={isSettingsHovered} active={(activeTab === 'admin' || activeTab === 'custom_dashboard') || isSettingsOpen} className="w-5 h-5" />
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
          <div
            className="flex items-center gap-3 p-2 rounded-xl bg-black/10 overflow-hidden"
            title={`${isReconnecting ? 'Reconectando...' : isSystemOnline ? 'Sistema Online' : 'Sistema Offline'} — ${formatDate(new Date(), "EEEE, dd 'de' MMMM", { locale: ptBR })}`}
          >
            <div className="w-9 h-9 rounded-lg bg-black/10 flex items-center justify-center flex-shrink-0 relative">
              <div className={`w-2.5 h-2.5 rounded-full ${isSystemOnline ? 'bg-success animate-pulse' : 'bg-error'} ${isReconnecting ? 'animate-bounce' : ''}`} />
            </div>

            <div
              className="flex-1 min-w-0 overflow-hidden"
              style={{
                opacity: sidebarTextVisible ? 1 : 0,
                maxWidth: sidebarTextVisible ? undefined : 0,
                transition: 'opacity 0.15s ease'
              }}
            >
              <div className="flex items-center gap-1.5">
                <span className={`text-[11px] font-bold tracking-normal leading-tight truncate ${isSystemOnline ? '' : 'text-error'}`}>
                  {isReconnecting ? 'Reconectando...' : isSystemOnline ? 'Sistema Online' : 'Sistema Offline'}
                </span>
              </div>
              <p className={`text-[10px] font-medium ${sidebarContrastSubtle} capitalize tracking-wider mt-0.5 leading-tight truncate`}>
                {formatDate(new Date(), "EEEE, dd 'de' MMMM", { locale: ptBR })}
              </p>
            </div>
          </div>
        </div>
      </m.aside>

      <main className="flex-1 flex flex-col min-w-0 overflow-hidden bg-surface-bg">
        <header className="px-8 h-20 flex items-center gap-4 border-b border-surface-border/60 bg-surface-bg/85 backdrop-blur-md sticky top-0 z-20 transition-colors">
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
              <h2 className="text-xl font-bold text-brand-primary tracking-tight leading-snug">
                {activeTab === 'dashboard'
                  ? `Olá, ${userData?.name.split(' ')[0]}! 👋`
                  : activeTab === 'monitorias'
                  ? 'Gestão de Monitorias'
                  : activeTab === 'filas'
                  ? 'Central de Filas & Triagem'
                  : 'Configurações do Sistema'}
              </h2>
              <p className="text-xs font-semibold text-brand-muted tracking-wide mt-1 leading-relaxed">
                {activeTab === 'dashboard'
                  ? (userData?.role === 'suporte'
                    ? 'Acompanhe seu desempenho e evolução individual'
                    : userData?.role === 'qualidade'
                    ? 'Gestão de produtividade e análise de qualidade'
                    : 'Visão executiva da performance e KPIs globais')
                  : activeTab === 'monitorias'
                  ? 'Fluxo de auditoria, contestações e reavaliações'
                  : activeTab === 'filas'
                  ? 'Triagem inteligente de chamados do Zendesk por CSAT e tickets filhos'
                  : 'Parâmetros de qualidade, usuários, equipes e inteligência artificial'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {userData?.role === 'qualidade' && (
              <button
                onClick={() => setIsFormOpen(true)}
                className="action-primary h-10 px-5 rounded-xl text-sm font-semibold shadow-premium transition-all flex items-center gap-2"
              >
                <Plus className="w-4 h-4" /> Nova Monitoria
              </button>
            )}

            {/* Notificações do Sistema: Carta Animada (Fechada com animação e branco preenchido quando há novas / Aberta estática quando todas lidas) */}
            <div className="relative">
              <button
                onClick={() => {
                  setShowNotifications(!showNotifications);
                  setShowTeamList(false);
                }}
                className={`notifications-toggle-btn relative p-2.5 rounded-xl border transition-all cursor-pointer shadow-xs flex items-center justify-center ${
                  unreadNotificationsCount > 0
                    ? 'bg-brand-highlight text-white border-brand-highlight hover:bg-brand-highlight/90 shadow-md ring-2 ring-brand-highlight/25'
                    : 'bg-surface-card border-surface-border/60 hover:bg-surface-subtle text-brand-muted hover:text-brand-primary'
                }`}
                title={unreadNotificationsCount > 0 ? `${unreadNotificationsCount} novas notificações (carta fechada)` : 'Todas as notificações foram lidas (carta aberta)'}
              >
                {unreadNotificationsCount > 0 ? (
                  <m.div
                    animate={{
                      scale: [1, 1.14, 1],
                      rotate: [0, -6, 6, 0]
                    }}
                    transition={{
                      repeat: Infinity,
                      duration: 2.2,
                      ease: "easeInOut"
                    }}
                    className="flex items-center justify-center"
                  >
                    <Mail className="w-4 h-4" />
                  </m.div>
                ) : (
                  <MailOpen className="w-4 h-4 text-brand-muted hover:text-brand-primary transition-colors" />
                )}

                {unreadNotificationsCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] rounded-full bg-functional-error text-white text-[9px] font-black flex items-center justify-center px-1 border-2 border-surface-bg shadow-sm">
                    {unreadNotificationsCount}
                  </span>
                )}
              </button>

              <AnimatePresence>
                {showNotifications && (
                  <m.div
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    transition={{ duration: 0.15 }}
                    className="absolute right-0 top-full mt-2 w-80 sm:w-96 bg-surface-card border border-surface-border rounded-2xl shadow-premium z-50 text-brand-primary notifications-popover overflow-hidden"
                  >
                    {/* Header do Menu */}
                    <div className="p-3.5 border-b border-surface-border bg-surface-subtle/40 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {unreadNotificationsCount > 0 ? (
                          <div className="w-7 h-7 rounded-lg bg-brand-highlight/15 text-brand-highlight flex items-center justify-center">
                            <Mail className="w-4 h-4" />
                          </div>
                        ) : (
                          <div className="w-7 h-7 rounded-lg bg-surface-card text-brand-muted border border-surface-border flex items-center justify-center">
                            <MailOpen className="w-4 h-4" />
                          </div>
                        )}
                        <div>
                          <h4 className="text-xs font-black text-brand-primary leading-tight">Histórico de Notificações</h4>
                          <p className="text-[10px] text-brand-muted">
                            {unreadNotificationsCount > 0
                              ? `${unreadNotificationsCount} pendente(s) de leitura`
                              : 'Todas as notificações marcadas como lidas'}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        {unreadNotificationsCount > 0 && (
                          <button
                            onClick={markAllNotificationsAsRead}
                            className="text-[10px] font-bold text-brand-highlight hover:text-brand-highlight/80 hover:bg-brand-highlight/10 px-2 py-1 rounded-lg flex items-center gap-1 cursor-pointer transition-all border border-brand-highlight/30"
                            title="Marcar todas como lidas e abrir o envelope"
                          >
                            <CheckCheck className="w-3.5 h-3.5" />
                            <span>Marcar lidas</span>
                          </button>
                        )}
                        <button
                          onClick={() => setShowNotifications(false)}
                          className="p-1 text-brand-muted hover:text-brand-primary hover:bg-surface-subtle rounded-lg transition-colors cursor-pointer"
                          title="Fechar notificações"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Lista do Histórico */}
                    <div className="max-h-80 overflow-y-auto divide-y divide-surface-border/50 no-scrollbar">
                      {notifications.length === 0 ? (
                        <div className="p-8 text-center text-brand-muted">
                          <MailOpen className="w-8 h-8 opacity-35 mx-auto mb-2 text-brand-muted" />
                          <p className="text-xs font-semibold">Caixa de entrada limpa!</p>
                          <p className="text-[10px]">Nenhuma nova notificação pendente.</p>
                        </div>
                      ) : (
                        notifications.map(item => (
                          <div
                            key={item.id}
                            onClick={() => handleNotificationClick(item)}
                            className={`p-3.5 hover:bg-surface-subtle transition-colors cursor-pointer flex items-start gap-3 ${
                              item.read ? 'opacity-65' : 'bg-brand-highlight/[0.04]'
                            }`}
                          >
                            <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5 shadow-xs ${item.iconBg}`}>
                              {item.icon}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-1.5">
                                <p className="text-xs font-bold text-brand-primary truncate">{item.title}</p>
                                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-brand-muted whitespace-nowrap bg-surface-subtle px-1.5 py-0.5 rounded-md border border-surface-border/40">
                                  <Clock className="w-2.5 h-2.5 opacity-70" />
                                  {item.time}
                                </span>
                              </div>
                              <p className="text-[11px] text-brand-muted line-clamp-2 mt-0.5 leading-snug">{item.message}</p>
                            </div>
                            {!item.read && (
                              <div className="w-2 h-2 rounded-full bg-brand-highlight flex-shrink-0 mt-2 shadow-xs animate-pulse" />
                            )}
                          </div>
                        ))
                      )}
                    </div>

                    {/* Rodapé com status do envelope */}
                    <div className="p-2.5 border-t border-surface-border bg-surface-subtle/20 flex items-center justify-between text-[10px] text-brand-muted">
                      <span>{notifications.length} evento(s) no histórico</span>
                      {unreadNotificationsCount === 0 && (
                        <span className="inline-flex items-center gap-1 text-functional-success font-bold">
                          <CheckCheck className="w-3 h-3" /> Em dia
                        </span>
                      )}
                    </div>
                  </m.div>
                )}
              </AnimatePresence>
            </div>

            {/* Perfil do Usuário com Menu Dropdown Completo */}
            <div className="relative">
              <button
                onClick={() => setShowTeamList(!showTeamList)}
                className="profile-toggle-btn flex items-center gap-2.5 p-1.5 pr-3 rounded-xl border border-surface-border/60 hover:bg-surface-subtle transition-all cursor-pointer shadow-xs group"
                title="Meu Perfil"
              >
                <div className="w-8 h-8 rounded-lg bg-brand-highlight/10 text-brand-highlight flex items-center justify-center font-bold text-xs flex-shrink-0 relative">
                  {userData?.name ? userData.name.substring(0, 2).toUpperCase() : <UserIcon className="w-4 h-4" />}
                  <div className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-surface-bg ${isSystemOnline ? 'bg-success' : 'bg-error'}`} />
                </div>
                <div className="hidden sm:flex flex-col text-left min-w-0 max-w-[140px]">
                  <p className="text-xs font-bold text-brand-primary truncate leading-tight">{userData?.name}</p>
                  <p className="text-[10px] font-medium text-brand-muted uppercase tracking-wider truncate leading-tight mt-0.5">
                    {userData ? ROLE_LABELS[userData.role as UserRole] : ''}
                  </p>
                </div>
                <ChevronDown className={`w-3.5 h-3.5 text-brand-muted transition-transform duration-200 ${showTeamList ? 'rotate-180' : ''}`} />
              </button>

              <AnimatePresence>
                {showTeamList && (
                  <m.div
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    transition={{ duration: 0.15 }}
                    className="absolute right-0 top-full mt-2 w-64 bg-surface-card border border-surface-border rounded-2xl shadow-premium z-50 text-brand-primary interactive-sidebar-popover overflow-hidden"
                  >
                    <div className="p-3 border-b border-surface-border bg-surface-subtle/30">
                      <p className="text-xs font-bold text-brand-primary truncate">{userData?.name}</p>
                      <p className="text-[10px] text-brand-muted truncate">{userData?.email}</p>
                      <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                        <span className="px-1.5 py-0.5 rounded-md bg-brand-highlight/10 text-brand-highlight text-[9px] font-bold uppercase tracking-wider">
                          {userData ? ROLE_LABELS[userData.role as UserRole] : ''}
                        </span>
                        {userTeams.length > 0 && (
                          <span className="text-[10px] text-brand-muted truncate max-w-[160px]" title={teamNames}>
                            • {userTeams[0].name} {userTeams.length > 1 ? `(+${userTeams.length - 1})` : ''}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="p-2 space-y-0.5">
                      <div>
                        <button
                          onClick={() => setSidebarAccordion(sidebarAccordion === 'teams' ? null : 'teams')}
                          className="w-full flex items-center justify-between gap-2 py-2 px-2 rounded-xl hover:bg-surface-subtle transition-colors cursor-pointer group"
                        >
                          <div className="flex items-center gap-2">
                            <Users className="w-4 h-4 text-brand-accent" />
                            <span className="text-[11px] font-bold">Minhas Equipes</span>
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
                          onClick={() => setSidebarAccordion(sidebarAccordion === 'appearance' ? null : 'appearance')}
                          className="w-full flex items-center justify-between gap-2 py-2 px-2 rounded-xl hover:bg-surface-subtle transition-colors cursor-pointer group"
                        >
                          <div className="flex items-center gap-2">
                            {theme === 'dark' ? <Moon className="w-4 h-4 text-brand-accent" /> : theme === 'light' ? <Sun className="w-4 h-4 text-brand-accent" /> : <Monitor className="w-4 h-4 text-brand-accent" />}
                            <span className="text-[11px] font-bold">Aparência</span>
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

                      <div className="border-t border-surface-border pt-1 mt-1">
                        <button
                          onClick={() => { setShowTeamList(false); handleLogout(); }}
                          className="w-full flex items-center gap-2 py-2 px-2 rounded-xl hover:bg-red-50 dark:hover:bg-red-950/20 text-red-500 hover:text-red-600 dark:hover:text-red-400 transition-colors cursor-pointer"
                        >
                          <LogOut className="w-4 h-4" />
                          <span className="text-[11px] font-bold">Sair da Conta</span>
                        </button>
                      </div>
                    </div>
                  </m.div>
                )}
              </AnimatePresence>
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
            {activeTab === 'filas' && (
              <div className="animate-fade-in">
                <AuditingQueueView
                  agents={users.filter(u => u.role === 'suporte' && u.active !== false)}
                  teams={teams}
                  forms={forms}
                  monitorias={monitorias}
                  currentUserId={userData?.id}
                  onStartAudit={handleStartAuditFromQueue}
                  onModalStateChange={setIsQueueModalOpen}
                />
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

function AnimatedDashboardIcon({ isHovered, active, className }: { isHovered?: boolean; active?: boolean; className?: string }) {
  const isTriggered = !!(isHovered || active);
  return (
    <m.svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className || "w-5 h-5"}
      animate={{ scale: isTriggered ? 1.08 : 1 }}
      transition={{ type: "spring", stiffness: 400, damping: 20 }}
    >
      {/* Top-left: grande */}
      <m.rect
        x="3" y="3" width="7" height="9" rx="1"
        animate={{ width: isTriggered ? 8 : 7, height: isTriggered ? 10 : 9 }}
        transition={{ type: "spring", stiffness: 380, damping: 22 }}
      />
      {/* Top-right: pequeno */}
      <m.rect
        x="14" y="3" width="7" height="5" rx="1"
        animate={{ width: isTriggered ? 8 : 7, height: isTriggered ? 4 : 5 }}
        transition={{ type: "spring", stiffness: 380, damping: 22 }}
      />
      {/* Bottom-right: grande */}
      <m.rect
        x="14" y="12" width="7" height="9" rx="1"
        animate={{ width: isTriggered ? 8 : 7, height: isTriggered ? 10 : 9 }}
        transition={{ type: "spring", stiffness: 380, damping: 22 }}
      />
      {/* Bottom-left: pequeno */}
      <m.rect
        x="3" y="16" width="7" height="5" rx="1"
        animate={{ width: isTriggered ? 8 : 7, height: isTriggered ? 4 : 5 }}
        transition={{ type: "spring", stiffness: 380, damping: 22 }}
      />
    </m.svg>
  );
}

function AnimatedMonitoriasIcon({ isHovered, active, className }: { isHovered?: boolean; active?: boolean; className?: string }) {
  const isTriggered = !!(isHovered || active);
  return (
    <m.svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className || "w-5 h-5"}
      animate={{ scale: isTriggered ? [1, 1.08, 1] : 1 }}
      transition={{ duration: 0.3 }}
    >
      <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <m.path
        d="m9 14 2 2 4-4"
        animate={isTriggered ? { pathLength: [0, 1], opacity: [0.4, 1] } : { pathLength: 1, opacity: 1 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
      />
    </m.svg>
  );
}

function AnimatedLayersIcon({ isHovered, active, className }: { isHovered?: boolean; active?: boolean; className?: string }) {
  const isTriggered = !!(isHovered || active);
  return (
    <m.svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`overflow-visible ${className || "w-5 h-5"}`}
      style={{ overflow: 'visible' }}
    >
      <g transform="translate(0, 1) scale(0.92) translate(1, 0)">
        <m.path
          d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"
          animate={{ y: isTriggered ? -2 : 0 }}
          transition={{ type: "spring", stiffness: 350, damping: 20 }}
        />
        <path d="M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12" />
        <m.path
          d="M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17"
          animate={{ y: isTriggered ? 2 : 0 }}
          transition={{ type: "spring", stiffness: 350, damping: 20 }}
        />
      </g>
    </m.svg>
  );
}

function AnimatedSettingsIcon({ isHovered, active, className }: { isHovered?: boolean; active?: boolean; className?: string }) {
  const isTriggered = !!(isHovered || active);
  return (
    <m.svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className || "w-5 h-5"}
      animate={{ rotate: isTriggered ? 90 : 0 }}
      transition={{ type: "spring", stiffness: 220, damping: 18 }}
    >
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </m.svg>
  );
}

function NavItem({ icon: IconComponent, label, active, onClick, isOpen, isDark, badge }: any) {
  const [isHovered, setIsHovered] = React.useState(false);

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`
        w-full flex items-center gap-3 px-4 h-11 rounded-xl transition-all font-bold group relative
        ${active
          ? (isDark ? 'bg-white/10 text-white' : 'bg-black/10 text-black font-extrabold')
          : (isDark ? 'text-white/40 hover:text-white hover:bg-white/5' : 'text-slate-800 hover:text-black hover:bg-black/5 font-bold')}
      `}
    >
      {active && (
        <m.div
          layoutId="active-bar"
          className={`absolute left-0 w-1 h-6 rounded-full ${isDark ? 'bg-white' : 'bg-black'}`}
        />
      )}
      <div className={`${active ? 'text-current' : (isDark ? 'text-white/30 group-hover:text-white' : 'text-slate-700 group-hover:text-black')}`}>
        {typeof IconComponent === 'function' ? (
          <IconComponent isHovered={isHovered} active={active} className="w-5 h-5" />
        ) : React.isValidElement(IconComponent) ? (
          React.cloneElement(IconComponent as React.ReactElement<any>, { isHovered, active })
        ) : (
          IconComponent
        )}
      </div>
      <div className={`flex-1 flex items-center justify-between overflow-hidden transition-all duration-300 ${isOpen ? 'opacity-100 max-w-full' : 'opacity-0 max-w-0'}`}>
        <span className="text-sm tracking-tight whitespace-nowrap block pl-1">
          {label}
        </span>
        {badge && (
          <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border border-dashed ml-2 leading-none whitespace-nowrap ${isDark ? 'border-white/10 text-white/40 bg-white/5' : 'border-slate-300/60 text-slate-800 bg-slate-100'}`}>
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
          ? (isDark ? 'bg-white/5 text-white font-bold' : 'bg-black/5 text-black font-bold')
          : (isDark ? 'text-white/40 hover:text-white hover:bg-white/5' : 'text-slate-800 hover:text-black hover:bg-black/5 font-semibold')}
      `}
    >
      {active && (
        <div
          className={`absolute left-5 w-1 h-4 rounded-full ${isDark ? 'bg-white' : 'bg-black'}`}
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


