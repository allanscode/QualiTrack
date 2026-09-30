import { useState, useEffect, useCallback, useRef } from 'react';
import { AgentFeedback, User } from '../types';
import { supabase, mockDb, isMockMode } from '../lib/supabase';
import { fetchAllRows } from '../lib/pagination';
import { toast } from 'sonner';

const manages = (user: User) => ['admin', 'gestor_qualidade', 'gestor_suporte'].includes(user.role);
const canRead = (user: User, row: AgentFeedback) => user.active && (
  ['admin', 'gestor_qualidade'].includes(user.role) ||
  (user.role === 'suporte' && row.agent_id === user.id) ||
  (user.role === 'gestor_suporte' && !!row.team_id && !!user.team_ids?.includes(row.team_id))
);
type FeedbackInput = Pick<AgentFeedback, 'agent_id' | 'title' | 'improvements' | 'action_plan'> &
  Partial<Pick<AgentFeedback, 'team_id' | 'monitoria_id' | 'strengths' | 'deadline_date'>>;

export function useFeedbacks(currentUser: User | null) {
  const [feedbacks, setFeedbacks] = useState<AgentFeedback[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const request = useRef(0);
  const mutation = useRef(false);
  const loadFeedbacks = useCallback(async () => {
    const version = ++request.current;
    if (!currentUser?.active) { setFeedbacks([]); setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      let rows: AgentFeedback[];
      if (isMockMode || !supabase) {
        const { data, error: failure } = await mockDb.get('agent_feedbacks');
        if (failure) throw failure;
        rows = (data ?? []) as AgentFeedback[];
      } else {
        const client = supabase;
        rows = await fetchAllRows<AgentFeedback>((from, to) => client.from('agent_feedbacks')
          .select('*', { count: 'exact' }).order('created_at', { ascending: false }).order('id').range(from, to));
      }
      if (version === request.current) setFeedbacks(rows.filter(row => canRead(currentUser, row)));
    } catch {
      if (version === request.current) {
        setFeedbacks([]);
        setError('Não foi possível carregar os planos. Tente atualizar novamente.');
      }
    } finally { if (version === request.current) setLoading(false); }
  }, [currentUser]);
  useEffect(() => {
    setFeedbacks([]);
    void loadFeedbacks();
    return () => { request.current++; };
  }, [loadFeedbacks]);

  useEffect(() => {
    if (isMockMode || !supabase || !currentUser?.active) return;
    const client = supabase;
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    const channel = client.channel(`agent-feedbacks-${currentUser.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agent_feedbacks' }, () => {
        if (refreshTimer) clearTimeout(refreshTimer);
        refreshTimer = setTimeout(() => { void loadFeedbacks(); }, 300);
      })
      .subscribe();
    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      void client.removeChannel(channel);
    };
  }, [currentUser?.id, currentUser?.active, loadFeedbacks]);

  const perform = async (work: () => Promise<void>, success: string) => {
    if (!currentUser?.active || mutation.current) return false;
    mutation.current = true;
    try {
      await work();
      toast.success(success);
      await loadFeedbacks();
      return true;
    } catch {
      toast.error('Não foi possível salvar. Atualize os planos e confira sua permissão antes de tentar novamente.');
      return false;
    } finally { mutation.current = false; }
  };
  const createFeedback = (payload: FeedbackInput) => perform(async () => {
    if (!currentUser || !manages(currentUser)) throw new Error('Sem permissão');
    const now = new Date().toISOString();
    const row: AgentFeedback = { ...payload, id: crypto.randomUUID(), manager_id: currentUser.id,
      status: 'pendente_ciencia', created_at: now, updated_at: now };
    if (!canRead(currentUser, row)) throw new Error('Equipe inválida');
    if (!row.title.trim() || row.title.length > 200 || !row.improvements.trim() || !row.action_plan.trim() ||
        row.improvements.length > 10000 || row.action_plan.length > 10000 || (row.strengths?.length ?? 0) > 10000) throw new Error('Campos inválidos');
    if (isMockMode || !supabase) {
      const { data } = await mockDb.get('users');
      const agent = (data as User[]).find(user => user.id === row.agent_id);
      if (!agent?.active || agent.role !== 'suporte' || (row.team_id && !agent.team_ids?.includes(row.team_id))) throw new Error('Atendente inválido');
      const res = await mockDb.insert('agent_feedbacks', row);
      if (res.error) throw res.error;
    } else {
      const { error: failure } = await supabase.from('agent_feedbacks').insert(row);
      if (failure) throw failure;
    }
  }, 'Feedback registrado. Aguardando ciência do atendente.');
  const acknowledgeFeedback = (id: string, notes?: string) => perform(async () => {
    const row = feedbacks.find(item => item.id === id);
    if (!currentUser || currentUser.role !== 'suporte' || !row || row.agent_id !== currentUser.id ||
        row.status !== 'pendente_ciencia' || (notes?.length ?? 0) > 10000) throw new Error('Ciência inválida');
    if (isMockMode || !supabase) {
      const now = new Date().toISOString();
      const res = await mockDb.update('agent_feedbacks', id, { status: 'ciente', agent_acknowledged_at: now,
        agent_notes: notes?.trim() || null, updated_at: now });
      if (res.error) throw res.error;
    } else {
      const { error: failure } = await supabase.rpc('acknowledge_agent_feedback', { p_id: id, p_notes: notes?.trim() || null });
      if (failure) throw failure;
    }
  }, 'Ciência confirmada.');
  const completeFeedback = (id: string) => perform(async () => {
    const row = feedbacks.find(item => item.id === id);
    if (!currentUser || !manages(currentUser) || !row || !canRead(currentUser, row) || row.status !== 'ciente') throw new Error('Conclusão inválida');
    if (isMockMode || !supabase) {
      const now = new Date().toISOString();
      const res = await mockDb.update('agent_feedbacks', id, { status: 'concluido', completed_at: now, updated_at: now });
      if (res.error) throw res.error;
    } else {
      const { error: failure } = await supabase.rpc('complete_agent_feedback', { p_id: id });
      if (failure) throw failure;
    }
  }, 'Plano de ação concluído.');
  return { feedbacks, loading, refreshing: loading, error, refreshFeedbacks: loadFeedbacks,
    createFeedback, acknowledgeFeedback, completeFeedback };
}
