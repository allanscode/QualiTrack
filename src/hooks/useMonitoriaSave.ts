import { useTransition } from 'react';
import { supabase, mockDb } from '../lib/supabase';
import { User, Monitoria, MonitoriaStatus, MonitoriaHistoryEntry, EvaluationForm, Team, DissatisfactionField, ZendeskTicketField } from '../types';
import { addBusinessHours } from '../lib/businessHours';
import { isEvaluationValid } from '../lib/domainRules';
import { childVerdict, isChildFormId } from '../lib/childTicketForm';
import { backfillAgentTeam, getZendeskClosureWindow } from '../lib/helpdeskQueue';
import { toast } from 'sonner';
import { monitoriaTicketPresentation } from '../lib/monitoriaTicketPresentation';

interface SaveHookDeps {
  user: User | null;
  initialData: Monitoria | undefined;
  ticketGroupTeamId?: string;
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
  ticketFields: ZendeskTicketField[];
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
  onSaved: (monitoriaId: string, status: MonitoriaStatus) => void;
}

export function useMonitoriaSave(deps: SaveHookDeps) {
  const [isPending, startTransition] = useTransition();

  const isAllAnswered = () => {
    if (!deps.selectedForm) return false;
    if (isChildFormId(deps.header.form_id)) return deps.selectedForm.sections.some(section => section.questions.length > 0);
    return deps.selectedForm.sections.every(s =>
      s.questions.every(q => !!deps.scores[q.id])
    );
  };

  // `silent` evita o toast.error de efeito colateral — necessário para checar
  // "essa etapa pode ser clicada?" durante a renderização (ex.: habilitar/
  // desabilitar a aba do stepper), onde chamar a versão com toast reexibia o
  // aviso a cada re-render (inclusive causados por scroll), empilhando toasts
  // repetidos sem o usuário ter feito nada de novo.
  const validateStep = (s: number, silent = false) => {
    const fail = (message: string) => {
      if (!silent) toast.error(message);
      return false;
    };
    if (s === 1) {
      if (!deps.header.form_id || !deps.header.evaluated_id || !deps.header.team_id || !deps.header.ticket_id || !deps.header.ticket_date || !deps.header.channel) {
        return fail('Preencha todos os campos obrigatórios da Identificação.');
      }
    }
    if (s === 2) {
      if (!isAllAnswered()) {
        return fail('Responda todos os itens da avaliação antes de prosseguir.');
      }
    }
    if (s === 3) {
      if (!deps.header.satisfaction_result) {
        return fail('Selecione o resultado da pesquisa de satisfação.');
      }
      if (deps.header.satisfaction_result !== 'Sem pesquisa') {
        if (deps.header.satisfaction_has_record && !deps.header.satisfaction_record_text.trim()) {
          return fail('Informe o registro deixado pelo cliente.');
        }
        if (deps.header.satisfaction_result === 'Negativa' && !(deps.header.client_contact_channel || []).length) {
          return fail('Selecione ao menos um canal de contato utilizado (Zendesk ou Telefone).');
        }
        if (deps.header.satisfaction_result === 'Negativa' && !deps.header.client_contact_log.trim()) {
          return fail('Informe o registro de contato para a pesquisa negativa.');
        }
        if (deps.header.satisfaction_result === 'Negativa') {
          for (const field of deps.clientFieldsToShow) {
            const answers = deps.dissatisfactionAnswers[field.id] || [];
            if (answers.length === 0) {
              return fail(`Por favor, preencha o campo extra obrigatório: "${field.title}".`);
            }
          }
        }
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
    const isChild = isChildFormId(deps.header.form_id);
    const verdict = isChild ? childVerdict(deps.scores, deps.selectedForm) : null;
    if (isChild && !verdict) { toast.error('Responda todos os critérios do chamado filho.'); return; }
    if (isChild && verdict === 'valido' && !deps.header.evaluator_note?.trim()) {
      toast.error('Preencha o Registro do Auditor antes de concluir um chamado filho válido.');
      return;
    }

    startTransition(async () => {
      try {
        const nowTs = new Date().toISOString();
        const scoreNote = deps.isReevaluating && !isChild ? `[DE ${deps.initialData?.score}% PARA ${deps.score}%] ` : '';
        let historyNote = deps.isReevaluating ? `${scoreNote}${deps.header.reevaluation_justification}` : undefined;

        if (deps.isAdminEdit && deps.initialData) {
          const changes: string[] = [];
          if (deps.header.ticket_id !== deps.initialData.ticket_id) changes.push(`Ticket: ${deps.initialData.ticket_id} → ${deps.header.ticket_id}`);
          if (deps.header.ticket_date !== deps.initialData.ticket_date) changes.push(`Data do ticket: ${deps.initialData.ticket_date} → ${deps.header.ticket_date}`);
          if (!isChild && deps.score !== deps.initialData.score) changes.push(`Score: ${deps.initialData.score}% → ${deps.score}%`);
          historyNote = changes.length > 0 ? changes.join(' | ') : 'Edição administrativa';
        }

        if (isChild && verdict) {
          const previousChildVerdict = deps.initialData?.child_verdict
            || (deps.initialData?.form_snapshot as { child_verdict?: 'valido' | 'invalido' } | undefined)?.child_verdict;
          const verdictLabel = verdict === 'valido' ? 'VÁLIDO' : 'INVÁLIDO';
          const verdictHistory = previousChildVerdict && previousChildVerdict !== verdict
            ? `Veredito final alterado: ${previousChildVerdict === 'valido' ? 'VÁLIDO' : 'INVÁLIDO'} → ${verdictLabel}.`
            : `Veredito final do chamado filho: ${verdictLabel}.`;
          historyNote = [historyNote, verdictHistory].filter(Boolean).join('\n\n');
        }

        const evaluatedUser = deps.allUsers.find(u => u.id === deps.header.evaluated_id);
        const managementTeamId = evaluatedUser?.primary_team_id || deps.header.team_id;
        const isPositive = isChild ? verdict === 'valido' : isEvaluationValid(deps.score);
        const qualityManagerFinalizesValidScore = deps.isAdminEdit
          && ['gestor_qualidade', 'admin'].includes(deps.user?.role || '')
          && !!deps.initialData
          && ['pendente_revisao', 'aguardando_gestor_suporte'].includes(deps.initialData.status)
          && isPositive
          && Number(deps.initialData.score) !== Number(deps.score);
        const requiresPjReview = false;
        if (qualityManagerFinalizesValidScore) {
          historyNote = `${historyNote || 'Ajuste de nota'} | Conclusão pela Gestão da Qualidade: nota final >=75%, sem nova aprovação do Gestor de Suporte`;
        }
        let nextStatus: MonitoriaStatus;
        if (deps.isAdminEdit) {
          nextStatus = qualityManagerFinalizesValidScore
            ? 'concluida'
            : (deps.initialData?.status || (isPositive ? 'concluida' : 'pendente_revisao'));
        } else {
          nextStatus = isPositive && !requiresPjReview ? 'concluida' : 'aguardando_gestor_suporte';
        }

        const historyAction = qualityManagerFinalizesValidScore
          ? 'Veredito final ajustado pela Gestão da Qualidade (nota >=75%)'
          : deps.isAdminEdit
          ? 'Edição pelo Administrador'
          : deps.isReevaluating
            ? (isPositive ? 'Monitoria Reavaliada (Concluida)' : 'Monitoria Reavaliada (Procedente)')
            : (nextStatus === 'concluida' ? 'Monitoria Criada e Concluída' : 'Monitoria Criada e encaminhada ao Gestor de Suporte');

        const historyEntry: MonitoriaHistoryEntry = {
          action: historyAction,
          by_id: currentUser.id,
          by_name: currentUser.name,
          at: nowTs,
          note: historyNote
        };

        // Existing monitorias retain their saved deadline. The new policy only
        // applies to the first save of a pending monitoria on a new ticket.
        const closureWindow = !deps.initialData?.id && nextStatus !== 'concluida'
          ? await getZendeskClosureWindow(deps.header.ticket_id)
          : { applies: false };
        const savedClosureWindow = (deps.initialData as any)?.form_snapshot?.zendesk_closure_window;
        const closureCapAt = closureWindow.applies ? closureWindow.deadline_at : savedClosureWindow?.deadline_at;

        const getDeadline = () => {
          const now = new Date();
          const actionDeadline = deps.qualityConfig.action_deadline;
          const bh = deps.qualityConfig.businessHours;
          const normal = deps.isReevaluating
            ? addBusinessHours(now, actionDeadline?.auditor_reevaluation || 25, bh)
            : addBusinessHours(now, actionDeadline?.manager_support || 25, bh);
          if (typeof closureCapAt !== 'string' || !Number.isFinite(Date.parse(closureCapAt))) return normal.toISOString();
          return new Date(Math.min(normal.getTime(), Date.parse(closureCapAt))).toISOString();
        };

        const filteredDissatisfactionAnswers = { ...deps.dissatisfactionAnswers };
        if (deps.header.satisfaction_result !== 'Negativa') {
          deps.dissatisfactionFields.forEach(f => {
            if (f.type === 'cliente') {
              delete filteredDissatisfactionAnswers[f.id];
            }
          });
        }

        const ticketGroupTeamId = deps.initialData?.ticket_group_team_id || deps.ticketGroupTeamId || deps.header.team_id;
        const selectedFormObj = deps.forms.find(f => f.id === deps.header.form_id);
        const ticketDetails = deps.initialData && deps.initialData.ticket_id === deps.header.ticket_id
          ? monitoriaTicketPresentation(deps.initialData, deps.teams) : undefined;

        const payload = {
          form_id: deps.header.form_id,
          evaluator_id: deps.initialData?.evaluator_id || currentUser.id,
          evaluated_id: deps.header.evaluated_id,
          team_id: managementTeamId || null,
          ticket_group_team_id: ticketGroupTeamId || null,
          ticket_id: deps.header.ticket_id,
          channel: deps.header.channel,
          ticket_date: deps.header.ticket_date,
          analysis_date: deps.header.analysis_date,
          satisfaction_result: deps.header.satisfaction_result || null,
          satisfaction_has_record: deps.header.satisfaction_has_record,
          satisfaction_record_text: deps.header.satisfaction_record_text,
          answers: isChild
            ? Object.fromEntries(deps.selectedForm!.sections.flatMap(section => section.questions.map(question =>
                [question.id, deps.scores[question.id]] as const)))
            : deps.scores,
          question_observations: deps.observations,
          critical_error_observations: isChild ? {} : deps.criticalErrorObservations,
          selected_critical_errors: isChild ? [] : Object.keys(deps.criticalErrors).filter(id => deps.criticalErrors[id]),
          score: isChild ? null : deps.score,
          child_verdict: isChild ? verdict : null,
          status: nextStatus,
          resolution_type: nextStatus === 'concluida' ? 'human'
            : (deps.initialData?.resolution_type || null),
          evaluator_note: deps.header.evaluator_note,
          client_contact_log: deps.header.satisfaction_result === 'Negativa' ? deps.header.client_contact_log : '',
          client_contact_channel: deps.header.satisfaction_result === 'Negativa' ? (deps.header.client_contact_channel || []) : [],
          active: true,
          form_snapshot: {
            ...(deps.selectedForm as any),
            ...(closureWindow.applies || savedClosureWindow
              ? { zendesk_closure_window: closureWindow.applies ? closureWindow : savedClosureWindow }
              : {}),
            ticket_subject: ticketDetails?.subject || undefined,
            ticket_group_name: ticketDetails?.group || undefined,
            ticket_fields: deps.ticketFields,
            ...(isChild ? { ticket_kind: 'chamado_filho', child_verdict: verdict } : {}),
            ai_evaluation: deps.header.form_id === deps.initialData?.form_id
              ? ((deps.initialData as any)?.aiEvaluation || (deps.initialData as any)?.form_snapshot?.ai_evaluation)
              : undefined,
            ...(isChild ? {
              child_ai_evaluation: (deps.initialData as any)?.childAiEvaluation
                || (deps.initialData as any)?.form_snapshot?.child_ai_evaluation,
            } : {}),
          },
          history: [...(deps.initialData?.history || []), historyEntry],
          action_deadline_at: nextStatus === 'concluida'
            ? null
            : (deps.initialData?.action_deadline_at || getDeadline()),
          evaluator_name: currentUser.name,
          evaluated_name: evaluatedUser?.name || '',
          form_name: selectedFormObj?.title || '',
          team_name: deps.teams.find(team => team.id === managementTeamId)?.name || '',
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
            const { data: existing } = await mockDb.get('monitorias');
            if ((existing as Monitoria[] | null)?.some(m =>
              m.active !== false && m.ticket_id?.trim() === deps.header.ticket_id?.trim())) {
              throw new Error(`O ticket #${deps.header.ticket_id.trim()} já possui monitoria ativa. Abra a monitoria existente para continuar.`);
            }
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

        // Completa a equipe do agente avaliado se ele ainda estiver sem
        // primary_team_id (conta criada antes do import de equipes do
        // Zendesk, ou cadastrada manualmente sem selecionar equipe) — agora
        // que essa monitoria confirmou a equipe certa. Best-effort, não
        // bloqueia o fluxo: a monitoria já foi salva com sucesso acima.
        if (deps.header.evaluated_id && deps.header.team_id && !evaluatedUser?.primary_team_id) {
          backfillAgentTeam(deps.header.evaluated_id, deps.header.team_id);
        }

        deps.onSaved(savedId, nextStatus);
      } catch (e: any) {
        console.error('[Monitoria] Falha ao salvar:', e);
        if (e?.code === '23505' && String(e.message).includes('monitorias_one_active_per_ticket_idx')) {
          toast.error(`O ticket #${deps.header.ticket_id?.trim()} já possui monitoria ativa. Abra a monitoria existente para continuar.`);
          return;
        }
        toast.error(e?.message
          ? `Não foi possível salvar a monitoria: ${e.message}`
          : 'Não foi possível salvar a monitoria. Tente novamente.');
      }
    });
  };

  return { isPending, validateStep, handleSave };
}
