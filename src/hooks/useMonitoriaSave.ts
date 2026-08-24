import { useTransition } from 'react';
import { supabase, mockDb } from '../lib/supabase';
import { User, Monitoria, MonitoriaHistoryEntry, EvaluationForm, Team, DissatisfactionField } from '../types';
import { addBusinessHours } from '../lib/businessHours';
import { toast } from 'sonner';

interface SaveHookDeps {
  user: User | null;
  initialData: Monitoria | undefined;
  isReevaluating: boolean;
  isAdminEdit: boolean;
  header: Record<string, any>;
  scores: Record<string, 'SIM' | 'NAO' | 'NA'>;
  observations: Record<string, string>;
  criticalErrors: Record<string, boolean>;
  criticalErrorObservations: Record<string, string>;
  dissatisfactionAnswers: Record<string, string[]>;
  score: number;
  selectedForm: EvaluationForm | undefined;
  qualityConfig: any;
  allUsers: User[];
  forms: EvaluationForm[];
  teams: Team[];
  dissatisfactionFields: DissatisfactionField[];
  clientFieldsToShow: DissatisfactionField[];
  qualityFieldsToShow: DissatisfactionField[];
  // Recebe o id da monitoria salva (criada ou atualizada), para que quem
  // chamou possa, por exemplo, abrir o preview de envio ao Zendesk sem
  // precisar buscar o registro de novo.
  onSaved: (monitoriaId: string) => void;
}

