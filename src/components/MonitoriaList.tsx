import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase, mockDb } from '../lib/supabase';
import { Monitoria, MonitoriaStatus, User, Team, EvaluationForm } from '../types';
import { 
  Search, 
  Eye, 
  ChevronDown, 
  ChevronUp, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  AlertCircle, 
  RotateCcw, 
  Trash2, 
  Undo2, 
  Pencil,
  Calendar,
  Filter,
  ArrowRight,
  Shield,
  Tag,
  User as UserIcon,
  AlertTriangle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import MonitoriaForm from './MonitoriaForm';
import { addBusinessHours } from '../lib/businessHours';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import Card from './ui/Card';
import Badge from './ui/Badge';
import Button from './ui/Button';
import Select from './ui/Select';

export default function MonitoriaList({ user, onNew }: { user: User | null; onNew: () => void }) {
  const [monitorias, setMonitorias] = useState<Monitoria[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [forms, setForms] = useState<EvaluationForm[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<MonitoriaStatus | 'todas'>('todas');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'active' | 'removed'>('active');
  const [teamFilter, setTeamFilter] = useState<string>('');
  const [dateType, setDateType] = useState<'analysis' | 'ticket'>('analysis');
  const [startDate, setStartDate] = useState(new Date(Date.now() - 30 * 24 * 3600000).toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [actionModal, setActionModal] = useState<{ id: string; type: 'aceitar' | 'contestar' | 'manter' | 'aprovar' | 'escalar' | 'excluir' | 'reavaliar' | 'devolver' | 'editAdmin' } | null>(null);
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
      setMonitorias(docs);
      setUsers(userDocs);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const getName = (id: string) => users.find(u => u.id === id)?.name || id;

  const filtered = useMemo(() => {
    return monitorias.filter(m => {
      // Role-based visibility
      if (user?.role === 'suporte' && m.evaluated_id !== user.id) return false;
      if (user?.role === 'qualidade' && m.evaluator_id !== user.id) return false;
      
      // Active/Removed
      if (statusFilter === 'active' && m.active === false) return false;
      if (statusFilter === 'removed' && m.active !== false) return false;

      // Tab
      if (tab !== 'todas' && m.status !== tab) return false;

      // Team
      if (teamFilter && m.team_id !== teamFilter) return false;

      // Search
      if (search) {
        const s = search.toLowerCase();
        const ticketId = m.ticket_id.toLowerCase();
        const displayId = (m.display_id || '').toString();
        const agentName = getName(m.evaluated_id).toLowerCase();
        if (!ticketId.includes(s) && !displayId.includes(s) && !agentName.includes(s)) return false;
      }

      // Dates
      const targetDate = dateType === 'analysis' ? (m.analysis_date || m.created_at) : m.ticket_date;
      if (startDate && targetDate < startDate) return false;
      if (endDate && targetDate > endDate + 'T23:59:59') return false;

      return true;
    });
  }, [monitorias, user, tab, search, statusFilter, teamFilter, dateType, startDate, endDate]);

  const getStatusConfig = (status: MonitoriaStatus) => {
    switch (status) {
      case 'pendente_revisao': return { label: 'Aguardando Revisão', variant: 'warning' as const, icon: Clock };
      case 'em_contestacao': return { label: 'Em Reanálise', variant: 'error' as const, icon: AlertTriangle };
      case 'aguardando_gestor_suporte': return { label: 'Aguardando Gestor', variant: 'info' as const, icon: Shield };
      case 'aguardando_gestor_qualidade': return { label: 'Aguardando Qualidade', variant: 'info' as const, icon: Shield };
      case 'concluida': return { label: 'Concluída', variant: 'success' as const, icon: CheckCircle2 };
      case 'finalizada_alterada': return { label: 'Finalizada (Alterada)', variant: 'success' as const, icon: CheckCircle2 };
      case 'contestacao_aceita': return { label: 'Contestação Aceita', variant: 'success' as const, icon: CheckCircle2 };
      case 'contestacao_negada': return { label: 'Contestação Negada', variant: 'error' as const, icon: XCircle };
      default: return { label: status, variant: 'neutral' as const, icon: AlertCircle };
    }
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

    const update: any = type === 'excluir' 
      ? { active: false, history: [...(monitoria.history || []), historyEntry], updated_at: now }
      : {
          status: nextStatus,
          updated_at: now,
          history: [...(monitoria.history || []), historyEntry],
          ...(nextStatus !== 'concluida' ? { deadline_at: addBusinessHours(new Date(), nextStatus === 'pendente_revisao' ? 48 : 24).toISOString() } : {}),
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
      {[1,2,3].map(i => <div key={i} className="h-24 bg-white rounded-card border border-surface-border animate-pulse" />)}
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

  return (
    <div className="space-y-6 animate-fade-in">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-brand-primary tracking-tight">Monitorias</h1>
          <p className="text-brand-muted text-sm font-medium mt-1">Acompanhe e gerencie a qualidade da operação.</p>
        </div>
        <Button onClick={onNew} icon={<ArrowRight className="w-4 h-4" />}>Nova Monitoria</Button>
      </header>

      <Card padding="none" className="overflow-hidden">
        <div className="p-5 bg-surface-bg/30 border-b border-surface-border">
          <div className="flex flex-wrap items-center gap-4">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-brand-muted" />
              <input 
                type="text"
                placeholder="Buscar ticket ou agente..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full bg-white border border-surface-border rounded-xl py-2 pl-9 pr-4 text-xs font-semibold focus:border-brand-accent focus:outline-none"
              />
            </div>

            <Select 
              value={teamFilter}
              onChange={e => setTeamFilter(e.target.value)}
              className="w-40"
              options={[{ value: '', label: 'Todas Equipes' }, ...teams.map(t => ({ value: t.id, label: t.name }))]}
            />

            <div className="flex items-center gap-2 bg-white border border-surface-border rounded-xl px-3 py-2">
              <Calendar className="w-3.5 h-3.5 text-brand-muted" />
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="bg-transparent border-none p-0 text-[10px] font-bold w-24 focus:ring-0" />
              <span className="text-brand-highlight">→</span>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="bg-transparent border-none p-0 text-[10px] font-bold w-24 focus:ring-0" />
            </div>

            {user?.role === 'admin' && (
              <Select 
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value as any)}
                options={[{ value: 'active', label: 'Ativas' }, { value: 'removed', label: 'Removidas' }]}
              />
            )}
          </div>

          <div className="flex items-center gap-2 mt-4 overflow-x-auto no-scrollbar">
            {['todas', 'pendente_revisao', 'em_contestacao', 'aguardando_gestor_suporte', 'concluida'].map(t => (
              <button
                key={t}
                onClick={() => setTab(t as any)}
                className={`px-4 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${tab === t ? 'bg-brand-primary text-white shadow-premium' : 'bg-white text-brand-muted hover:bg-surface-subtle'}`}
              >
                {t === 'todas' ? 'Tudo' : getStatusConfig(t as any).label}
                <span className="ml-2 opacity-60">
                  {monitorias.filter(m => t === 'todas' || m.status === t).length}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="divide-y divide-surface-subtle">
          {filtered.length > 0 ? filtered.map(m => {
            const config = getStatusConfig(m.status);
            const isExpanded = expandedId === m.id;
            const scoreColor = m.score !== undefined ? (m.score >= 85 ? 'text-brand-accent' : m.score >= 75 ? 'text-warning' : 'text-error') : 'text-brand-muted';

            return (
              <div key={m.id} className={`p-4 hover:bg-surface-bg/50 transition-all ${isExpanded ? 'bg-surface-bg/30' : ''}`}>
                <div className="flex items-center justify-between gap-4 cursor-pointer" onClick={() => setExpandedId(isExpanded ? null : m.id)}>
                  <div className="flex items-center gap-4 min-w-0">
                    <div className={`w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0 bg-surface-bg text-brand-muted group-hover:bg-brand-subtle`}>
                      <config.icon className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="info" size="xs">Mon: {m.display_id || m.id.slice(0,4)}</Badge>
                        <span className="font-mono text-xs font-bold text-brand-primary">#{m.ticket_id}</span>
                        <Badge variant={config.variant} size="xs">{config.label}</Badge>
                      </div>
                      <div className="flex items-center gap-3 text-[10px] font-bold text-brand-muted uppercase tracking-tight">
                        <span className="flex items-center gap-1"><UserIcon className="w-3 h-3" /> {getName(m.evaluated_id)}</span>
                        <span className="text-brand-highlight">•</span>
                        <span className="flex items-center gap-1"><Tag className="w-3 h-3" /> {teams.find(t => t.id === m.team_id)?.name || 'N/A'}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-6">
                    <div className="text-right">
                      <p className={`text-xl font-black ${scoreColor}`}>{m.score !== undefined ? `${m.score}%` : '—'}</p>
                      <p className="text-[9px] font-bold text-brand-muted uppercase">{format(new Date(m.created_at), 'dd/MM/yyyy')}</p>
                    </div>
                    {isExpanded ? <ChevronUp className="w-5 h-5 text-brand-highlight" /> : <ChevronDown className="w-5 h-5 text-brand-highlight" />}
                  </div>
                </div>

                <AnimatePresence>
                  {isExpanded && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden mt-4 pt-4 border-t border-surface-subtle">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-4">
                          <div>
                            <p className="text-[10px] font-black uppercase text-brand-muted tracking-widest mb-1">Observações do Auditor</p>
                            <p className="text-sm text-brand-primary font-medium bg-white p-3 rounded-xl border border-surface-border">{m.evaluator_note || 'Nenhuma observação registrada.'}</p>
                          </div>
                          {m.history?.length > 0 && (
                            <div>
                              <p className="text-[10px] font-black uppercase text-brand-muted tracking-widest mb-2">Linha do Tempo</p>
                              <div className="space-y-2">
                                {m.history.map((h, i) => (
                                  <div key={i} className="flex items-start gap-2 text-xs">
                                    <div className="w-1.5 h-1.5 rounded-full bg-brand-highlight mt-1.5" />
                                    <span className="text-brand-muted"><strong className="text-brand-primary">{h.by_name}</strong>: {h.action} <span className="opacity-50">• {format(new Date(h.at), 'HH:mm')}</span></span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                        <div className="flex flex-col gap-3 justify-end items-end">
                          <Button variant="outline" size="sm" onClick={() => setViewingMonitoria(m)} icon={<Eye className="w-3.5 h-3.5" />}>Ver Completa</Button>
                          <div className="flex flex-wrap gap-2 justify-end">
                            {user?.role === 'suporte' && m.status === 'pendente_revisao' && (
                              <>
                                <Button variant="secondary" size="sm" onClick={() => setActionModal({ id: m.id, type: 'aceitar' })}>Aceitar</Button>
                                <Button variant="outline" size="sm" onClick={() => setActionModal({ id: m.id, type: 'contestar' })}>Contestar</Button>
                              </>
                            )}
                            {user?.role === 'admin' && (
                              <Button variant="ghost" size="sm" onClick={() => setActionModal({ id: m.id, type: 'excluir' })} className="text-error hover:bg-red-50">Excluir</Button>
                            )}
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          }) : (
            <div className="py-20 text-center">
              <p className="text-brand-muted font-bold">Nenhuma monitoria encontrada.</p>
            </div>
          )}
        </div>
      </Card>

      {/* Modals could be here - simplified for this refactor */}
      <AnimatePresence>
        {actionModal && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <Card className="max-w-md w-full">
              <h3 className="text-lg font-black text-brand-primary mb-2 uppercase tracking-tight">Confirmar Ação</h3>
              <p className="text-sm text-brand-muted mb-6">Deseja realmente realizar esta ação na monitoria #{monitorias.find(m => m.id === actionModal.id)?.ticket_id}?</p>
              
              {actionModal.type === 'contestar' && (
                <textarea 
                  className="w-full bg-surface-bg border border-surface-border rounded-xl p-3 text-sm mb-4 focus:outline-none focus:border-brand-accent"
                  placeholder="Descreva o motivo da contestação..."
                  rows={4}
                  value={actionNote}
                  onChange={e => setActionNote(e.target.value)}
                />
              )}

              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => setActionModal(null)}>Cancelar</Button>
                <Button className="flex-1" onClick={handleAction} disabled={submitting}>
                  {submitting ? 'Processando...' : 'Confirmar'}
                </Button>
              </div>
            </Card>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
