/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { auth, db } from './lib/firebase';
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut, User as FirebaseUser } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { Layout, LayoutDashboard as DashboardIcon, ClipboardCheck, Settings, LogOut, ChevronRight, Search, Plus, Filter, BarChart3, Users } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Toaster, toast } from 'sonner';
import { User, UserRole } from './types';

// Components (defined later or in separate files)
import Dashboard from './components/Dashboard';
import MonitoriaList from './components/MonitoriaList';
import MonitoriaForm from './components/MonitoriaForm';
import AdminPanel from './components/AdminPanel';

export default function App() {
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [userData, setUserData] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'monitorias' | 'admin'>('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user && user.email) {
        try {
          const userDoc = await getDoc(doc(db, 'users', user.email));
          if (userDoc.exists()) {
            setUserData({ id: user.email, ...userDoc.data() } as User);
          } else {
            // Check if is bootstrapped admin
            if (user.email === 'marcospaulo@webposto.com.br') {
              const { setDoc } = await import('firebase/firestore');
              const newAdminData = {
                name: user.displayName || 'Marcos Paulo',
                email: user.email,
                role: 'admin',
                active: true,
                createdAt: new Date().toISOString()
              };
              await setDoc(doc(db, 'users', user.email), newAdminData);
              setUserData({ id: user.email, ...newAdminData } as User);
            } else {
              const requestDocRef = doc(db, 'accessRequests', user.email);
              try {
                const requestDoc = await getDoc(requestDocRef);
                if (!requestDoc.exists()) {
                  await setDoc(requestDocRef, {
                    name: user.displayName || 'Usuário',
                    email: user.email,
                    status: 'pending',
                    createdAt: new Date().toISOString()
                  });
                  toast.success('Solicitação de acesso enviada para os administradores.');
                } else {
                  const reqData = requestDoc.data();
                  if (reqData.status === 'pending') {
                    toast.info('Você já possui uma solicitação de acesso em análise pelos administradores.');
                  } else if (reqData.status === 'rejected') {
                    toast.error('Sua solicitação de acesso foi recusada pelos administradores.');
                  } else {
                    toast.error('Você não tem acesso a esta plataforma.');
                  }
                }
              } catch (e) {
                console.error('Erro ao verificar/criar permissão:', e);
                toast.error('Você não tem acesso a esta plataforma. Peça a um administrador para cadastrá-lo.');
              }
              
              await signOut(auth);
              setCurrentUser(null);
              setUserData(null);
            }
          }
        } catch (error) {
          console.error("Error fetching user data", error);
          await signOut(auth);
          setCurrentUser(null);
          setUserData(null);
        }
      } else {
        setUserData(null);
      }
      setCurrentUser(user);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Login failed", error);
    }
  };

  const handleLogout = () => signOut(auth);

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
            <p className="text-sm font-semibold tracking-wider text-[#A7C0A5] uppercase">Auditoria de Qualidade & Performance</p>
          </div>
          
          <div className="bg-white rounded-[32px] border border-[#E2E4D8] p-8 space-y-6 shadow-sm">
            <p className="text-sm text-[#7A7D71]">Acesse a plataforma para gerenciar monitorias e analisar o desempenho da equipe.</p>
            <button 
              onClick={handleLogin}
              className="w-full bg-[#2D3A3A] text-white py-4 rounded-2xl font-bold hover:bg-opacity-90 shadow-lg shadow-[#2D3A3A]/20 transition-all flex items-center justify-center gap-2 group"
            >
              Entrar com Google
              <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen flex bg-[#F9F9F6] text-[#3D4035] font-sans selection:bg-[#A7C0A5] selection:text-[#2D3A3A] overflow-hidden">
      <Toaster position="top-right" richColors />
      {/* Sidebar */}
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
            <img src={currentUser.photoURL || ''} className="w-8 h-8 rounded-full border border-white/20" alt="" />
            {isSidebarOpen && (
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold truncate text-white">{userData?.name}</p>
                <p className="text-[10px] font-bold tracking-widest text-[#A7C0A5] uppercase opacity-80">{userData?.role}</p>
              </div>
            )}
            {isSidebarOpen && (
              <button 
                onClick={handleLogout}
                className="p-2 hover:bg-white/10 rounded-xl transition-colors text-[#A7C0A5]"
              >
                <LogOut className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </motion.aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col relative">
        <header className="flex-shrink-0 px-8 py-6 flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold text-[#2D3A3A]">
              {activeTab === 'dashboard' ? 'Visão Geral da Qualidade' : activeTab === 'monitorias' ? 'Auditoria e Avaliações' : 'Painel de Administração'}
            </h2>
            <p className="text-[#7A7D71] text-sm mt-1">Conectado como {userData?.name}</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="relative hidden md:flex items-center">
              <Search className="w-4 h-4 absolute left-4 text-[#7A7D71]" />
              <input 
                type="text" 
                placeholder="Pesquisar..." 
                className="bg-white border border-[#E2E4D8] rounded-2xl py-2 pl-10 pr-4 text-sm focus:border-[#A7C0A5] focus:ring-1 focus:ring-[#A7C0A5] focus:outline-none w-64 shadow-sm"
              />
            </div>
            {(activeTab === 'monitorias' || activeTab === 'dashboard') && ['admin', 'gestor', 'analista'].includes(userData?.role || '') && (
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
            {isFormOpen ? (
              <motion.div 
                key="form"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
              >
                <MonitoriaForm user={userData} onCancel={() => setIsFormOpen(false)} />
              </motion.div>
            ) : (
              <>
                {activeTab === 'dashboard' && (
                  <motion.div 
                    key="dashboard"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                  >
                    <Dashboard user={userData} />
                  </motion.div>
                )}
                {activeTab === 'monitorias' && (
                  <motion.div 
                    key="monitorias"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                  >
                    <MonitoriaList user={userData} />
                  </motion.div>
                )}
                {activeTab === 'admin' && (
                  <motion.div 
                    key="admin"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                  >
                    <AdminPanel user={userData} />
                  </motion.div>
                )}
              </>
            )}
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