export function useMonitoriaSave(deps: SaveHookDeps) {
  const [isPending, startTransition] = useTransition();

  const isAllAnswered = () => {
    if (!deps.selectedForm) return false;
    return deps.selectedForm.sections.every(s =>
      s.questions.every(q => !!deps.scores[q.id])
    );
  };

  const validateStep = (s: number) => {
    if (s === 1) {
      if (!deps.header.form_id || !deps.header.evaluated_id || !deps.header.team_id || !deps.header.ticket_id || !deps.header.ticket_date || !deps.header.channel) {
        toast.error('Preencha todos os campos obrigatórios da Identificação.');
        return false;
      }
    }
    if (s === 2) {
      if (!deps.header.satisfaction_result) {
        toast.error('Selecione o resultado da pesquisa de satisfação.');
        return false;
      }
      if (deps.header.satisfaction_result !== 'Sem pesquisa') {
        if (deps.header.satisfaction_has_record && !deps.header.satisfaction_record_text.trim()) {
          toast.error('Informe o registro deixado pelo cliente.');
          return false;
        }
        if (deps.header.satisfaction_result === 'Negativa' && deps.header.client_contact_success && !deps.header.client_contact_log.trim()) {
          toast.error('Informe o registro de contato para a pesquisa negativa.');
          return false;
        }
        if (deps.header.satisfaction_result === 'Negativa' && (deps.header.satisfaction_has_record || deps.header.client_contact_success)) {
          for (const field of deps.clientFieldsToShow) {
            const answers = deps.dissatisfactionAnswers[field.id] || [];
            if (answers.length === 0) {
              toast.error(`Por favor, preencha o campo extra obrigatório: "${field.title}".`);
              return false;
            }
          }
        }
      }
    }
    if (s === 3) {
      if (!isAllAnswered()) {
        toast.error('Responda todos os itens da avaliação antes de prosseguir.');
        return false;
      }
    }
    return true;
  };

  const handleSave = () => {
    if (!deps.user) return;
    const currentUser = deps.user;
    if (!validateStep(1) || !validateStep(2) || !validateStep(3)) return;
    // Os campos extras de qualidade foram removidos da tela de monitoria, então
    // não há mais validação de preenchimento aqui. (Os campos de cliente, na
    // etapa 2, seguem validados normalmente.)
    if (deps.isReevaluating && !deps.header.reevaluation_justification.trim()) {
      toast.error('Informe a justificativa da reavaliação.');
      return;
    }

    startTransition(async () => {
      try {
        const nowTs = new Date().toISOString();
        const scoreNote = deps.isReevaluating ? `[DE ${deps.initialData?.score}% PARA ${deps.score}%] ` : '';
        let historyNote = deps.isReevaluating ? `${scoreNote}${deps.header.reevaluation_justification}` : undefined;

        if (deps.isAdminEdit && deps.initialData) {
          const changes: string[] = [];
          if (deps.header.ticket_id !== deps.initialData.ticket_id) changes.push(`Ticket: ${deps.initialData.ticket_id} → ${deps.header.ticket_id}`);
          if (deps.header.ticket_date !== deps.initialData.ticket_date) changes.push(`Data do ticket: ${deps.initialData.ticket_date} → ${deps.header.ticket_date}`);
          if (deps.score !== deps.initialData.score) changes.push(`Score: ${deps.initialData.score}% → ${deps.score}%`);
          historyNote = changes.length > 0 ? changes.join(' | ') : 'Edição administrativa';
        }

        const historyEntry: MonitoriaHistoryEntry = {
          action: deps.isAdminEdit ? 'Edição pelo Administrador' : (deps.isReevaluating ? 'Monitoria Reavaliada (Procedente)' : 'Monitoria Criada'),
          by_id: currentUser.id,
          by_name: currentUser.name,
          at: nowTs,
          note: historyNote
        };

        const getDeadline = () => {
          const now = new Date();
          const actionDeadline = deps.qualityConfig.action_deadline;
          const bh = deps.qualityConfig.businessHours;
          if (deps.isReevaluating) return addBusinessHours(now, actionDeadline?.auditor_reevaluation || 25, bh).toISOString();
          return addBusinessHours(now, actionDeadline?.agent_review || 50, bh).toISOString();
        };

        const filteredDissatisfactionAnswers = { ...deps.dissatisfactionAnswers };
        if (deps.header.satisfaction_result !== 'Negativa' || !(deps.header.satisfaction_has_record || deps.header.client_contact_success)) {
          deps.dissatisfactionFields.forEach(f => {
            if (f.type === 'cliente') {
              delete filteredDissatisfactionAnswers[f.id];
            }
          });
        }

        const evaluatedUser = deps.allUsers.find(u => u.id === deps.header.evaluated_id);
        const selectedTeam = deps.teams.find(t => t.id === (deps.header.team_id || evaluatedUser?.team_ids?.[0]));
        const selectedFormObj = deps.forms.find(f => f.id === deps.header.form_id);

        const payload = {
          form_id: deps.header.form_id,
          evaluator_id: deps.initialData?.evaluator_id || currentUser.id,
          evaluated_id: deps.header.evaluated_id,
          team_id: deps.header.team_id || null,
          ticket_id: deps.header.ticket_id,
          channel: deps.header.channel,
          ticket_date: deps.header.ticket_date,
          analysis_date: deps.header.analysis_date,
          satisfaction_result: deps.header.satisfaction_result || null,
          satisfaction_has_record: deps.header.satisfaction_has_record,
          satisfaction_record_text: deps.header.satisfaction_record_text,
          answers: deps.scores,
          question_observations: deps.observations,
          critical_error_observations: deps.criticalErrorObservations,
          selected_critical_errors: Object.keys(deps.criticalErrors).filter(id => deps.criticalErrors[id]),
          score: deps.score,
          status: deps.isAdminEdit ? (deps.initialData?.status || 'pendente_revisao') : (deps.isReevaluating ? 'pendente_revisao' : (deps.initialData?.status || 'pendente_revisao')),
          evaluator_note: deps.header.evaluator_note,
          client_contact_log: deps.header.client_contact_success ? deps.header.client_contact_log : '',
          client_contact_success: deps.header.client_contact_success,
          active: true,
          form_snapshot: deps.selectedForm,
          history: [...(deps.initialData?.history || []), historyEntry],
          action_deadline_at: (deps.initialData?.action_deadline_at && !deps.isReevaluating && !deps.isAdminEdit) ? deps.initialData.action_deadline_at : getDeadline(),
          evaluator_name: currentUser.name,
          evaluated_name: evaluatedUser?.name || '',
          form_name: selectedFormObj?.title || '',
          team_name: selectedTeam?.name || '',
          updated_at: nowTs,
          dissatisfaction_answers: filteredDissatisfactionAnswers,
          applied_config: deps.qualityConfig as unknown as Record<string, unknown>,
        };

        let savedId: string;
        if (!supabase) {
          if (deps.initialData?.id) {
            await mockDb.update('monitorias', deps.initialData.id, payload);
            savedId = deps.initialData.id;
          } else {
            const { data, error } = await mockDb.insert('monitorias', payload);
            if (error) throw error;
            savedId = data.id;
          }
        } else {
          // O erro precisa ser verificado: supabase-js NAO lanca excecao em
          // falha de query, devolve { error }. Sem checar, uma falha passava
          // direto para o toast de sucesso e a monitoria simplesmente nunca
          // existia — foi assim que 9 colunas ausentes ficaram invisiveis.
          if (deps.initialData?.id) {
            const { error } = await supabase.from('monitorias').update(payload).eq('id', deps.initialData.id);
            if (error) throw error;
            savedId = deps.initialData.id;
          } else {
            // O insert precisa devolver o id da linha criada: quem chamou
            // (MonitoriaForm) usa esse id para abrir o preview de envio ao
            // Zendesk logo em seguida, e a Edge Function lê os dados pelo id.
            const { data, error } = await supabase.from('monitorias').insert([payload]).select('id').single();
            if (error) throw error;
            savedId = data.id;
          }
        }
        toast.success('Monitoria salva com sucesso!');
        deps.onSaved(savedId);
      } catch (e: any) {
        console.error('[Monitoria] Falha ao salvar:', e);
        toast.error(e?.message
          ? `Não foi possível salvar a monitoria: ${e.message}`
          : 'Não foi possível salvar a monitoria. Tente novamente.');
      }
    });
  };

  return { isPending, validateStep, handleSave };
}
