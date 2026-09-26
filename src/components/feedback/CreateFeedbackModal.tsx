import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, MessageSquare, Award, AlertCircle, CheckSquare, Calendar, ChevronRight } from 'lucide-react';
import { User, Team, Monitoria } from '../../types';
import Button from '../ui/Button';

interface CreateFeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (payload: {
    agent_id: string;
    team_id?: string | null;
    monitoria_id?: string | null;
    title: string;
    strengths?: string | null;
    improvements: string;
    action_plan: string;
    deadline_date?: string | null;
  }) => Promise<boolean>;
  users: User[];
  teams: Team[];
  monitorias?: Monitoria[];
  initialAgentId?: string;
  initialMonitoriaId?: string;
}

export default function CreateFeedbackModal({
  isOpen,
  onClose,
  onSubmit,
  users,
  teams,
  monitorias = [],
  initialAgentId = '',
  initialMonitoriaId = '',
}: CreateFeedbackModalProps) {
  const supportAgents = users.filter(u => u.role === 'suporte' && u.active);

  const [agentId, setAgentId] = useState(initialAgentId);
  const [selectedMonitoriaId, setSelectedMonitoriaId] = useState(initialMonitoriaId);
  const [title, setTitle] = useState('');
  const [strengths, setStrengths] = useState('');
  const [improvements, setImprovements] = useState('');
  const [actionPlan, setActionPlan] = useState('');
  const [deadlineDate, setDeadlineDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 14); // 14 dias por padrão
    return d.toISOString().split('T')[0];
  });
  const [submitting, setSubmitting] = useState(false);

  // Monitorias do atendente selecionado
  const agentMonitorias = monitorias.filter(m => m.evaluated_id === agentId);

  // Determinar a equipe do atendente
  const selectedAgent = users.find(u => u.id === agentId);
  const detectedTeamId = selectedAgent?.team_ids?.[0] || selectedAgent?.primary_team_id || null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!agentId || !title.trim() || !improvements.trim() || !actionPlan.trim()) return;

    setSubmitting(true);
    const success = await onSubmit({
      agent_id: agentId,
      team_id: detectedTeamId,
      monitoria_id: selectedMonitoriaId || null,
      title: title.trim(),
      strengths: strengths.trim() || null,
      improvements: improvements.trim(),
      action_plan: actionPlan.trim(),
      deadline_date: deadlineDate || null,
    });
    setSubmitting(false);

    if (success) {
      onClose();
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-6 bg-black/60 backdrop-blur-sm animate-fade-in overflow-y-auto">
      <div className="relative w-full max-w-2xl bg-surface-bg border border-surface-border rounded-2xl shadow-2xl overflow-hidden my-auto flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="p-5 border-b border-surface-border flex items-center justify-between bg-surface-card flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand-accent/10 text-brand-accent flex items-center justify-center">
              <MessageSquare className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-black text-brand-primary uppercase tracking-wider">
                Novo Registro de Feedback & 1:1
              </h2>
              <p className="text-xs text-brand-muted font-medium">
                Formalize alinhamentos, reconhecimento e planos de ação para desenvolvimento contínuo
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-brand-muted hover:text-brand-primary hover:bg-surface-subtle transition-colors cursor-pointer"
            title="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Formulário com scroll */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4 text-xs font-medium text-brand-primary">
          
          {/* Linha 1: Atendente & Monitoria Vinculada */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-black uppercase tracking-wider text-brand-muted mb-1.5">
                Atendente Avaliado *
              </label>
              <select
                required
                value={agentId}
                onChange={e => {
                  setAgentId(e.target.value);
                  setSelectedMonitoriaId('');
                }}
                className="w-full bg-surface-card border border-surface-border rounded-xl px-3 py-2 text-xs font-semibold text-brand-primary focus:outline-none focus:border-brand-accent"
              >
                <option value="">Selecione o atendente...</option>
                {supportAgents.map(a => (
                  <option key={a.id} value={a.id}>{a.name} ({a.email})</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-black uppercase tracking-wider text-brand-muted mb-1.5">
                Monitoria Vinculada (Opcional)
              </label>
              <select
                value={selectedMonitoriaId}
                onChange={e => setSelectedMonitoriaId(e.target.value)}
                disabled={!agentId}
                className="w-full bg-surface-card border border-surface-border rounded-xl px-3 py-2 text-xs font-semibold text-brand-primary focus:outline-none focus:border-brand-accent disabled:opacity-50"
              >
                <option value="">Nenhuma (1:1 Periódico Geral)</option>
                {agentMonitorias.map(m => (
                  <option key={m.id} value={m.id}>
                    Ticket #{m.ticket_id} — Nota: {m.score ?? '—'}% ({new Date(m.created_at).toLocaleDateString('pt-BR')})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Linha 2: Título do Feedback */}
          <div>
            <label className="block text-[10px] font-black uppercase tracking-wider text-brand-muted mb-1.5">
              Assunto / Título do 1:1 *
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Ex.: 1:1 Quinzenal - Alinhamento de Postura e FCR no Chat"
              className="w-full bg-surface-card border border-surface-border rounded-xl px-3.5 py-2.5 text-xs text-brand-primary placeholder:text-brand-muted focus:outline-none focus:border-brand-accent font-semibold"
            />
          </div>

          {/* Linha 3: Pontos Fortes (Reconhecimento) */}
          <div>
            <label className="block text-[10px] font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400 mb-1.5 flex items-center gap-1.5">
              <Award className="w-3.5 h-3.5" /> Pontos Fortes & Reconhecimento
            </label>
            <textarea
              rows={2}
              value={strengths}
              onChange={e => setStrengths(e.target.value)}
              placeholder="O que o atendente executou com excelência neste ciclo? Ex.: Cordialidade, rapidez no retorno e empatia com o cliente..."
              className="w-full bg-surface-card border border-surface-border rounded-xl p-3 text-xs text-brand-primary placeholder:text-brand-muted focus:outline-none focus:border-emerald-500 resize-none"
            />
          </div>

          {/* Linha 4: Oportunidades de Melhoria */}
          <div>
            <label className="block text-[10px] font-black uppercase tracking-wider text-amber-600 dark:text-amber-400 mb-1.5 flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5" /> Oportunidades de Melhoria (Pontos a Desenvolver) *
            </label>
            <textarea
              required
              rows={3}
              value={improvements}
              onChange={e => setImprovements(e.target.value)}
              placeholder="Quais desvios ou comportamentos demandam ajuste? Ex.: Confirmação cadastral de segurança antes de alterar dados sensíveis..."
              className="w-full bg-surface-card border border-surface-border rounded-xl p-3 text-xs text-brand-primary placeholder:text-brand-muted focus:outline-none focus:border-amber-500 resize-none font-medium"
            />
          </div>

          {/* Linha 5: Plano de Ação Combinado */}
          <div>
            <label className="block text-[10px] font-black uppercase tracking-wider text-blue-600 dark:text-blue-400 mb-1.5 flex items-center gap-1.5">
              <CheckSquare className="w-3.5 h-3.5" /> Plano de Ação Combinado (PDI) *
            </label>
            <textarea
              required
              rows={3}
              value={actionPlan}
              onChange={e => setActionPlan(e.target.value)}
              placeholder="Ações práticas e combinadas com o atendente para os próximos atendimentos..."
              className="w-full bg-surface-card border border-surface-border rounded-xl p-3 text-xs text-brand-primary placeholder:text-brand-muted focus:outline-none focus:border-blue-500 resize-none font-medium"
            />
          </div>

          {/* Linha 6: Prazo para Revisão do Plano */}
          <div>
            <label className="block text-[10px] font-black uppercase tracking-wider text-brand-muted mb-1.5 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5" /> Data de Acompanhamento / Revisão do Plano
            </label>
            <input
              type="date"
              value={deadlineDate}
              onChange={e => setDeadlineDate(e.target.value)}
              className="w-full sm:w-60 bg-surface-card border border-surface-border rounded-xl px-3 py-2 text-xs font-semibold text-brand-primary focus:outline-none focus:border-brand-accent"
            />
          </div>

          {/* Rodapé / Botões */}
          <div className="pt-4 border-t border-surface-border flex items-center justify-end gap-3 flex-shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-brand-muted hover:text-brand-primary rounded-xl hover:bg-surface-subtle transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <Button
              type="submit"
              disabled={submitting || !agentId || !title.trim() || !improvements.trim() || !actionPlan.trim()}
              className="px-5 py-2 text-xs font-bold"
            >
              {submitting ? 'Registrando...' : 'Registrar Feedback 1:1'}
            </Button>
          </div>
        </form>

      </div>
    </div>,
    document.body
  );
}
