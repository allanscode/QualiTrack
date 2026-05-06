import React, { useState, useEffect, useCallback } from 'react';
import { supabase, mockDb } from '../lib/supabase';
import { Monitoria, MonitoriaStatus, User } from '../types';
import { Search, Eye, ChevronDown, ChevronUp, Clock, CheckCircle2, XCircle, AlertCircle, RotateCcw } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';

const STATUS_CONFIG: Record<MonitoriaStatus, { label: string; color: string; bg: string; dot: string }> = {
  pendente_revisao:           { label: 'Aguardando Revisão',        color: 'text-amber-700',  bg: 'bg-amber-50 border-amber-200',  dot: 'bg-amber-400' },
  em_contestacao:             { label: 'Em Contestação',             color: 'text-orange-700', bg: 'bg-orange-50 border-orange-200', dot: 'bg-orange-400' },
  aguardando_gestor_suporte:  { label: 'Aguardando Gestor Suporte', color: 'text-blue-700',   bg: 'bg-blue-50 border-blue-200',    dot: 'bg-blue-400' },
  aguardando_gestor_qualidade:{ label: 'Aguardando Gest. Qualidade',color: 'text-purple-700', bg: 'bg-purple-50 border-purple-200',dot: 'bg-purple-400' },
  concluida:                  { label: 'Concluída',                  color: 'text-green-700',  bg: 'bg-green-50 border-green-200',  dot: 'bg-green-500' },
};

