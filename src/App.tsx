/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { supabase, mockDb } from './lib/supabase';
import { Layout, LayoutDashboard as DashboardIcon, ClipboardCheck, Settings, LogOut, ChevronRight, Search, Plus, User as UserIcon, Clock } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Toaster, toast } from 'sonner';
import { User } from './types';

// Components
import DashboardMain from './components/dashboard/DashboardMain';
import MonitoriaList from './components/MonitoriaList';
import MonitoriaForm from './components/MonitoriaForm';
import AdminPanel from './components/AdminPanel';

export default function App() {
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [userData, setUserData] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'monitorias' | 'admin'>('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [authView, setAuthView] = useState<'login' | 'request-access' | 'pending' | 'change-password' | 'forgot-password' | 'setup-password'>('login');
  const [credentials, setCredentials] = useState({ email: '', password: '' });
  const [requestData, setRequestData] = useState({ name: '', email: '' });
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resetEmail, setResetEmail] = useState('');
  const [resetToken, setResetToken] = useState<string | null>(null);
  const [isExistingRequest, setIsExistingRequest] = useState(false);

  const isMockMode = !supabase;

  // ... (keep existing effects and handlers)

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const tempPassword = Math.random().toString(36).substr(2, 6);
      if (isMockMode) {
        const { data: users } = await mockDb.get('users');
        const user = users.find((u: any) => u.email.toLowerCase() === resetEmail.toLowerCase());
        if (user) {
          await mockDb.update('users', user.id, { password: tempPassword, must_change_password: true });
          console.log(`[SIMULAÇÃO E-MAIL] Para: ${resetEmail} - Reset de Senha - Nova Senha: ${tempPassword}`);
          toast.success('Senha provisória enviada para seu e-mail!');
          setAuthView('login');
        } else {
          toast.error('E-mail não cadastrado.');
        }
      } else {
        const { data: user } = await supabase!.from('users').select('*').eq('email', resetEmail.toLowerCase()).single();
        if (user) {
          // Gerar token real
          const token = Math.random().toString(36).substr(2, 10);
          await supabase!.from('users').update({ reset_token: token }).eq('id', user.id);
          
          // Chama a Edge Function
          const { data, error: funcError } = await supabase.functions.invoke('send-email', {
            body: { email: user.email, name: user.name, type: 'reset', token }
          });

          if (funcError) throw new Error('Falha ao enviar e-mail de recuperação.');

          toast.success('E-mail enviado! Verifique sua caixa de entrada.', {
            duration: 5000,
          });
          setAuthView('login');
        } else {
          toast.error('E-mail não cadastrado.');
        }
      }
    } catch (e: any) {
      toast.error(e.message || 'Erro ao processar solicitação.');
    } finally {
      setLoading(false);
    }
  };

  const handleSetupPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 6) return toast.error('A senha deve ter pelo menos 6 caracteres.');
    if (newPassword !== confirmPassword) return toast.error('As senhas não coincidem.');
    
    setLoading(true);
    try {
      if (!isMockMode && supabase && resetToken) {
        // Busca o usuário pelo token
        const { data: user, error: findError } = await supabase.from('users').select('*').eq('reset_token', resetToken).single();
        
        if (findError || !user) {
          toast.error('Link inválido ou expirado.');
          return;
        }

        // Atualiza a senha e limpa o token
        const { error: updateError } = await supabase.from('users').update({ 
          password: newPassword, 
          must_change_password: false,
          reset_token: null 
        }).eq('id', user.id);

        if (updateError) throw updateError;

        toast.success('Senha definida com sucesso! Você já pode entrar.');
        
        // Limpa tudo e volta pro login
        setResetToken(null);
        setNewPassword('');
        setConfirmPassword('');
        setAuthView('login');
        
        // Remove o token da URL para não entrar em loop
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    } catch (e: any) {
      console.error(e);
      toast.error('Erro ao definir senha: ' + (e.message || 'Erro desconhecido'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Checar se há um token na URL
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');
    
    if (token) {
      setResetToken(token);
      setAuthView('setup-password');
      setLoading(false);
      return;
    }

    const checkSession = async () => {
      if (isMockMode) {
        const savedUser = localStorage.getItem('qualitrack_mock_user');
        if (savedUser) {
          const user = JSON.parse(savedUser);
          setCurrentUser(user);
          setUserData(user);
        }
        setLoading(false);
      } else {
        const { data: { session } } = await supabase!.auth.getSession();
        if (session) {
          await handleUserSession(session.user);
        } else {
          setLoading(false);
        }
      }
    };
    checkSession();
  }, []);

  const handleUserSession = async (user: any) => {
    try {
      if (isMockMode) {
        const { data } = await mockDb.get('users');
        const dbUser = data.find((u: any) => u.email === user.email && u.active);
        if (dbUser) {
          if (dbUser.must_change_password) {
            setAuthView('change-password');
            setUserData(dbUser);
          } else {
            setUserData(dbUser);
            setCurrentUser(user);
            localStorage.setItem('qualitrack_mock_user', JSON.stringify(dbUser));
          }
        } else {
          setAuthView('login');
        }
      } else {
        const { data, error } = await supabase!.from('users').select('*').eq('email', user.email).single();
        if (data && data.active) {
          if (data.must_change_password) {
            setAuthView('change-password');
            setUserData(data);
          } else {
            setUserData(data);
            setCurrentUser(user);
          }
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
          if (user.must_change_password) {
            setUserData(user);
            setAuthView('change-password');
            return;
          }
          setCurrentUser(user);
          setUserData(user);
          setActiveTab('dashboard');
          localStorage.setItem('qualitrack_mock_user', JSON.stringify(user));
          toast.success(`Bem-vindo, ${user.name}!`);
        } else {
          toast.error('E-mail ou senha incorretos.');
        }
      } else {
        // Login direto na tabela customizada do Supabase
        const { data: user, error } = await supabase!
          .from('users')
          .select('*')
          .eq('email', emailLower)
          .eq('password', credentials.password)
          .single();

        if (error || !user) {
          toast.error('E-mail ou senha incorretos.');
          return;
        }

        if (!user.active) return toast.error('Esta conta está desativada.');
        
        if (user.must_change_password) {
          setUserData(user);
          setAuthView('change-password');
          return;
        }

        setCurrentUser(user);
        setUserData(user);
        setActiveTab('dashboard');
        toast.success(`Bem-vindo, ${user.name}!`);
      }
    } catch (e: any) {
      toast.error(e.message || 'Erro ao realizar login.');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 6) return toast.error('A senha deve ter pelo menos 6 caracteres.');
    setLoading(true);
    try {
      if (isMockMode) {
        await mockDb.update('users', userData!.id, { password: newPassword, must_change_password: false });
        const updatedUser = { ...userData!, password: newPassword, must_change_password: false };
        setUserData(updatedUser);
        setCurrentUser(updatedUser);
        localStorage.setItem('qualitrack_mock_user', JSON.stringify(updatedUser));
      } else {
        await supabase!.from('users').update({ password: newPassword, must_change_password: false }).eq('id', userData!.id);
        const { data: updated } = await supabase!.from('users').select('*').eq('id', userData!.id).single();
        setUserData(updated);
        setCurrentUser(updated);
      }
      toast.success('Senha atualizada com sucesso!');
    } catch (e) {
      toast.error('Erro ao atualizar senha.');
    } finally {
      setLoading(false);
    }
  };

  const handleRequestAccess = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    if (!requestData.email || !requestData.name) return;
    setLoading(true);
    try {
      const emailLower = requestData.email.toLowerCase();
      
      if (!isMockMode && supabase) {
        // 1. Verificar se já é um usuário ATIVO (ignora desativados)
        const { data: existingUsers } = await supabase
          .from('users')
          .select('id')
          .eq('email', emailLower)
          .eq('active', true);

        if (existingUsers && existingUsers.length > 0) {
          toast.info('Este e-mail já possui um cadastro ativo.');
          setAuthView('login');
          return;
        }

        // 2. Verificar se já tem uma solicitação pendente
        const { data: existingReqs } = await supabase
          .from('access_requests')
          .select('id')
          .eq('email', emailLower)
          .eq('status', 'pending');

        if (existingReqs && existingReqs.length > 0) {
          setIsExistingRequest(true);
          setAuthView('pending');
          return;
        }

        const { error } = await supabase.from('access_requests').insert([
          { name: requestData.name, email: emailLower, status: 'pending' }
        ]);
        if (error) throw error;
        setIsExistingRequest(false);
      }
      toast.success('Solicitação enviada com sucesso!');
      setAuthView('pending');
    } catch (e: any) {
      toast.error('Erro ao enviar solicitação.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      if (!isMockMode && supabase) {
        await supabase.auth.signOut();
      }
      localStorage.removeItem('qualitrack_mock_user');
      setCurrentUser(null);
      setUserData(null);
      setAuthView('login');
      toast.success('Sessão encerrada.');
    } catch (e) {
      console.error(e);
      // Fallback: Force logout anyway
      setCurrentUser(null);
      setUserData(null);
      setAuthView('login');
    }
  };

  const renderContent = () => {
    if (loading) {
      return (
        <div className="h-screen w-screen flex items-center justify-center bg-[#F9F9F6]">
          <motion.div 
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
            className="w-12 h-12 border-4 border-[#2D3A3A] border-t-transparent rounded-full"
          />
        </div>
      );
    }

    if (!currentUser) {
      return (
        <div className="h-screen w-screen flex flex-col items-center justify-center bg-[#F9F9F6] p-6 text-[#3D4035]">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-md w-full text-center space-y-8"
          >
          <div className="space-y-4">
            <h1 className="text-5xl font-bold tracking-tight text-[#2D3A3A]">QualiTrack</h1>
            <p className="text-[#7A7D71] text-lg">Auditoria de Qualidade Inteligente</p>
          </div>

          <div className="bg-white p-8 rounded-[40px] border border-[#E2E4D8] shadow-sm min-h-[400px] flex flex-col justify-center">
            <AnimatePresence mode="wait">
              {authView === 'login' && (
                <motion.div key="login" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="space-y-6">
                  <div className="text-left space-y-4">
                    <h3 className="text-xl font-bold text-[#2D3A3A] text-center mb-6">Acesse sua Conta</h3>
                    <form onSubmit={handleLogin} className="space-y-4">
                      <div>
                        <label className="block text-xs font-semibold tracking-wide text-[#7A7D71] uppercase mb-2">E-mail corporativo</label>
                        <input 
                          type="email" 
                          required
                          className="w-full bg-[#F9F9F6] border border-[#E2E4D8] rounded-2xl py-3 px-4 text-sm focus:border-[#A7C0A5] focus:outline-none"
                          value={credentials.email}
                          onChange={e => setCredentials({...credentials, email: e.target.value})}
                          placeholder="seu@email.com"
                        />
                      </div>
                      <div>
                        <div className="flex justify-between mb-2">
                          <label className="block text-xs font-semibold tracking-wide text-[#7A7D71] uppercase mb-2">Senha</label>
                          <button type="button" onClick={() => setAuthView('forgot-password')} className="text-[10px] font-bold text-[#A7C0A5] hover:text-[#2D3A3A] transition-colors">Esqueci minha senha</button>
                        </div>
                        <input 
                          type="password" 
                          required
                          className="w-full bg-[#F9F9F6] border border-[#E2E4D8] rounded-2xl py-3 px-4 text-sm focus:border-[#A7C0A5] focus:outline-none"
                          value={credentials.password}
                          onChange={e => setCredentials({...credentials, password: e.target.value})}
                          placeholder="••••••••"
                        />
                      </div>
                      <button className="w-full bg-[#2D3A3A] text-white py-4 rounded-2xl font-bold shadow-lg shadow-[#2D3A3A]/20 hover:bg-opacity-90 transition-all">
                        Entrar na Plataforma
                      </button>
                    </form>
                    <div className="pt-4 text-center">
                      <button 
                        onClick={() => setAuthView('request-access')}
                        className="text-sm font-bold text-[#A7C0A5] hover:text-[#2D3A3A] transition-colors"
                      >
                        Não tem acesso? Solicite aqui
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}

              {authView === 'request-access' && (
                <motion.div key="request" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="space-y-6 text-left">
                  <div className="text-center mb-6">
                    <h3 className="text-xl font-bold text-[#2D3A3A]">Solicitar Novo Acesso</h3>
                    <p className="text-sm text-[#7A7D71]">Preencha os dados abaixo para análise.</p>
                  </div>
                  <form onSubmit={handleRequestAccess} className="space-y-4">
                    <div>
                      <label className="block text-xs font-semibold tracking-wide text-[#7A7D71] uppercase mb-2">Nome completo</label>
                      <input 
                        type="text" 
                        required
                        className="w-full bg-[#F9F9F6] border border-[#E2E4D8] rounded-2xl py-3 px-4 text-sm focus:border-[#A7C0A5] focus:outline-none"
                        value={requestData.name}
                        onChange={e => setRequestData({...requestData, name: e.target.value})}
                        placeholder="Ex: João Silva"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold tracking-wide text-[#7A7D71] uppercase mb-2">E-mail corporativo</label>
                      <input 
                        type="email" 
                        required
                        className="w-full bg-[#F9F9F6] border border-[#E2E4D8] rounded-2xl py-3 px-4 text-sm focus:border-[#A7C0A5] focus:outline-none"
                        value={requestData.email}
                        onChange={e => setRequestData({...requestData, email: e.target.value})}
                        placeholder="seu@email.com"
                      />
                    </div>
                    <button className="w-full bg-[#2D3A3A] text-white py-4 rounded-2xl font-bold shadow-lg shadow-[#2D3A3A]/20 hover:bg-opacity-90 transition-all">
                      Enviar para Análise
                    </button>
                    <button type="button" onClick={() => setAuthView('login')} className="w-full text-sm font-bold text-[#7A7D71] hover:text-[#2D3A3A] transition-colors">
                      Voltar para Login
                    </button>
                  </form>
                </motion.div>
              )}

              {authView === 'pending' && (
                <motion.div key="pending" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="space-y-6 py-4">
                  <div className="w-16 h-16 bg-[#F0F1E8] rounded-full flex items-center justify-center mx-auto mb-4">
                    {isExistingRequest ? (
                       <Clock className="w-8 h-8 text-orange-400" />
                    ) : (
                       <Settings className="w-8 h-8 text-[#A7C0A5] animate-spin" />
                    )}
                  </div>
                  <h3 className="text-xl font-bold text-[#2D3A3A]">
                    {isExistingRequest ? 'Solicitação em Análise' : 'Solicitação Enviada'}
                  </h3>
                  <p className="text-sm text-[#7A7D71]">
                    {isExistingRequest 
                      ? 'Identificamos que você já possui uma solicitação pendente para este e-mail. Por favor, aguarde a aprovação do administrador.'
                      : 'Sua solicitação foi enviada para o administrador. Você receberá um e-mail assim que for aprovado.'
                    }
                  </p>
                  <button onClick={() => setAuthView('login')} className="w-full bg-[#2D3A3A] text-white py-4 rounded-2xl font-bold shadow-lg shadow-[#2D3A3A]/20 hover:bg-opacity-90 transition-all">
                    Voltar para o Início
                  </button>
                </motion.div>
              )}

              {authView === 'change-password' && (
                <motion.div key="change" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="space-y-6 text-left">
                  <div className="text-center mb-6">
                    <h3 className="text-xl font-bold text-[#2D3A3A]">Defina sua nova senha</h3>
                    <p className="text-sm text-[#7A7D71]">Para sua segurança, crie uma senha de acesso exclusiva.</p>
                  </div>
                  <form onSubmit={handleUpdatePassword} className="space-y-4">
                    <div>
                      <label className="block text-xs font-semibold tracking-wide text-[#7A7D71] uppercase mb-2">Nova senha</label>
                      <input 
                        type="password" 
                        required
                        className="w-full bg-[#F9F9F6] border border-[#E2E4D8] rounded-2xl py-3 px-4 text-sm focus:border-[#A7C0A5] focus:outline-none"
                        value={newPassword}
                        onChange={e => setNewPassword(e.target.value)}
                        placeholder="Mínimo 6 caracteres"
                      />
                    </div>
                    <button className="w-full bg-[#2D3A3A] text-white py-4 rounded-2xl font-bold shadow-lg shadow-[#2D3A3A]/20 hover:bg-opacity-90 transition-all">
                      Definir Nova Senha e Entrar
                    </button>
                  </form>
                </motion.div>
              )}
              {authView === 'setup-password' && (
                <motion.div key="setup" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="space-y-6 text-left">
                  <div className="text-center mb-6">
                    <h3 className="text-xl font-bold text-[#2D3A3A]">Definir Nova Senha</h3>
                    <p className="text-sm text-[#7A7D71]">Escolha uma senha forte para sua conta.</p>
                  </div>
                  <form onSubmit={handleSetupPassword} className="space-y-4">
                    <div>
                      <label className="block text-xs font-semibold tracking-wide text-[#7A7D71] uppercase mb-2">Nova senha</label>
                      <input 
                        type="password" 
                        required
                        className="w-full bg-[#F9F9F6] border border-[#E2E4D8] rounded-2xl py-3 px-4 text-sm focus:border-[#A7C0A5] focus:outline-none"
                        value={newPassword}
                        onChange={e => setNewPassword(e.target.value)}
                        placeholder="Mínimo 6 caracteres"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold tracking-wide text-[#7A7D71] uppercase mb-2">Confirmar senha</label>
                      <input 
                        type="password" 
                        required
                        className="w-full bg-[#F9F9F6] border border-[#E2E4D8] rounded-2xl py-3 px-4 text-sm focus:border-[#A7C0A5] focus:outline-none"
                        value={confirmPassword}
                        onChange={e => setConfirmPassword(e.target.value)}
                        placeholder="Repita sua nova senha"
                      />
                    </div>
                    <button className="w-full bg-[#2D3A3A] text-white py-4 rounded-2xl font-bold shadow-lg shadow-[#2D3A3A]/20 hover:bg-opacity-90 transition-all">
                      Confirmar e Entrar
                    </button>
                  </form>
                </motion.div>
              )}
              {authView === 'forgot-password' && (
                <motion.div key="forgot" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="space-y-6 text-left">
                  <div className="text-center mb-6">
                    <h3 className="text-xl font-bold text-[#2D3A3A]">Recuperar Senha</h3>
                    <p className="text-sm text-[#7A7D71]">Informe seu e-mail cadastrado para receber um link de redefinição.</p>
                  </div>
                  <form onSubmit={handleForgotPassword} className="space-y-4">
                    <div>
                      <label className="block text-xs font-semibold tracking-wide text-[#7A7D71] uppercase mb-2">E-mail cadastrado</label>
                      <input 
                        type="email" 
                        required
                        className="w-full bg-[#F9F9F6] border border-[#E2E4D8] rounded-2xl py-3 px-4 text-sm focus:border-[#A7C0A5] focus:outline-none"
                        value={resetEmail}
                        onChange={e => setResetEmail(e.target.value)}
                        placeholder="seu@email.com"
                      />
                    </div>
                    <div className="flex flex-col gap-3">
                      <button className="w-full bg-[#2D3A3A] text-white py-4 rounded-2xl font-bold shadow-lg shadow-[#2D3A3A]/20 hover:bg-opacity-90 transition-all">
                        Enviar Link de Recuperação
                      </button>
                      <button type="button" onClick={() => setAuthView('login')} className="w-full py-4 rounded-2xl font-bold text-[#7A7D71] hover:bg-[#F9F9F6] transition-all">
                        Voltar para Login
                      </button>
                    </div>
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
        />
      ) : (
        renderContent()
      )}
    </>
  );
}

function MainApp({ isSidebarOpen, setIsSidebarOpen, currentUser, activeTab, setActiveTab, userData, handleLogout, isFormOpen, setIsFormOpen }: any) {
  const [teams, setTeams] = React.useState<any[]>([]);

  React.useEffect(() => {
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

  return (
    <div className="h-screen w-screen flex bg-[#F9F9F6] text-[#3D4035] font-sans selection:bg-[#A7C0A5] selection:text-[#2D3A3A] overflow-hidden">
      {/* Global Monitoria Form Overlay — renders above everything */}
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
        animate={{ width: isSidebarOpen ? 256 : 80 }}
        className="bg-[#2D3A3A] text-white flex flex-col relative z-20 transition-all"
      >
        <div className="p-6 flex items-center justify-between overflow-hidden">
          <AnimatePresence mode="wait">
            {isSidebarOpen && (
              <motion.div 
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                className="flex items-center gap-3 whitespace-nowrap"
              >
                <div className="w-8 h-8 bg-[#A7C0A5] rounded-xl flex items-center justify-center flex-shrink-0">
                  <div className="w-4 h-4 border-[1.5px] border-white rounded-[2px]" />
                </div>
                <h2 className="font-bold text-lg tracking-tight">QualiTrack</h2>
              </motion.div>
            )}
          </AnimatePresence>
          <button 
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="p-1 hover:bg-white/10 rounded-lg transition-colors ml-auto flex-shrink-0 text-[#A7C0A5]"
          >
            <Layout className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 px-4 space-y-2 mt-4">
          <NavItem 
            icon={<DashboardIcon className="w-5 h-5" />} 
            label="Dashboard" 
            active={activeTab === 'dashboard'} 
            onClick={() => setActiveTab('dashboard')}
            isOpen={isSidebarOpen}
          />
          <NavItem 
            icon={<ClipboardCheck className="w-5 h-5" />} 
            label="Monitorias" 
            active={activeTab === 'monitorias'} 
            onClick={() => setActiveTab('monitorias')}
            isOpen={isSidebarOpen}
          />
          {userData?.role === 'admin' && (
            <NavItem 
              icon={<Settings className="w-5 h-5" />} 
              label="Configurações" 
              active={activeTab === 'admin'} 
              onClick={() => setActiveTab('admin')}
              isOpen={isSidebarOpen}
            />
          )}
        </nav>

        <div className="p-4 mt-auto">
          <div className="flex items-center gap-3 p-3 bg-white/5 rounded-2xl border border-white/5">
            {currentUser.photoURL ? (
              <img src={currentUser.photoURL} className="w-8 h-8 rounded-full border border-white/20" alt="" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-[#A7C0A5] flex items-center justify-center text-[#2D3A3A]">
                <UserIcon className="w-4 h-4" />
              </div>
            )}
            {isSidebarOpen && (
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold truncate text-white">{userData?.name}</p>
                <p className="text-[10px] font-semibold tracking-widest text-[#A7C0A5] uppercase opacity-80">{({'admin':'Administrador','qualidade':'Auditor','gestor_qualidade':'Gest. Qualidade','gestor_suporte':'Gest. Suporte','suporte':'Agente'} as any)[userData?.role] || userData?.role}</p>
                {teamNames && (
                  <p className="text-[9px] font-medium truncate text-white/40 mt-0.5">{teamNames}</p>
                )}
              </div>
            )}
            <button 
              onClick={handleLogout}
              className={`p-2 hover:bg-white/10 rounded-xl transition-colors text-[#A7C0A5] ${!isSidebarOpen && 'mx-auto'}`}
              title="Sair do sistema"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </motion.aside>

      <main className="flex-1 flex flex-col relative">
        <header className="flex-shrink-0 px-8 py-6 flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold text-[#2D3A3A]">
              {activeTab === 'dashboard' ? 'Visão Geral da Qualidade' : activeTab === 'monitorias' ? 'Auditoria e Avaliações' : 'Configurações'}
            </h2>
            <p className="text-[#7A7D71] text-sm mt-1">Conectado como {userData?.name}</p>
          </div>
          <div className="flex items-center gap-4">
            {(activeTab === 'monitorias' || activeTab === 'dashboard') && ['gestor_qualidade', 'qualidade'].includes(userData?.role || '') && (
              <button 
                onClick={() => setIsFormOpen(true)}
                className="bg-[#2D3A3A] text-white px-6 py-2 rounded-2xl text-sm font-bold shadow-lg shadow-[#2D3A3A]/20 hover:bg-opacity-90 transition-all flex items-center gap-2"
              >
                <Plus className="w-4 h-4" /> Nova Monitoria
              </button>
            )}
          </div>
        </header>

        <div className="flex-1 overflow-auto p-8 pt-2">
          <AnimatePresence mode="wait">
            <>
              {activeTab === 'dashboard' && (
                <motion.div key="dashboard" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                  <DashboardMain user={userData} />
                </motion.div>
              )}
              {activeTab === 'monitorias' && (
                <motion.div key="monitorias" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                  <MonitoriaList user={userData} onNew={() => setIsFormOpen(true)} />
                </motion.div>
              )}
              {activeTab === 'admin' && (
                <motion.div key="admin" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                  <AdminPanel user={userData} />
                </motion.div>
              )}
            </>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}

function NavItem({ icon, label, active, onClick, isOpen }: { icon: React.ReactNode, label: string, active: boolean, onClick: () => void, isOpen: boolean }) {
  return (
    <button 
      onClick={onClick}
      className={`
        w-full flex items-center gap-3 px-4 py-3 rounded-2xl transition-colors font-semibold
        ${active ? 'bg-[#A7C0A5] text-[#2D3A3A]' : 'text-white hover:bg-white/5'}
      `}
    >
      <div className={`flex-shrink-0 ${active ? 'text-[#2D3A3A]' : 'text-[#A7C0A5]'}`}>{icon}</div>
      {isOpen && <span className="text-sm">{label}</span>}
      {active && isOpen && <ChevronRight className="w-4 h-4 ml-auto opacity-50" />}
    </button>
  );
}

