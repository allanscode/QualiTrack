import { useState, useEffect, useCallback, useRef } from 'react';
import { AgentFeedback, User } from '../types';
import { supabase, mockDb, isMockMode } from '../lib/supabase';
import { toast } from 'sonner';

export function useFeedbacks(currentUser: User | null) {
  const [feedbacks, setFeedbacks] = useState<AgentFeedback[]>([]);
  const [loading, setLoading] = useState(true);
  const fetchingRef = useRef(false);

  const loadFeedbacks = useCallback(async () => {
    if (!currentUser) return;
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    setLoading(true);

    try {
      if (isMockMode || !supabase) {
        const { data } = await mockDb.get('agent_feedbacks');
        const all = (data || []) as AgentFeedback[];
        if (currentUser.role === 'suporte') {
          setFeedbacks(all.filter(f => f.agent_id === currentUser.id));
        } else if (currentUser.role === 'gestor_suporte') {
          const myTeamIds = currentUser.team_ids || [];
          setFeedbacks(all.filter(f => 
            f.manager_id === currentUser.id || 
            (f.team_id && myTeamIds.includes(f.team_id))
          ));
        } else {
          setFeedbacks(all);
        }
      } else {
        let query = supabase.from('agent_feedbacks').select('*').order('created_at', { ascending: false });

        if (currentUser.role === 'suporte') {
          query = query.eq('agent_id', currentUser.id);
        } else if (currentUser.role === 'gestor_suporte') {
          const myTeamIds = currentUser.team_ids || [];
          if (myTeamIds.length > 0) {
            query = query.or(`manager_id.eq.${currentUser.id},team_id.in.(${myTeamIds.map(id => `"${id}"`).join(',')})`);
          } else {
            query = query.eq('manager_id', currentUser.id);
          }
        }

        const { data, error } = await query;
        if (error) throw error;
        setFeedbacks(data || []);
      }
    } catch (err: any) {
      console.error('[Feedbacks] Erro ao carregar feedbacks:', err);
    } finally {
      setLoading(false);
      fetchingRef.current = false;
    }
  }, [currentUser]);

  useEffect(() => {
    loadFeedbacks();
  }, [loadFeedbacks]);

  // Criar novo feedback
  const createFeedback = async (payload: {
    agent_id: string;
    team_id?: string | null;
    monitoria_id?: string | null;
    title: string;
    strengths?: string | null;
    improvements: string;
    action_plan: string;
    deadline_date?: string | null;
  }) => {
    if (!currentUser) return false;
    try {
      const newFeedback: AgentFeedback = {
        id: crypto.randomUUID(),
        agent_id: payload.agent_id,
        manager_id: currentUser.id,
        team_id: payload.team_id || null,
        monitoria_id: payload.monitoria_id || null,
        title: payload.title,
        strengths: payload.strengths || null,
        improvements: payload.improvements,
        action_plan: payload.action_plan,
        deadline_date: payload.deadline_date || null,
        status: 'pendente_ciencia',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      if (isMockMode || !supabase) {
        const res = await mockDb.insert('agent_feedbacks', newFeedback);
        if (res.error) throw res.error;
      } else {
        const { error } = await supabase.from('agent_feedbacks').insert(newFeedback);
        if (error) throw error;
      }

      toast.success('Feedback 1:1 registrado com sucesso!');
      await loadFeedbacks();
      return true;
    } catch (err: any) {
      console.error('[Feedbacks] Erro ao criar feedback:', err);
      toast.error('Erro ao registrar feedback: ' + (err.message || 'Falha de comunicação'));
      return false;
    }
  };

  // Atendente confirma leitura e ciência (com validação estrita de titularidade)
  const acknowledgeFeedback = async (feedbackId: string, notes?: string) => {
    try {
      if (!currentUser?.id) {
        toast.error('Usuário não autenticado.');
        return false;
      }

      // Validar titularidade para evitar BOLA / IDOR
      const targetFeedback = feedbacks.find(f => f.id === feedbackId);
      if (targetFeedback && targetFeedback.agent_id !== currentUser.id && currentUser.role !== 'admin') {
        toast.error('Apenas o atendente titular pode assinar a ciência deste alinhamento.');
        return false;
      }

      const now = new Date().toISOString();
      const updates = {
        status: 'ciente' as const,
        agent_acknowledged_at: now,
        agent_notes: notes?.trim() || null,
        updated_at: now,
      };

      if (isMockMode || !supabase) {
        const res = await mockDb.update('agent_feedbacks', feedbackId, updates);
        if (res.error) throw res.error;
      } else {
        let query = supabase.from('agent_feedbacks').update(updates).eq('id', feedbackId);
        if (currentUser.role === 'suporte') {
          query = query.eq('agent_id', currentUser.id);
        }
        const { error } = await query;
        if (error) throw error;
      }

      toast.success('Ciência do feedback confirmada com sucesso!');
      await loadFeedbacks();
      return true;
    } catch (err: any) {
      console.error('[Feedbacks] Erro ao assinar ciência:', err);
      toast.error('Erro ao confirmar ciência: ' + (err.message || 'Falha ao salvar'));
      return false;
    }
  };

  // Concluir plano de ação (restrito a gestores e administradores)
  const completeFeedback = async (feedbackId: string) => {
    try {
      if (!currentUser?.id || !['gestor_suporte', 'gestor_qualidade', 'admin'].includes(currentUser.role)) {
        toast.error('Apenas gestores ou administradores podem concluir o plano de ação.');
        return false;
      }

      const now = new Date().toISOString();
      const updates = {
        status: 'concluido' as const,
        completed_at: now,
        updated_at: now,
      };

      if (isMockMode || !supabase) {
        const res = await mockDb.update('agent_feedbacks', feedbackId, updates);
        if (res.error) throw res.error;
      } else {
        const { error } = await supabase.from('agent_feedbacks').update(updates).eq('id', feedbackId);
        if (error) throw error;
      }

      toast.success('Plano de ação concluído com sucesso!');
      await loadFeedbacks();
      return true;
    } catch (err: any) {
      console.error('[Feedbacks] Erro ao concluir feedback:', err);
      toast.error('Erro ao concluir: ' + (err.message || 'Falha ao salvar'));
      return false;
    }
  };

  return {
    feedbacks,
    loading,
    refreshFeedbacks: loadFeedbacks,
    createFeedback,
    acknowledgeFeedback,
    completeFeedback,
  };
}