const TABS: { key: MonitoriaStatus | 'todas'; label: string }[] = [
  { key: 'todas', label: 'Todas' },
  { key: 'pendente_revisao', label: 'Pendentes' },
  { key: 'em_contestacao', label: 'Contestadas' },
  { key: 'aguardando_gestor_suporte', label: 'Gest. Suporte' },
  { key: 'aguardando_gestor_qualidade', label: 'Gest. Qualidade' },
  { key: 'concluida', label: 'Concluídas' },
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
  const [monitorias, setMonitorias] = useState<Monitoria[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<MonitoriaStatus | 'todas'>('todas');
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [actionModal, setActionModal] = useState<{ id: string; type: 'aceitar' | 'contestar' | 'manter' | 'aprovar' | 'escalar' } | null>(null);
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
      } else {
        const { data: m } = await supabase.from('monitorias').select('*').order('created_at', { ascending: false });
        docs = (m || []).map((r: any) => ({ ...r, history: r.history || [], answers: r.answers || {} }));
        const { data: u } = await supabase.from('users').select('id,name,email,role');
        userDocs = u || [];
      }
      // RBAC filter
      if (user.role === 'suporte') docs = docs.filter(m => m.evaluated_id === user.id);
      else if (user.role === 'qualidade') docs = docs.filter(m => m.evaluator_id === user.id);
      else if (user.role === 'gestor_suporte') {
        const myTeamIds = user.team_ids || [];
        const myTeamUserIds = userDocs.filter(u => u.team_ids?.some(tid => myTeamIds.includes(tid))).map(u => u.id);
        docs = docs.filter(m => myTeamUserIds.includes(m.evaluated_id));
      }
      setMonitorias(docs);
      setUsers(userDocs);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const getName = (id: string) => users.find(u => u.id === id)?.name || id;

  const filtered = monitorias
    .filter(m => tab === 'todas' || m.status === tab)
    .filter(m => !search || m.ticket_id.toLowerCase().includes(search.toLowerCase()) || getName(m.evaluated_id).toLowerCase().includes(search.toLowerCase()));

  // What can the current user do on this monitoria?
  const getActions = (m: Monitoria): string[] => {
    if (!user) return [];
    const r = user.role;
    if (m.status === 'pendente_revisao' && r === 'suporte' && m.evaluated_id === user.id) return ['aceitar', 'contestar'];
    if (m.status === 'em_contestacao' && r === 'qualidade' && m.evaluator_id === user.id) return ['manter', 'alterar'];
    if (m.status === 'aguardando_gestor_suporte' && r === 'gestor_suporte') return ['aprovar', 'escalar'];
    if (m.status === 'aguardando_gestor_qualidade' && r === 'gestor_qualidade') return ['aprovar'];
    return [];
  };

  const handleAction = async () => {
    if (!actionModal || !user) return;
    setSubmitting(true);
    const { id, type } = actionModal;
    const monitoria = monitorias.find(m => m.id === id);
    if (!monitoria) return;

    const now = new Date().toISOString();
    const historyEntry = { action: type, by_id: user.id, by_name: user.name, at: now, note: actionNote || undefined };

    let nextStatus: MonitoriaStatus = monitoria.status;
    if (type === 'aceitar' || type === 'aprovar') nextStatus = 'concluida';
    else if (type === 'contestar') nextStatus = 'em_contestacao';
    else if (type === 'manter') nextStatus = 'aguardando_gestor_suporte';
    else if (type === 'escalar') nextStatus = 'aguardando_gestor_qualidade';

    const deadlineHours = nextStatus === 'pendente_revisao' ? 48 : 24;
    const deadline_at = nextStatus === 'concluida' ? undefined : new Date(Date.now() + deadlineHours * 3600000).toISOString();

    const update: any = {
      status: nextStatus,
      updated_at: now,
      history: [...(monitoria.history || []), historyEntry],
      ...(deadline_at ? { deadline_at } : {}),
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

  return (
    <div className="space-y-6">
      {/* Tabs + search */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex gap-1 bg-[#F0F1E8] p-1 rounded-2xl overflow-x-auto">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${tab === t.key ? 'bg-white text-[#2D3A3A] shadow-sm' : 'text-[#7A7D71] hover:text-[#2D3A3A]'}`}
            >
              {t.label}
              {t.key !== 'todas' && (
                <span className="ml-1.5 bg-[#E2E4D8] text-[#2D3A3A] px-1.5 py-0.5 rounded-full text-[10px]">
                  {monitorias.filter(m => m.status === t.key).length}
                </span>
              )}
            </button>
          ))}
        </div>
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#7A7D71]" />
          <input
            type="text"
            placeholder="Buscar ticket ou técnico..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="bg-white border border-[#E2E4D8] rounded-xl py-2 pl-9 pr-4 text-sm focus:border-[#A7C0A5] focus:outline-none w-64"
          />
        </div>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="p-16 text-center bg-white rounded-[40px] border border-[#E2E4D8]">
          <p className="text-[#7A7D71] font-medium">Nenhuma monitoria encontrada.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(m => {
            const cfg = STATUS_CONFIG[m.status];
            const dl = deadlineLabel(m.deadline_at);
            const actions = getActions(m);
            const isExpanded = expandedId === m.id;
            const scoreColor = m.score >= 90 ? 'text-green-700' : m.score >= 70 ? 'text-amber-600' : 'text-red-600';
            const scoreBg = m.score >= 90 ? 'bg-green-50' : m.score >= 70 ? 'bg-amber-50' : 'bg-red-50';

            return (
              <motion.div key={m.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-3xl border border-[#E2E4D8] shadow-sm overflow-hidden">
                {/* Card header row */}
                <div className="flex items-stretch">
                  <div className={`w-1.5 flex-shrink-0 ${cfg.dot}`} />
                  <div className="flex-1 p-5 grid grid-cols-2 md:grid-cols-5 gap-4 items-center">
                    <div>
                      <p className="text-[10px] font-bold tracking-widest text-[#7A7D71] uppercase">Ticket</p>
                      <p className="font-mono font-bold text-[#2D3A3A]">#{m.ticket_id}</p>
                      <p className="text-xs text-[#7A7D71]">{m.channel}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold tracking-widest text-[#7A7D71] uppercase">Auditado</p>
                      <p className="font-semibold text-sm text-[#2D3A3A] truncate">{getName(m.evaluated_id)}</p>
                    </div>
                    <div className={`px-3 py-2 rounded-xl ${scoreBg} text-center`}>
                      <p className="text-[10px] font-bold tracking-widest text-[#7A7D71] uppercase">Score</p>
                      <p className={`text-2xl font-bold ${scoreColor}`}>{m.score}<span className="text-sm">%</span></p>
                    </div>
                    <div>
                      <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-bold ${cfg.bg} ${cfg.color}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />{cfg.label}
                      </span>
                      {dl && (
                        <p className={`text-[10px] mt-1 font-bold flex items-center gap-1 ${dl === 'Prazo expirado' ? 'text-red-500' : 'text-[#7A7D71]'}`}>
                          <Clock className="w-3 h-3" />{dl}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center justify-end gap-2">
                      {actions.includes('aceitar') && (
                        <button onClick={() => setActionModal({ id: m.id, type: 'aceitar' })} className="p-2 rounded-xl bg-green-50 text-green-700 hover:bg-green-100 transition-colors" title="Aceitar">
                          <CheckCircle2 className="w-4 h-4" />
                        </button>
                      )}
                      {actions.includes('contestar') && (
                        <button onClick={() => setActionModal({ id: m.id, type: 'contestar' })} className="p-2 rounded-xl bg-orange-50 text-orange-700 hover:bg-orange-100 transition-colors" title="Contestar">
                          <XCircle className="w-4 h-4" />
                        </button>
                      )}
                      {actions.includes('manter') && (
                        <button onClick={() => setActionModal({ id: m.id, type: 'manter' })} className="p-2 rounded-xl bg-purple-50 text-purple-700 hover:bg-purple-100 transition-colors" title="Manter decisão">
                          <AlertCircle className="w-4 h-4" />
                        </button>
                      )}
                      {actions.includes('aprovar') && (
                        <button onClick={() => setActionModal({ id: m.id, type: 'aprovar' })} className="p-2 rounded-xl bg-green-50 text-green-700 hover:bg-green-100 transition-colors" title="Aprovar">
                          <CheckCircle2 className="w-4 h-4" />
                        </button>
                      )}
                      {actions.includes('escalar') && (
                        <button onClick={() => setActionModal({ id: m.id, type: 'escalar' })} className="p-2 rounded-xl bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors" title="Escalar para Gestor Qualidade">
                          <RotateCcw className="w-4 h-4" />
                        </button>
                      )}
                      <button onClick={() => setExpandedId(isExpanded ? null : m.id)} className="p-2 rounded-xl hover:bg-[#F0F1E8] text-[#7A7D71] transition-colors">
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
                          <div><p className="text-[10px] font-bold text-[#7A7D71] uppercase">Auditor</p><p className="font-medium">{getName(m.evaluator_id)}</p></div>
                        </div>
                        {m.contestation_reason && (
                          <div className="bg-orange-50 border border-orange-200 rounded-2xl p-4">
                            <p className="text-[10px] font-bold text-orange-700 uppercase mb-1">Motivo da Contestação</p>
                            <p className="text-sm text-orange-900">{m.contestation_reason}</p>
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
                {actionModal.type === 'aceitar' && '✅ Aceitar Monitoria'}
                {actionModal.type === 'contestar' && '⚠️ Contestar Monitoria'}
                {actionModal.type === 'manter' && '🔒 Manter Decisão'}
                {actionModal.type === 'aprovar' && '✅ Aprovar Monitoria'}
                {actionModal.type === 'escalar' && '📤 Escalar para Gestor de Qualidade'}
              </h3>
              <p className="text-sm text-[#7A7D71] mb-6">
                {actionModal.type === 'aceitar' && 'Você confirma que concorda com a avaliação recebida. Esta ação finalizará o fluxo.'}
                {actionModal.type === 'contestar' && 'Descreva o motivo da contestação. O auditor responsável será notificado.'}
                {actionModal.type === 'manter' && 'Você mantém sua decisão original. A monitoria será encaminhada ao Gestor de Suporte.'}
                {actionModal.type === 'aprovar' && 'Você aprova a monitoria. Esta ação finalizará o fluxo.'}
                {actionModal.type === 'escalar' && 'A monitoria será encaminhada ao Gestor de Qualidade para decisão final.'}
              </p>
              {(actionModal.type === 'contestar' || actionModal.type === 'manter' || actionModal.type === 'escalar') && (
                <textarea
                  value={actionNote}
                  onChange={e => setActionNote(e.target.value)}
                  placeholder={actionModal.type === 'contestar' ? 'Descreva o motivo da contestação...' : 'Observações (opcional)...'}
                  rows={4}
                  className="w-full bg-[#F9F9F6] border border-[#E2E4D8] rounded-2xl p-4 text-sm focus:border-[#A7C0A5] focus:outline-none resize-none mb-4"
                />
              )}
              <div className="flex gap-3">
                <button onClick={() => { setActionModal(null); setActionNote(''); }} className="flex-1 px-4 py-3 rounded-2xl border border-[#E2E4D8] text-sm font-bold text-[#7A7D71] hover:bg-[#F9F9F6]">Cancelar</button>
                <button
                  onClick={handleAction}
                  disabled={submitting || (actionModal.type === 'contestar' && !actionNote.trim())}
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
