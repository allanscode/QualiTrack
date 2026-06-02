import React, { useState, useEffect } from 'react';
import { supabase, mockDb } from '../lib/supabase';
import { User, Team, EvaluationForm, AccessRequest } from '../types';
import { useStaticData } from '../lib/StaticDataContext';
import {
  Users,
  ClipboardList,
  Shield,
  UserPlus,
  BarChart3,
  Sliders,
  RefreshCw,
  Calendar,
  Target
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
  const staticData = useStaticData();
  const [activeSubTab, setActiveSubTab] = useState<'users' | 'teams' | 'forms' | 'requests' | 'operacao' | 'metas' | 'campos_extras'>('users');
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [loading, setLoading] = useState(true);

  const loadRequests = async () => {
    setLoading(true);
    try {
      if (!supabase) {
        const { data } = await mockDb.get('access_requests');
        setRequests(data || []);
      } else {
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
    }
  };

  const loadAllData = async () => {
    await Promise.all([
      staticData.refreshAll(),
      loadRequests()
    ]);
  };

  useEffect(() => {
    const handleReconnect = () => {
      console.log('[Admin] Reconexão detectada. Recarregando dados...');
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
    loadRequests();
  }, []);

  if (staticData.loading && loading) {
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
          { key: 'operacao', label: 'Operação', icon: Calendar },
          { key: 'metas', label: 'Metas', icon: Target },
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
          {activeSubTab === 'users' && <UsersManagement users={staticData.users} teams={staticData.teams} loadData={loadAllData} />}
          {activeSubTab === 'teams' && <TeamsManagement teams={staticData.teams} users={staticData.users} loadData={loadAllData} />}
          {activeSubTab === 'forms' && <FormsManagement currentUser={currentUser} teams={staticData.teams} loadData={loadAllData} />}
          {activeSubTab === 'requests' && <RequestsManagement requests={requests} users={staticData.users} teams={staticData.teams} loadData={loadAllData} />}
          {activeSubTab === 'operacao' && <QualityConfigManagement mode="operacao" />}
          {activeSubTab === 'metas' && <QualityConfigManagement mode="metas" />}
          {activeSubTab === 'campos_extras' && <DissatisfactionFieldsManagement />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
