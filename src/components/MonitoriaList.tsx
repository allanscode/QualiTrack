import React, { useState, useEffect, useCallback } from 'react';
import { supabase, mockDb } from '../lib/supabase';
import { Monitoria, MonitoriaStatus, User, Team, EvaluationForm } from '../types';
import { Search, Eye, ChevronDown, ChevronUp, Clock, CheckCircle2, XCircle, AlertCircle, RotateCcw, Trash2, Undo2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import MonitoriaForm from './MonitoriaForm';

const STATUS_CONFIG: Record<MonitoriaStatus, { label: string; color: string; bg: string; dot: string }> = {
  pendente_revisao:           { label: 'Aguardando Auditado',      color: 'text-amber-700',  bg: 'bg-amber-50 border-amber-200',  dot: 'bg-amber-400' },
  em_contestacao:             { label: 'Em Reanálise',             color: 'text-orange-700', bg: 'bg-orange-50 border-orange-200', dot: 'bg-orange-400' },
  aguardando_gestor_suporte:  { label: 'Aguardando Gestor',        color: 'text-blue-700',   bg: 'bg-blue-50 border-blue-200',    dot: 'bg-blue-400' },
  aguardando_gestor_qualidade:{ label: 'Aguardando Qualidade',     color: 'text-purple-700', bg: 'bg-purple-50 border-purple-200',dot: 'bg-purple-400' },
  concluida:                  { label: 'Finalizada Aprovada',      color: 'text-green-700',  bg: 'bg-green-50 border-green-200',  dot: 'bg-green-500' },
  contestacao_aceita:         { label: 'Contestação Aceita',       color: 'text-green-600',  bg: 'bg-green-50 border-green-100',  dot: 'bg-green-300' },
  contestacao_negada:         { label: 'Contestação Negada',       color: 'text-red-600',    bg: 'bg-red-50 border-red-100',      dot: 'bg-red-400' },
  finalizada_alterada:        { label: 'Finalizada Alterada',      color: 'text-cyan-600',   bg: 'bg-cyan-50 border-cyan-100',    dot: 'bg-cyan-400' },
};

const TABS = [
  { key: 'todas', label: 'Todas' },
  { key: 'em_contestacao', label: 'Contestadas' },
  { key: 'pendente_revisao', label: 'Pendentes' },
  { key: 'aguardando_gestor_suporte', label: 'Gest. Suporte' },
  { key: 'aguardando_gestor_qualidade', label: 'Gest. Qualidade' },
  { key: 'concluida', label: 'Concluídas' }
];

function deadlineLabel(dl?: string): string | null {
  if (!dl) return null;
  const diff = new Date(dl).getTime() - Date.now();
  if (diff <= 0) return 'Prazo expirado';
  const h = Math.floor(diff / 3600000);
  if (h < 24) return `${h}h restantes`;
  return `${Math.floor(h / 24)}d restantes`;
}

export default function MonitoriaList({ user, onNew }: { user: User | null; onNew: () => void }) {
  const getDefaultTab = useCallback((role?: string): MonitoriaStatus | 'todas' => {
    if (role === 'admin') return 'todas';
    if (role === 'qualidade') return 'em_contestacao';
    if (role === 'suporte') return 'pendente_revisao';
    if (role === 'gestor_suporte') return 'aguardando_gestor_suporte';
    if (role === 'gestor_qualidade') return 'aguardando_gestor_qualidade';
    return 'todas';
  }, []);

  const [monitorias, setMonitorias] = useState<Monitoria[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [forms, setForms] = useState<EvaluationForm[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<MonitoriaStatus | 'todas'>(getDefaultTab(user?.role));
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'active' | 'removed'>('active');
  const [teamFilter, setTeamFilter] = useState<string>('');
  const [dateType, setDateType] = useState<'analysis' | 'ticket'>('analysis');
  const [startDate, setStartDate] = useState(new Date(Date.now() - 7 * 24 * 3600000).toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [actionModal, setActionModal] = useState<{ id: string; type: 'aceitar' | 'contestar' | 'manter' | 'aprovar' | 'escalar' | 'excluir' | 'reavaliar' | 'devolver' } | null>(null);
  const [viewingMonitoria, setViewingMonitoria] = useState<Monitoria | null>(null);
  const [actionNote, setActionNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      let docs: Monitoria[] = [];
      let userDocs: User[] = [];
      if (!supabase) {
        docs = (await mockDb.get('monitorias')).data || [];
        userDocs = (await mockDb.get('users')).data || [];
        const { data: t } = await mockDb.get('teams');
        const { data: f } = await mockDb.get('forms');
        setTeams(t || []);
        setForms(f || []);
      } else {
        const { data: m } = await supabase.from('monitorias').select('*').order('created_at', { ascending: false });
        docs = (m || []).map((r: any) => ({ ...r, history: r.history || [], answers: r.answers || {} }));
        const { data: u } = await supabase.from('users').select('*');
        userDocs = (u || []) as User[];
        const { data: t } = await supabase.from('teams').select('*');
        const { data: f } = await supabase.from('forms').select('*');
        setTeams(t || []);
        setForms(f || []);
      }

      // Automated SLA Transitions
      const now = new Date();
      let hasUpdates = false;
      for (const m of docs) {
        if (m.active !== false && m.deadline_at && new Date(m.deadline_at) < now && !['concluida', 'contestacao_aceita', 'contestacao_negada', 'finalizada_alterada'].includes(m.status)) {
          let nextStatus: MonitoriaStatus = m.status;
          let action = 'SLA Expirado - Ação Automática';
          
          if (m.status === 'pendente_revisao') { nextStatus = 'concluida'; action = 'SLA Auditado Expirado - Aprovada Automático'; }
          else if (m.status === 'em_contestacao') { nextStatus = 'contestacao_aceita'; action = 'SLA Auditor Expirado - Contestação Aceita'; }
          else if (m.status === 'aguardando_gestor_suporte') { nextStatus = 'aguardando_gestor_qualidade'; action = 'SLA Gestor Auditado Expirado'; }
          else if (m.status === 'aguardando_gestor_qualidade') { nextStatus = 'concluida'; action = 'SLA Gestor Qualidade Expirado'; }

          if (nextStatus !== m.status) {
            if (supabase) {
              await supabase.from('monitorias').update({ 
                status: nextStatus, 
                history: [...(m.history || []), { action, by_id: 'system', by_name: 'Sistema', at: now.toISOString() }] 
              }).eq('id', m.id);
            } else {
              await mockDb.update('monitorias', m.id, { 
                status: nextStatus, 
                history: [...(m.history || []), { action, by_id: 'system', by_name: 'Sistema', at: now.toISOString() }] 
              });
            }
            hasUpdates = true;
          }
        }
      }
      if (hasUpdates) {
        const { data: m } = await supabase!.from('monitorias').select('*').order('created_at', { ascending: false });
        docs = (m || []).map((r: any) => ({ ...r, history: r.history || [], answers: r.answers || {} }));
      }

      // RBAC filter
      if (user.role === 'suporte') docs = docs.filter(m => m.evaluated_id === user.id);
      else if (user.role === 'qualidade') docs = docs.filter(m => m.evaluator_id === user.id);
      else if (user.role === 'gestor_suporte' || user.role === 'gestor_qualidade') {
        const myTeamIds = user.team_ids || [];
        const myTeamUserIds = userDocs.filter(u => u.team_ids?.some(tid => myTeamIds.includes(tid))).map(u => u.id);
        docs = docs.filter(m => myTeamUserIds.includes(m.evaluated_id) || myTeamUserIds.includes(m.evaluator_id));
      }
      // RBAC for removed records
      if (user.role === 'suporte' || user.role === 'gestor_suporte') {
        docs = docs.filter(m => m.active !== false);
      }

      setMonitorias(docs);
      setUsers(userDocs);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const getName = (id: string) => users.find(u => u.id === id)?.name || id;
  const getAuditorName = (m: Monitoria) => {
    if (!user) return '—';
    if (user.role === 'suporte' || user.role === 'gestor_suporte') return 'Anônimo';
    return getName(m.evaluator_id);
  };

  const baseFiltered = monitorias.filter(m => {
    if (!user) return false;
    if (user.role === 'admin' || user.role === 'gestor_qualidade') return true;
    if (user.role === 'qualidade') return m.evaluator_id === user.id;
    if (user.role === 'suporte') return m.evaluated_id === user.id;
    if (user.role === 'gestor_suporte') {
      // Robust team check supporting multiple teams (team_ids array)
      const userTeamIds = (user as any).team_ids || [];
      return m.team_id && userTeamIds.includes(m.team_id);
    }
    return false;
  });

  const listWithFiltersExceptTab = baseFiltered
    .filter(m => statusFilter === 'active' ? (m.active !== false) : (m.active === false))
    .filter(m => {
      if (!startDate && !endDate) return true;
      const targetDate = dateType === 'analysis' ? (m.analysis_date || m.created_at) : m.ticket_date;
      if (!targetDate) return true;
      const d = new Date(targetDate).getTime();
      const startD = startDate ? new Date(startDate).getTime() : 0;
      const endD = endDate ? new Date(endDate + 'T23:59:59').getTime() : Infinity;
      return d >= startD && d <= endD;
    })
    .filter(m => {
      if (!search) return true;
      const s = search.toLowerCase();
      const idStr = m.display_id?.toString() || '';
      const teamName = teams.find(t => t.id === m.team_id)?.name || '';
      return (
        m.ticket_id.toLowerCase().includes(s) ||
        getName(m.evaluated_id).toLowerCase().includes(s) ||
        getName(m.evaluator_id).toLowerCase().includes(s) ||
        teamName.toLowerCase().includes(s) ||
        idStr.includes(s)
      );
    })
    .filter(m => !teamFilter || m.team_id === teamFilter);

  const filtered = listWithFiltersExceptTab.filter(m => tab === 'todas' || m.status === tab);

  const getUrgentMonitoria = () => {
    if (!user) return null;
    const role = user.role;
    const actionable = baseFiltered.filter(m => {
      if (m.active === false) return false;
      if (!m.deadline_at) return false;
      if (['concluida', 'contestacao_aceita', 'contestacao_negada', 'finalizada_alterada'].includes(m.status)) return false;
      
      if (role === 'admin') return true;
      if (role === 'suporte') return m.status === 'pendente_revisao' && m.evaluated_id === user.id;
      if (role === 'qualidade') return m.status === 'em_contestacao' && m.evaluator_id === user.id;
      if (role === 'gestor_suporte') return m.status === 'aguardando_gestor_suporte';
      if (role === 'gestor_qualidade') return m.status === 'aguardando_gestor_qualidade';
      return false;
    });
    
    if (actionable.length === 0) return null;
    return actionable.sort((a, b) => new Date(a.deadline_at!).getTime() - new Date(b.deadline_at!).getTime())[0];
  };

  const urgent = getUrgentMonitoria();
  const getActions = (m: Monitoria): string[] => {
    if (!user || m.active === false) return [];
    const r = user.role;
    if (m.status === 'pendente_revisao' && r === 'suporte' && m.evaluated_id === user.id) return ['aceitar', 'contestar'];
    if (m.status === 'em_contestacao' && r === 'qualidade' && m.evaluator_id === user.id) {
        const lastAction = m.history?.[m.history.length - 1]?.action;
        if (lastAction === 'Devolvido para reanálise do Auditor') return ['reavaliar'];
        return ['manter', 'reavaliar'];
    }
    if (m.status === 'aguardando_gestor_suporte' && r === 'gestor_suporte') return ['aprovar', 'escalar'];
    if (m.status === 'aguardando_gestor_qualidade' && r === 'gestor_qualidade') return ['aprovar', 'devolver'];
    return [];
  };

  const handleAction = async () => {
    if (!actionModal || !user) return;
    setSubmitting(true);
    const { id, type } = actionModal;
    const monitoria = monitorias.find(m => m.id === id);
    if (!monitoria) return;

    const now = new Date().toISOString();
    const historyEntry = { 
        action: type === 'contestar' ? 'Contestação realizada' : 
                type === 'manter' ? 'Decisão mantida' : 
                type === 'escalar' ? 'Escalado para Qualidade' : 
                type === 'excluir' ? 'Monitoria removida' : 
                type === 'reavaliar' ? 'Reavaliação solicitada' :
                type === 'devolver' ? 'Devolvido para reanálise do Auditor' :
                'Ação realizada', 
        by_id: user.id, 
        by_name: user.name, 
        at: now, 
        note: actionNote || undefined 
    };

    let nextStatus: MonitoriaStatus = monitoria.status;
    if (type === 'aceitar' || type === 'aprovar') nextStatus = 'concluida';
    else if (type === 'contestar' || type === 'devolver') nextStatus = 'em_contestacao';
    else if (type === 'manter') nextStatus = 'aguardando_gestor_suporte';
    else if (type === 'escalar') nextStatus = 'aguardando_gestor_qualidade';
    else if (type === 'reavaliar') {
      setViewingMonitoria({ ...monitoria, _reevaluate: true });
      setActionModal(null);
      setSubmitting(false);
      return;
    }

    const update: any = type === 'excluir' 
      ? { active: false, history: [...(monitoria.history || []), historyEntry], updated_at: now }
      : {
          status: nextStatus,
          updated_at: now,
          history: [...(monitoria.history || []), historyEntry],
          ...(nextStatus !== 'concluida' ? { deadline_at: new Date(Date.now() + (nextStatus === 'pendente_revisao' ? 48 : 24) * 3600000).toISOString() } : {}),
          ...(type === 'contestar' ? { contestation_reason: actionNote } : {}),
        };

    try {
      if (!supabase) {
        await mockDb.update('monitorias', id, update);
      } else {
        const { error } = await supabase.from('monitorias').update(update).eq('id', id);
        if (error) throw error;
      }
      toast.success('Ação registrada com sucesso!');
      setActionModal(null);
      setActionNote('');
      load();
    } catch (e: any) {
      toast.error('Erro: ' + e.message);
    } finally { setSubmitting(false); }
  };

  if (loading) return (
    <div className="space-y-4">
      {[1,2,3].map(i => <div key={i} className="h-20 bg-white rounded-3xl border border-[#E2E4D8] animate-pulse" />)}
    </div>
  );

  if (viewingMonitoria) {
    return (
      <MonitoriaForm 
        user={user} 
        initialData={viewingMonitoria} 
        onCancel={() => setViewingMonitoria(null)} 
        onSaved={() => { setViewingMonitoria(null); load(); }} 
      />
    );
  }

  const getVisibleTabs = () => {
    return TABS;
  };

  const visibleTabs = getVisibleTabs();
  const today = new Date().toLocaleDateString('sv-SE');
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3600000).toLocaleDateString('sv-SE');
  const hasFilters = search.length > 0 || startDate !== sevenDaysAgo || endDate !== today || teamFilter !== '';

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-[32px] p-6 border border-[#E2E4D8] shadow-sm space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#7A7D71]" />
              <input
                type="text"
                placeholder="Buscar ticket, nome..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="bg-[#F9F9F6] border border-[#E2E4D8] rounded-xl py-2 pl-9 pr-4 text-xs focus:border-[#A7C0A5] focus:outline-none w-40 md:w-52 transition-colors"
              />
            </div>
            <select
              value={dateType}
              onChange={e => setDateType(e.target.value as any)}
              className="bg-[#F9F9F6] border border-[#E2E4D8] rounded-xl px-3 py-2 text-xs font-semibold text-[#7A7D71] focus:border-[#A7C0A5] focus:outline-none"
            >
              <option value="analysis">Por Data Auditoria</option>
              <option value="ticket">Por Data Ticket</option>
            </select>
            <div className="flex items-center gap-1.5 bg-[#F9F9F6] border border-[#E2E4D8] rounded-xl px-3 py-2">
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="bg-transparent border-none p-0 text-xs focus:ring-0 w-26" />
              <span className="text-[#C5C7BB] text-xs">→</span>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="bg-transparent border-none p-0 text-xs focus:ring-0 w-26" />
            </div>
            {/* Team filter */}
            <select
              value={teamFilter}
              onChange={e => setTeamFilter(e.target.value)}
              className="bg-[#F9F9F6] border border-[#E2E4D8] rounded-xl px-3 py-2 text-xs font-semibold text-[#7A7D71] focus:border-[#A7C0A5] focus:outline-none"
            >
              <option value="">Todas as equipes</option>
              {teams.filter(t => t.active !== false).map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
            {hasFilters && (
              <button
                onClick={() => { setStartDate(sevenDaysAgo); setEndDate(today); setSearch(''); setDateType('analysis'); setTeamFilter(''); }}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-red-100 bg-red-50 text-red-600 text-xs font-bold hover:bg-red-100 transition-colors"
              >
                <XCircle className="w-3.5 h-3.5" /> Limpar
              </button>
            )}
          </div>

          {urgent ? (
            <button 
              onClick={() => setViewingMonitoria(urgent)}
              className="flex items-center gap-3 bg-red-50 px-4 py-2 rounded-2xl border border-red-100 hover:bg-red-100 transition-all text-left animate-pulse"
            >
              <Clock className="w-5 h-5 text-red-600" />
              <div>
                <p className="text-[10px] font-bold text-red-600 uppercase tracking-widest">Ação Necessária</p>
                <div className="flex items-center gap-2">
                  <p className="text-xs font-bold text-[#2D3A3A]">Monitoria #{urgent.display_id || urgent.id.slice(0,4)}</p>
                  <span className="text-[#E2E4D8]">·</span>
                  <div className="text-xs">
                    <CountdownTimer deadline={urgent.deadline_at} status={urgent.status} />
                  </div>
                </div>
              </div>
            </button>
          ) : (
            <div className="flex items-center gap-2 bg-[#F0F1E8]/50 px-4 py-2 rounded-2xl">
              <CheckCircle2 className="w-4 h-4 text-[#A7C0A5]" />
              <div>
                <p className="text-[10px] font-bold text-[#7A7D71] uppercase tracking-widest">Tudo em dia</p>
                <p className="text-xs font-bold text-[#2D3A3A]">Nenhuma ação pendente</p>
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-[#F0F1E8]">
          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar pb-1">
            {visibleTabs.map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest whitespace-nowrap transition-all ${tab === t.key ? 'bg-[#2D3A3A] text-white shadow-lg shadow-black/10' : 'bg-[#F9F9F6] text-[#7A7D71] hover:bg-[#F0F1E8]'}`}
              >
                {t.label}
                {t.key !== 'todas' && (
                  <span className={`ml-2 px-1.5 py-0.5 rounded-full text-[9px] ${tab === t.key ? 'bg-white/20' : 'bg-[#E2E4D8]'}`}>
                    {listWithFiltersExceptTab.filter(m => m.status === t.key).length}
                  </span>
                )}
              </button>
            ))}
          </div>

          {(user?.role === 'admin' || user?.role === 'qualidade') && (
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value as any)}
              className="bg-[#F9F9F6] border border-[#E2E4D8] rounded-xl px-3 py-2 text-xs font-semibold text-[#7A7D71] focus:border-[#A7C0A5] focus:outline-none"
            >
              <option value="active">Ativas</option>
              <option value="removed">Removidas</option>
            </select>
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="py-20 text-center bg-white rounded-3xl border border-[#E2E4D8]">
          <div className="w-16 h-16 bg-[#F0F1E8] rounded-3xl flex items-center justify-center mx-auto mb-4">
            <Search className="w-7 h-7 text-[#7A7D71]" />
          </div>
          <p className="text-[#2D3A3A] font-bold text-lg mb-1">Nenhuma monitoria encontrada</p>
          <p className="text-[#7A7D71] text-sm">Tente ajustar os filtros ou o período selecionado</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(m => {
            const cfg = STATUS_CONFIG[m.status];
            const dl = deadlineLabel(m.deadline_at);
            const actions = getActions(m);
            const isExpanded = expandedId === m.id;
            const scoreColor = m.score === 100 ? 'text-indigo-600' : m.score >= 75 ? 'text-emerald-600' : 'text-red-600';
            const scoreBg = m.score === 100 ? 'bg-indigo-50 border-indigo-100' : m.score >= 75 ? 'bg-emerald-50 border-emerald-100' : 'bg-red-50 border-red-100';

            return (
              <motion.div key={m.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={`bg-white rounded-3xl border border-[#E2E4D8] shadow-sm overflow-hidden ${m.active === false ? 'grayscale opacity-60' : ''}`}>
                <div 
                  className={`flex items-stretch cursor-pointer hover:bg-gray-50/50 transition-colors ${isExpanded ? 'bg-gray-50/50' : ''}`}
                  onClick={() => setExpandedId(isExpanded ? null : m.id)}
                >
                  <div className={`w-1.5 flex-shrink-0 ${m.active === false ? 'bg-gray-300' : cfg.dot}`} />
                  <div className="flex-1 p-5 grid grid-cols-2 md:grid-cols-[100px_1.2fr_1.2fr_1.2fr_1fr_100px_160px_auto] gap-4 items-center">
                    <div className="md:border-r border-[#F0F1E8]">
                      <p className="text-[10px] font-bold tracking-widest text-[#7A7D71] uppercase">Monitoria</p>
                      <p className="font-bold text-[#2D3A3A] text-lg">{m.display_id || m.id.slice(0, 4)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold tracking-widest text-[#7A7D71] uppercase">Ticket</p>
                      <p className="font-mono font-bold text-[#2D3A3A]">#{m.ticket_id}</p>
                      <p className="text-xs text-[#7A7D71]">{m.channel}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold tracking-widest text-[#7A7D71] uppercase">Auditado</p>
                      <p className="font-semibold text-sm text-[#2D3A3A] truncate">{getName(m.evaluated_id)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold tracking-widest text-[#7A7D71] uppercase">Auditor</p>
                      <p className="font-semibold text-sm text-[#2D3A3A] truncate">{getAuditorName(m)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold tracking-widest text-[#7A7D71] uppercase">Equipe</p>
                      <p className="font-semibold text-sm text-[#2D3A3A] truncate">{teams.find(t => t.id === m.team_id)?.name || '—'}</p>
                    </div>
                    <div className={`px-3 py-2 rounded-xl ${scoreBg} text-center`}>
                      <p className="text-[10px] font-bold tracking-widest text-[#7A7D71] uppercase">Score</p>
                      <p className={`text-2xl font-bold ${scoreColor}`}>{m.score}<span className="text-sm">%</span></p>
                    </div>
                    <div>
                      <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-[10px] font-bold ${m.active === false ? 'bg-gray-100 text-gray-500' : cfg.bg + ' ' + cfg.color}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${m.active === false ? 'bg-gray-400' : cfg.dot}`} />
                        {m.active === false ? 'Removida' : cfg.label}
                      </span>
                      {m.active !== false && <CountdownTimer deadline={m.deadline_at} status={m.status} />}
                    </div>
                    <div className="flex items-center justify-end gap-1.5">
                      {actions.includes('aceitar') && (
                        <button onClick={(e) => { e.stopPropagation(); setActionModal({ id: m.id, type: 'aceitar' }); }} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors text-xs font-bold" title="Aceitar auditoria">
                          <CheckCircle2 className="w-3.5 h-3.5" /> <span className="hidden lg:inline">Aceitar</span>
                        </button>
                      )}
                      {actions.includes('contestar') && (
                        <button onClick={(e) => { e.stopPropagation(); setActionModal({ id: m.id, type: 'contestar' }); }} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-orange-50 text-orange-700 hover:bg-orange-100 transition-colors text-xs font-bold" title="Contestar">
                          <XCircle className="w-3.5 h-3.5" /> <span className="hidden lg:inline">Contestar</span>
                        </button>
                      )}
                      {actions.includes('manter') && (
                        <button onClick={(e) => { e.stopPropagation(); setActionModal({ id: m.id, type: 'manter' }); }} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-50 text-purple-700 hover:bg-purple-100 transition-colors text-xs font-bold" title="Manter decisão">
                          <AlertCircle className="w-3.5 h-3.5" /> <span className="hidden lg:inline">Manter</span>
                        </button>
                      )}
                      {actions.includes('aprovar') && (
                        <button onClick={(e) => { e.stopPropagation(); setActionModal({ id: m.id, type: 'aprovar' }); }} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors text-xs font-bold" title="Aprovar">
                          <CheckCircle2 className="w-3.5 h-3.5" /> <span className="hidden lg:inline">Aprovar</span>
                        </button>
                      )}
                      {actions.includes('escalar') && (
                        <button onClick={(e) => { e.stopPropagation(); setActionModal({ id: m.id, type: 'escalar' }); }} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors text-xs font-bold" title="Escalar">
                          <RotateCcw className="w-3.5 h-3.5" /> <span className="hidden lg:inline">Escalar</span>
                        </button>
                      )}
                      {actions.includes('reavaliar') && (
                        <button onClick={(e) => { e.stopPropagation(); setViewingMonitoria({ ...m, _reevaluate: true }); }} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors text-xs font-bold" title="Reavaliar">
                          <RotateCcw className="w-3.5 h-3.5" /> <span className="hidden lg:inline">Reavaliar</span>
                        </button>
                      )}
                      {actions.includes('devolver') && (
                        <button onClick={(e) => { e.stopPropagation(); setActionModal({ id: m.id, type: 'devolver' }); }} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-orange-50 text-orange-700 hover:bg-orange-100 transition-colors text-xs font-bold" title="Devolver para Auditor">
                          <Undo2 className="w-3.5 h-3.5" /> <span className="hidden lg:inline">Devolver</span>
                        </button>
                      )}
                      {(user.role === 'admin' || user.role === 'qualidade') && m.active !== false && (
                        (() => {
                          const isAllowedStatus = ['em_contestacao', 'aguardando_gestor_qualidade'].includes(m.status) || user.role === 'admin';
                          if (!isAllowedStatus) return null;
                          return (
                            <button onClick={(e) => { e.stopPropagation(); setActionModal({ id: m.id, type: 'excluir' }); }} className="p-2 rounded-xl bg-red-50 text-red-600 hover:bg-red-100 transition-colors" title="Desativar">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          );
                        })()
                      )}
                      <div className="w-px h-4 bg-[#E2E4D8] mx-0.5 hidden md:block" />
                      <button onClick={(e) => { e.stopPropagation(); setViewingMonitoria(m); }} className="p-2 rounded-xl hover:bg-[#F0F1E8] text-[#7A7D71] transition-all" title="Ver detalhes">
                        <Eye className="w-4 h-4" />
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); setExpandedId(isExpanded ? null : m.id); }} className={`p-2 rounded-xl transition-all ${isExpanded ? 'bg-[#2D3A3A] text-white' : 'hover:bg-[#F0F1E8] text-[#7A7D71]'}`}>
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Expandable details */}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden border-t border-[#F0F1E8]">
                      <div className="p-6 space-y-4 bg-[#FBFBF9]">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                          <div><p className="text-[10px] font-bold text-[#7A7D71] uppercase">Data do Ticket</p><p className="font-medium">{m.ticket_date ? new Date(m.ticket_date).toLocaleDateString('pt-BR') : '—'}</p></div>
                          <div><p className="text-[10px] font-bold text-[#7A7D71] uppercase">Data da Análise</p><p className="font-medium">{m.analysis_date ? new Date(m.analysis_date).toLocaleDateString('pt-BR') : '—'}</p></div>
                          <div><p className="text-[10px] font-bold text-[#7A7D71] uppercase">Satisfação</p><p className="font-medium">{m.satisfaction_result || '—'}{m.satisfaction_has_record ? ' · Com registro' : ''}</p></div>
                          <div><p className="text-[10px] font-bold text-[#7A7D71] uppercase">Auditor</p><p className="font-medium">{getAuditorName(m)}</p></div>
                        </div>
                        
                        {m.evaluator_note && (
                          <div className="bg-white border border-[#E2E4D8] rounded-2xl p-4">
                            <p className="text-[10px] font-bold text-[#7A7D71] uppercase mb-1">Registro do Avaliador</p>
                            <p className="text-sm text-[#2D3A3A] whitespace-pre-wrap">{m.evaluator_note}</p>
                          </div>
                        )}

                        {m.client_contact_log && (
                          <div className="bg-red-50/50 border border-red-100 rounded-2xl p-4">
                            <p className="text-[10px] font-bold text-red-600 uppercase mb-1">Registro de Contato ({m.client_contact_success ? 'Sucesso' : 'Sem sucesso'})</p>
                            <p className="text-sm text-red-900 whitespace-pre-wrap">{m.client_contact_log}</p>
                          </div>
                        )}

                        {/* Critical Error Observations */}
                        {m.critical_error_observations && Object.keys(m.critical_error_observations).length > 0 && (
                          <div className="bg-red-50 border border-red-200 rounded-2xl p-4">
                            <p className="text-[10px] font-bold text-red-700 uppercase mb-3">Detalhes dos Erros Críticos</p>
                            <div className="space-y-3">
                              {Object.entries(m.critical_error_observations).map(([qId, obs]) => (
                                <div key={qId} className="bg-white/60 p-3 rounded-xl border border-red-100">
                                  <p className="text-[10px] font-bold text-red-800">Causa: {obs}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {m.contestation_reason && (
                          <div className="bg-orange-50 border border-orange-200 rounded-2xl p-4">
                            <p className="text-[10px] font-bold text-orange-700 uppercase mb-1">Motivo da Contestação</p>
                            <p className="text-sm text-orange-900 font-medium italic">"{m.contestation_reason}"</p>
                          </div>
                        )}

                        {(() => {
                          const lastEntry = [...(m.history || [])].reverse().find(h => h.note);
                          if (!lastEntry || lastEntry.note === m.contestation_reason) return null;
                          return (
                            <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4">
                              <p className="text-[10px] font-bold text-blue-700 uppercase mb-1">Última Justificativa / Parecer</p>
                              <p className="text-[10px] font-bold text-blue-600 mb-1">Por: {lastEntry.by_name}</p>
                              <p className="text-sm text-blue-900 font-medium italic">"{lastEntry.note}"</p>
                            </div>
                          );
                        })()}

                        {/* Question Observations */}
                        {m.question_observations && Object.keys(m.question_observations).length > 0 && (
                          <div className="bg-[#F0F1E8] rounded-2xl p-4">
                            <p className="text-[10px] font-bold text-[#7A7D71] uppercase mb-3">Observações por Item</p>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              {Object.entries(m.question_observations).map(([qId, obs]) => {
                                if (!obs) return null;
                                const form = forms.find(f => f.id === m.form_id);
                                const question = form?.sections.flatMap(s => s.questions).find(q => q.id === qId);
                                const qText = question?.text || qId;
                                return (
                                  <div key={qId} className="bg-white/60 p-3 rounded-xl border border-white/40">
                                    <p className="text-[10px] font-bold text-[#7A7D71]">{qText}</p>
                                    <p className="text-xs text-[#2D3A3A] mt-1">{obs}</p>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                        {m.history?.length > 0 && (
                          <div>
                            <p className="text-[10px] font-bold text-[#7A7D71] uppercase mb-2">Histórico de Ações</p>
                            <div className="space-y-2">
                              {m.history.map((h, i) => (
                                <div key={i} className="flex items-start gap-3 text-xs text-[#7A7D71]">
                                  <div className="w-1.5 h-1.5 rounded-full bg-[#A7C0A5] mt-1.5 flex-shrink-0" />
                                  <span><strong className="text-[#2D3A3A]">{h.by_name}</strong> — {h.action}{h.note ? `: "${h.note}"` : ''} <span className="ml-1">{new Date(h.at).toLocaleString('pt-BR')}</span></span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Action Modal */}
      <AnimatePresence>
        {actionModal && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl">
              <h3 className="text-xl font-bold text-[#2D3A3A] mb-2">
                {actionModal.type === 'reavaliar' && 'Reavaliar auditoria'}
                {actionModal.type === 'devolver' && 'Devolver para auditor'}
                {actionModal.type === 'manter' && 'Manter decisão'}
                {actionModal.type === 'aceitar' && 'Aceitar auditoria'}
                {actionModal.type === 'contestar' && 'Contestar monitoria'}
                {actionModal.type === 'aprovar' && 'Aprovar monitoria'}
                {actionModal.type === 'escalar' && 'Escalar para Gest. Qualidade'}
                {actionModal.type === 'excluir' && 'Desativar avaliação'}
              </h3>
              <p className="text-sm text-[#7A7D71] mb-6">
                {actionModal.type === 'aceitar' && 'Você confirma que concorda com a avaliação recebida. Esta ação finalizará o fluxo.'}
                {actionModal.type === 'contestar' && 'Descreva o motivo da contestação. O auditor responsável será notificado.'}
                {actionModal.type === 'manter' && 'Você mantém sua decisão original. A monitoria será encaminhada ao Gestor de Suporte.'}
                {actionModal.type === 'reavaliar' && 'Você iniciará uma reavaliação. Um motivo é necessário.'}
                {actionModal.type === 'devolver' && 'A monitoria será devolvida para o auditor original para reavaliação obrigatória.'}
                {actionModal.type === 'aprovar' && 'Você aprova a monitoria. Esta ação finalizará o fluxo.'}
                {actionModal.type === 'escalar' && 'A monitoria será encaminhada ao Gestor de Qualidade para decisão final.'}
                {actionModal.type === 'excluir' && 'Esta ação irá desativar a monitoria da listagem principal.'}
              </p>
              {(actionModal.type === 'contestar' || actionModal.type === 'manter' || actionModal.type === 'escalar' || actionModal.type === 'excluir' || actionModal.type === 'reavaliar' || actionModal.type === 'devolver') && (
                <textarea
                  value={actionNote}
                  onChange={e => setActionNote(e.target.value)}
                  placeholder={actionModal.type === 'contestar' ? 'Descreva o motivo da contestação...' : 'Justificativa obrigatória para esta ação...'}
                  rows={4}
                  className="w-full bg-[#F9F9F6] border border-[#E2E4D8] rounded-2xl p-4 text-sm focus:border-[#A7C0A5] focus:outline-none resize-none mb-4"
                />
              )}
              <div className="flex gap-3">
                <button onClick={() => { setActionModal(null); setActionNote(''); }} className="flex-1 px-4 py-3 rounded-2xl border border-[#E2E4D8] text-sm font-bold text-[#7A7D71] hover:bg-[#F9F9F6]">Cancelar</button>
                <button
                  onClick={handleAction}
                  disabled={submitting || (['contestar', 'manter', 'escalar', 'excluir', 'reavaliar', 'devolver'].includes(actionModal.type) && !actionNote.trim())}
                  className="flex-1 px-4 py-3 rounded-2xl bg-[#2D3A3A] text-white text-sm font-bold disabled:opacity-50 hover:bg-opacity-90 transition-all"
                >
                  {submitting ? 'Salvando...' : 'Confirmar'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────
function CountdownTimer({ deadline, status }: { deadline?: string; status: MonitoriaStatus }) {
  const [timeLeft, setTimeLeft] = useState<string>('');
  const [slaStatus, setSlaStatus] = useState<'normal' | 'warning' | 'expired' | 'finalized'>('normal');

  useEffect(() => {
    const isFinal = ['concluida', 'contestacao_aceita', 'contestacao_negada', 'finalizada_alterada'].includes(status);
    if (isFinal) {
      setSlaStatus('finalized');
      setTimeLeft('Finalizado');
      return;
    }
    if (!deadline) {
      setTimeLeft('Sem prazo');
      return;
    }

    const timer = setInterval(() => {
      const now = new Date().getTime();
      const end = new Date(deadline).getTime();
      const diff = end - now;

      if (diff <= 0) {
        setSlaStatus('expired');
        setTimeLeft('Expirado');
        clearInterval(timer);
      } else {
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);
        
        if (hours < 4) setSlaStatus('warning');
        else setSlaStatus('normal');

        setTimeLeft(`${hours}h ${minutes}m ${seconds}s`);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [deadline, status]);

  const colors = {
    normal: 'text-green-600',
    warning: 'text-orange-500 font-bold',
    expired: 'text-red-600 font-bold',
    finalized: 'text-[#7A7D71]'
  };

  return (
    <p className={`text-[10px] mt-1 font-bold flex items-center gap-1 ${colors[slaStatus]}`}>
      <Clock className="w-3 h-3" />{timeLeft}
    </p>
  );
}
