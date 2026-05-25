import React, { useState, useEffect } from 'react';
import { supabase, mockDb } from '../lib/supabase';
import { User, Team, EvaluationForm, AccessRequest, UserTeam } from '../types';
import { 
  Users, 
  ClipboardList, 
  Shield, 
  UserPlus, 
  BarChart3,
  Sliders
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import QualityConfigManagement from './QualityConfigManagement';
import UsersManagement from './admin/UsersManagement';
import TeamsManagement from './admin/TeamsManagement';
import FormsManagement from './admin/FormsManagement';
import RequestsManagement from './admin/RequestsManagement';
import DissatisfactionFieldsManagement from './admin/DissatisfactionFieldsManagement';

export default function AdminPanel({ user: currentUser }: { user: User | null }) {
  const [activeSubTab, setActiveSubTab] = useState<'users' | 'teams' | 'forms' | 'requests' | 'qualidade' | 'campos_extras'>('users');
  const [users, setUsers] = useState<User[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [forms, setForms] = useState<EvaluationForm[]>([]);
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [loading, setLoading] = useState(true);

  const loadAllData = async () => {
    setLoading(true);
    try {
    if (!supabase) {
      const [u, t, f, r, ut] = await Promise.all([
        mockDb.get('users'),
        mockDb.get('teams'),
        mockDb.get('forms'),
        mockDb.get('access_requests'),
        mockDb.get('user_teams')
      ]);

      const teamIdsByUser: Record<string, string[]> = {};
      (ut.data || []).forEach((utItem: any) => {
        if (!teamIdsByUser[utItem.user_id]) teamIdsByUser[utItem.user_id] = [];
        teamIdsByUser[utItem.user_id].push(utItem.team_id);
      });

      const enrichedUsers = (u.data || []).map((user: any) => ({
        ...user,
        team_ids: user.team_ids?.length ? user.team_ids : (teamIdsByUser[user.id] || [])
      }));

      setUsers(enrichedUsers);
      setTeams(t.data || []);
      setForms(f.data || []);
      setRequests(r.data || []);
    } else {
      const executeWithRetry = async (retryCount = 0): Promise<any[]> => {
        try {
          console.log(`[Admin] Carregando dados (Tentativa ${retryCount + 1})...`);

          const { data: { session } } = await supabase.auth.getSession();
          if (!session && retryCount < 1) {
            console.warn('[Admin] Sessão não encontrada. Tentando refresh...');
            await supabase.auth.refreshSession();
          }

          const controller = new AbortController();
          const fetchPromise = Promise.all([
            supabase.from('users').select('*').abortSignal(controller.signal),
            supabase.from('teams').select('*').abortSignal(controller.signal),
            supabase.from('forms').select('*').abortSignal(controller.signal),
            supabase.from('user_teams').select('*').abortSignal(controller.signal)
          ]);

          const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => { controller.abort(); reject(new Error('timeout')); }, 15000)
          });

          const results = await Promise.race([fetchPromise, timeoutPromise]) as any[];

          const errorRes = results.find((r: any) => r.error);
          if (errorRes) throw errorRes.error;

          return results;
        } catch (err: any) {
          console.error(`[Admin] Erro na tentativa ${retryCount + 1}:`, err);

          if (retryCount < 4) {
            const waitTime = Math.min(1000 * Math.pow(1.5, retryCount) + 1000 * retryCount, 10000);
            toast.loading(`Conexão instável. Recuperando dados... (${retryCount + 1}/5)`, { id: 'admin-retry' });
            console.warn(`[Admin] Retentando em ${Math.round(waitTime/1000)}s...`);
            await new Promise(res => setTimeout(res, waitTime));
            return executeWithRetry(retryCount + 1);
          }
          toast.dismiss('admin-retry');
          toast.error('Não foi possível conectar ao servidor. Verifique sua internet.');
          throw err;
        }
      };

      const results = await executeWithRetry();
      const [u, t, f, ut] = results;

      const teamIdsByUser: Record<string, string[]> = {};
      const utData = ut?.data || [];
      utData.forEach((utItem: any) => {
        if (!teamIdsByUser[utItem.user_id]) teamIdsByUser[utItem.user_id] = [];
        teamIdsByUser[utItem.user_id].push(utItem.team_id);
      });

      const enrichedUsers = (u?.data || []).map((user: any) => ({
        ...user,
        team_ids: user.team_ids?.length ? user.team_ids : (teamIdsByUser[user.id] || [])
      }));

      if (enrichedUsers.length) setUsers(enrichedUsers);
      if (t?.data) setTeams(t.data);
      if (f?.data) setForms(f.data);

      try {
        const { data: r, error: re } = await supabase.from('access_requests').select('*').order('created_at', { ascending: false });
        if (!re && r) setRequests(r);
      } catch (e) {
        console.warn('[Admin] Falha ao carregar solicitações de acesso.');
      }
    }
  } catch (e) {
      console.error("Error loading admin data:", e);
    } finally {
      setLoading(false);
      toast.dismiss('admin-retry');
    }
  };

  useEffect(() => {
    const handleReconnect = () => {
      console.log('[Admin] 🔄 Reconexão detectada. Recarregando dados...');
      loadAllData();
    };
    window.addEventListener('qualitrack:reconnected', handleReconnect);
    return () => window.removeEventListener('qualitrack:reconnected', handleReconnect);
  }, []);

  useEffect(() => {
    let timer: any;
    if (loading) {
      timer = setTimeout(() => {
        if (loading) {
          console.warn('[Admin] Failsafe: Interrompendo carregamento após 45s.');
          setLoading(false);
          toast.dismiss('admin-retry');
        }
      }, 45000);
    }
    return () => clearTimeout(timer);
  }, [loading]);

  useEffect(() => {
    loadAllData();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <RefreshCw className="w-8 h-8 animate-spin text-brand-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-2 bg-surface-card p-1.5 rounded-2xl border border-surface-border shadow-premium-sm w-fit overflow-x-auto no-scrollbar">
        {[
          { key: 'users', label: 'Usuários', icon: Users },
          { key: 'teams', label: 'Equipes', icon: Shield },
          { key: 'forms', label: 'Formulários', icon: ClipboardList },
          { key: 'requests', label: 'Solicitações', icon: UserPlus },
          { key: 'qualidade', label: 'Configurações', icon: BarChart3 },
          { key: 'campos_extras', label: 'Campos Extras', icon: Sliders },
        ].map((item) => {
          const Icon = item.icon;
          const active = activeSubTab === item.key;
          return (
            <button
              key={item.key}
              onClick={() => setActiveSubTab(item.key as any)}
              className={`
                flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all
                ${active 
                  ? 'bg-brand-primary text-brand-on-primary shadow-premium' 
                  : 'text-brand-muted hover:text-brand-primary hover:bg-surface-subtle'}
              `}
            >
              <Icon className="w-4 h-4" />
              {item.label}
            </button>
          );
        })}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={activeSubTab}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2 }}
        >
          {activeSubTab === 'users' && <UsersManagement users={users} teams={teams} loadData={loadAllData} />}
          {activeSubTab === 'teams' && <TeamsManagement teams={teams} users={users} loadData={loadAllData} />}
          {activeSubTab === 'forms' && <FormsManagement currentUser={currentUser} teams={teams} loadData={loadAllData} />}
          {activeSubTab === 'requests' && <RequestsManagement requests={requests} users={users} teams={teams} loadData={loadAllData} />}
          {activeSubTab === 'qualidade' && <QualityConfigManagement />}
          {activeSubTab === 'campos_extras' && <DissatisfactionFieldsManagement />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

// Keep a small component import of RefreshCw for the loading state
import { RefreshCw } from 'lucide-react';
