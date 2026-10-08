import { getMockQueueTickets } from './mockQueue';
import { supabase, isMockMode } from './supabase';
import {
  AuditingQueueType,
  AuditingQueueTicket,
  AgentQueueSummary,
  TicketCommentMessage,
  AIEvaluationResult,
  ChildTicketAiEvaluation,
  ChildTicketMacroType,
  User,
  Monitoria,
  EvaluationForm,
  AIEvaluationGuideline
} from '../types';
import { normalizeTicketDialogue } from './zendeskChatParser';

/**
 * Extrai a mensagem de erro real devolvida pela Edge Function. Em status
 * não-2xx, `supabase.functions.invoke` deixa `data` como null e só expõe um
 * erro genérico ("Edge Function returned a non-2xx status code") em
 * `error.message` — o corpo JSON de verdade (com o motivo específico) fica
 * escondido em `error.context`, uma Response que precisa ser lida à parte.
 */
export async function extractFunctionErrorMessage(error: any, fallback: string): Promise<string> {
  try {
    if (error?.context?.json) {
      const body = await error.context.json();
      if (body?.error) return body.error as string;
    }
  } catch {
    // corpo não era JSON ou já foi consumido — segue para o fallback
  }
  return error?.message || fallback;
}

/**
 * Normaliza o canal vindo do helpdesk (ex.: "chat", "voice", "native_messaging")
 * para um dos valores fixos aceitos pela ficha de monitoria. Sem isso, o
 * seletor de canal do formulário abre em branco mesmo com o valor prefilled,
 * porque o texto do Zendesk não bate com nenhuma das opções.
 */
export function normalizeChannel(raw?: string): 'Chat' | 'Email' | 'Telefone' | 'WhatsApp' {
  const c = (raw || '').toLowerCase();
  if (c.includes('whatsapp')) return 'WhatsApp';
  if (c.includes('mail')) return 'Email';
  if (c.includes('voice') || c.includes('phone') || c.includes('telefone') || c.includes('call')) return 'Telefone';
  return 'Chat';
}

/**
 * Converte o CSAT do ticket (Zendesk) no resultado de pesquisa da ficha de
 * monitoria — usado pra não fixar 'Positiva' em avaliações com IA que agora
 * também rodam em Negativas/Proativas, onde o resultado real é diferente.
 */
export function csatStatusToSatisfactionResult(status?: string): 'Positiva' | 'Negativa' | 'Sem pesquisa' {
  if (status === 'good') return 'Positiva';
  if (status === 'bad') return 'Negativa';
  return 'Sem pesquisa';
}

/**
 * Calcula a fila balanceada de agentes para monitorias proativas (sorteio justo).
 * Ordena os agentes pelo tempo decorrido desde a última monitoria.
 */
export function computeAgentQueuePriorities(
  agents: User[],
  monitorias: Monitoria[],
  teamsMap: Record<string, string> = {}
): AgentQueueSummary[] {
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  return agents
    .filter(a => a.role === 'suporte' && a.active !== false)
    .map(agent => {
      const agentMonitorias = monitorias.filter(m => m.evaluated_id === agent.id && m.active !== false);

      const monthAudits = agentMonitorias.filter(m => {
        const d = new Date(m.created_at || m.updated_at);
        return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
      });

      const aiAudits = monthAudits.filter(m => (m as any).source === 'ai' || m.satisfaction_result === 'Positiva');

      // Busca a monitoria mais recente do agente
      const sortedAudits = [...agentMonitorias].sort((a, b) => {
        const timeA = new Date(a.created_at || a.updated_at).getTime();
        const timeB = new Date(b.created_at || b.updated_at).getTime();
        return timeB - timeA;
      });

      const lastAudit = sortedAudits[0];
      const lastAuditedAt = lastAudit?.created_at || lastAudit?.updated_at;

      let daysSinceLastAudit = 999;
      if (lastAuditedAt) {
        const diffMs = now.getTime() - new Date(lastAuditedAt).getTime();
        daysSinceLastAudit = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      }

      // Pontuação de prioridade: quanto mais dias sem auditoria e menos auditorias no mês, maior a prioridade
      const priorityScore = daysSinceLastAudit * 10 - monthAudits.length * 5;

      const primaryTeamId = agent.primary_team_id || agent.team_ids?.[0];
      const teamName = primaryTeamId ? (teamsMap[primaryTeamId] || 'Geral') : 'Geral';

      return {
        agent_id: agent.id,
        agent_name: agent.name,
        agent_email: agent.email,
        team_id: primaryTeamId,
        team_name: teamName,
        total_audits_month: monthAudits.length,
        ai_audits_month: aiAudits.length,
        last_audited_at: lastAuditedAt,
        days_since_last_audit: daysSinceLastAudit,
        priority_score: priorityScore,
      };
    })
    .sort((a, b) => b.priority_score - a.priority_score);
}

export interface QueueTicketsPage {
  tickets: AuditingQueueTicket[];
  nextCursor: string | null;
  hasMore: boolean;
}

export async function publishChildTicketMacro(
  ticketId: string,
  monitoriaId: string,
): Promise<{ simulated: boolean }> {
  if (isMockMode) return { simulated: true };
  if (!supabase) throw new Error('Conexão com o Zendesk indisponível.');
  const { data, error } = await supabase.functions.invoke('helpdesk-queue', {
    body: { action: 'publish_child_macro', ticket_id: ticketId, monitoria_id: monitoriaId },
  });
  if (error) throw new Error(await extractFunctionErrorMessage(error, 'Não foi possível enviar a macro ao Zendesk.'));
  if (!data?.success) throw new Error(data?.error || 'O Zendesk não confirmou o envio da macro.');
  return { simulated: data.simulated === true };
}

/** Consulta leve para avisar sobre mudanças sem recarregar os cards da fila. */
export async function checkQueueUpdates(type: AuditingQueueType): Promise<string[]> {
  if (isMockMode || !supabase) {
    return getMockQueueTickets(type, new Set()).slice(0, 25).map(ticket => ticket.ticket_id);
  }
  const { data, error } = await supabase.functions.invoke('helpdesk-queue', {
    body: { action: 'check_queue_updates', queue_type: type },
  });
  if (error || !Array.isArray(data?.ticket_ids)) {
    throw new Error(data?.error || await extractFunctionErrorMessage(error, 'Falha ao consultar novidades da fila.'));
  }
  return data.ticket_ids.filter((id: unknown): id is string => typeof id === 'string');
}

export type QueueBadgeCounts = Record<AuditingQueueType, number | null>;

export interface QueueReconciliation {
  queue_type: AuditingQueueType;
  zendesk_view_count: number;
  monitored_count: number;
  without_monitoria_count: number;
  monitoria_statuses: Record<string, number>;
  monitored_tickets: Array<{ ticket_id: string; monitoria_id: string; status: string }>;
  as_of: string;
}

/** Compara os IDs da view atual com as monitorias ativas já registradas. */
export async function fetchQueueReconciliation(
  queue: AuditingQueueType, existingMonitorias: Monitoria[] = [],
): Promise<QueueReconciliation> {
  if (isMockMode || !supabase) {
    const tickets = getMockQueueTickets(queue, new Set());
    const ticketIds = new Set(tickets.map(ticket => ticket.ticket_id));
    const latest = new Map<string, Monitoria>();
    for (const monitoria of existingMonitorias) {
      if (monitoria.active === false || !ticketIds.has(monitoria.ticket_id)) continue;
      const previous = latest.get(monitoria.ticket_id);
      if (!previous || monitoria.created_at > previous.created_at) latest.set(monitoria.ticket_id, monitoria);
    }
    const monitoria_statuses: Record<string, number> = {};
    const monitored_tickets = [...latest.entries()].map(([ticket_id, monitoria]) => {
      monitoria_statuses[monitoria.status] = (monitoria_statuses[monitoria.status] || 0) + 1;
      return { ticket_id, monitoria_id: monitoria.id, status: monitoria.status };
    });
    return { queue_type: queue, zendesk_view_count: tickets.length, monitored_count: latest.size,
      without_monitoria_count: tickets.length - latest.size, monitoria_statuses, monitored_tickets,
      as_of: new Date().toISOString() };
  }
  const { data, error } = await supabase.functions.invoke('helpdesk-queue', {
    body: { action: 'fetch_queue_reconciliation', queue_type: queue },
  });
  if (error || typeof data?.zendesk_view_count !== 'number') {
    throw new Error(data?.error || await extractFunctionErrorMessage(error, 'Falha ao comparar a view com as monitorias.'));
  }
  return data as QueueReconciliation;
}

/** Contadores das cinco filas, respeitando a visibilidade do perfil no servidor. */
export async function fetchQueuePendingCounts(): Promise<QueueBadgeCounts> {
  const types: AuditingQueueType[] = ['negativas', 'proativas', 'positivas', 'filhos', 'filhos_invalidos'];
  if (isMockMode || !supabase) {
    return Object.fromEntries(types.map(type => [type, getMockQueueTickets(type, new Set()).length])) as QueueBadgeCounts;
  }
  const { data, error } = await supabase.functions.invoke('helpdesk-queue', {
    body: { action: 'fetch_queue_counts' },
  });
  if (error || !data?.counts) {
    throw new Error(data?.error || await extractFunctionErrorMessage(error, 'Falha ao consultar contadores das filas.'));
  }
  return Object.fromEntries(types.map(type => {
    const value = data.counts[type];
    return [type, typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null];
  })) as QueueBadgeCounts;
}

/**
 * Busca UMA página de tickets das filas do Zendesk (Negativas, Proativas ou
 * Positivas) — 25 por vez. Views grandes (Proativas: centenas de tickets de
 * CSAT vazio) não cabem numa carga só sem arriscar o rate limit do Zendesk;
 * passe `cursor` (vindo do `nextCursor` da página anterior) pra continuar.
 */
export async function fetchQueueTickets(
  type: AuditingQueueType,
  existingMonitorias: Monitoria[] = [],
  cursor: string | null = null,
  searchTerm?: string
): Promise<QueueTicketsPage> {
  const auditedTicketIds = new Set(
    existingMonitorias.map(m => m.ticket_id?.trim()).filter(Boolean)
  );

  let tickets: AuditingQueueTicket[];
  let nextCursor: string | null = null;
  let hasMore = false;

  if (isMockMode || !supabase) {
    if (typeof window !== 'undefined' && (window as any).__MOCK_QUEUE_DELAY_MS__) {
      await new Promise(r => setTimeout(r, (window as any).__MOCK_QUEUE_DELAY_MS__));
    }
    tickets = getMockQueueTickets(type, auditedTicketIds);
    if (searchTerm) {
      const term = searchTerm.toLowerCase().trim();
      tickets = tickets.filter(t =>
        t.ticket_id.toLowerCase().includes(term) ||
        t.subject.toLowerCase().includes(term) ||
        (t.agent_name && t.agent_name.toLowerCase().includes(term)) ||
        (t.requester_name && t.requester_name.toLowerCase().includes(term))
      );
    }
  } else {
    try {
      const { data, error } = await supabase.functions.invoke('helpdesk-queue', {
        body: {
          action: 'fetch_queue',
          queue_type: type,
          cursor,
          search_term: searchTerm?.trim() || undefined
        }
      });

      if (error || !data?.tickets) {
        throw new Error(data?.error || await extractFunctionErrorMessage(error, 'Falha ao consultar a fila do Zendesk.'));
      } else {
        tickets = (data.tickets as AuditingQueueTicket[]).map(t => ({
          ...t,
          // O servidor inclui monitorias pendentes de publicação na fila negativa.
          already_audited: t.already_audited ?? auditedTicketIds.has(t.ticket_id.trim())
        }));
        nextCursor = data.next_cursor || null;
        hasMore = !!data.has_more;
      }
    } catch (err) {
      console.error('[HelpdeskQueue] Erro na requisição:', err);
      throw err;
    }
  }

  if (isMockMode) {
    tickets = tickets.map(ticket => {
      const monitoria = existingMonitorias.find(item => item.active !== false && item.ticket_id?.trim() === ticket.ticket_id);
      return monitoria ? {
        ...ticket, already_audited: true, monitoria_id: monitoria.id,
        monitoria_status: monitoria.status, monitoria_score: monitoria.score,
      } : ticket;
    });
  }

  // Negativas dependem também do recibo de publicação; filhos dependem da
  // macro própria. Nas demais filas, a monitoria já encerra a triagem.
  // A view de CSAT vazio inclui tickets fechados: eles ainda podem receber
  // monitoria interna, embora o Zendesk não aceite novos comentários neles.
  tickets = tickets.filter(t => (type === 'negativas' || type === 'filhos' || type === 'filhos_invalidos' || !t.already_audited) &&
    t.status?.toLowerCase() !== 'archived' &&
    (type === 'proativas' || t.status?.toLowerCase() !== 'closed'));

  // Fila de Positivas: trava de no máximo 2 avaliações por atendente no mês,
  // usando o e-mail como chave de identificação agnóstica de plataforma.
  if (type === 'positivas') {
    const counts = countPositiveEvaluationsThisMonthByEmail(existingMonitorias, tickets);
    tickets = tickets.map(t => {
      const email = t.agent_email?.trim().toLowerCase();
      const count = email ? (counts[email] || 0) : 0;
      return { ...t, positive_cap_reached: count >= 2 } as AuditingQueueTicket;
    });
  }

  return { tickets, nextCursor, hasMore };
}

/**
 * Conta, por e-mail do atendente, quantas monitorias com resultado "Positiva"
 * já existem no mês corrente. O vínculo é feito por e-mail (não por id
 * interno), pois o mesmo atendente pode ainda não ter conta formal no
 * QualiTrack quando a fila é consultada.
 */
function countPositiveEvaluationsThisMonthByEmail(
  monitorias: Monitoria[],
  tickets: AuditingQueueTicket[]
): Record<string, number> {
  const emailByAgentId: Record<string, string> = {};
  tickets.forEach(t => {
    if (t.agent_id && t.agent_email) {
      emailByAgentId[t.agent_id] = t.agent_email.trim().toLowerCase();
    }
  });

  const now = new Date();
  const counts: Record<string, number> = {};

  monitorias.forEach(m => {
    if (m.satisfaction_result !== 'Positiva' || m.active === false) return;
    const d = new Date(m.created_at || m.updated_at);
    if (d.getMonth() !== now.getMonth() || d.getFullYear() !== now.getFullYear()) return;

    const email = emailByAgentId[m.evaluated_id];
    if (!email) return;
    counts[email] = (counts[email] || 0) + 1;
  });

  return counts;
}

/**
 * Busca o histórico de mensagens/diálogo de um ticket do Zendesk, junto com
 * os campos de classificação preenchidos pelo atendente no próprio ticket
 * (categoria, motivo do contato etc.) — usados como contexto extra na
 * avaliação com IA, sem preencher nada sozinhos na ficha.
 */
export interface TicketDialogueResult {
  comments: TicketCommentMessage[];
  ticketFields: { title: string; value: string }[];
  tags?: string[];
  organizationName?: string;
  organizationTags?: string[];
}

export type CustomerType = 'cliente_final' | 'revenda' | 'outro';

/**
 * Determina o tipo de cliente (Cliente Final vs Revenda) baseado nas tags do ticket
 * e da organização vindas do Zendesk.
 */
export function resolveCustomerType(tags: string[] = [], orgTags: string[] = []): CustomerType {
  const combined = [...tags, ...orgTags].map(t => (t || '').toLowerCase().trim());

  const isRevenda = combined.some(t => t === 'revenda' || t.includes('revenda'));
  if (isRevenda) return 'revenda';

  const isClienteFinal = combined.some(t =>
    t === 'cliente_final' ||
    t === 'clientefinal' ||
    t === 'cliente-final' ||
    t.includes('cliente_final') ||
    t.includes('cliente final') ||
    t === 'final'
  );
  if (isClienteFinal) return 'cliente_final';

  // Por padrão no ecossistema Webposto, clientes atendidos sem tag de revenda são tratados como Cliente Final
  return 'cliente_final';
}

/**
 * Seleciona automaticamente a Ficha e o Manual de atendimento apropriados
 * com base no tipo de cliente identificado pelas tags da organização/ticket.
 */
export function resolveFormAndGuidelineForCustomerType(
  customerType: CustomerType,
  forms: EvaluationForm[],
  guidelines: AIEvaluationGuideline[]
): { form: EvaluationForm | undefined; guideline: AIEvaluationGuideline | undefined } {
  let matchedForm: EvaluationForm | undefined;
  let matchedGuideline: AIEvaluationGuideline | undefined;

  if (customerType === 'cliente_final') {
    matchedForm = forms.find(f => f.active !== false && /cliente.*final/i.test(f.title))
      || forms.find(f => f.active !== false && /final/i.test(f.title));
    matchedGuideline = guidelines.find(g => g.active && /cliente.*final/i.test(g.title))
      || guidelines.find(g => g.active && /final/i.test(g.title));
  } else if (customerType === 'revenda') {
    matchedForm = forms.find(f => f.active !== false && /revenda/i.test(f.title));
    matchedGuideline = guidelines.find(g => g.active && /revenda/i.test(g.title));
  }

  // Fallback seguro se não encontrar pelo nome exato: primeiro ativo
  if (!matchedForm) {
    matchedForm = forms.find(f => f.active !== false) || forms[0];
  }
  if (!matchedGuideline) {
    matchedGuideline = guidelines.find(g => g.active) || guidelines[0];
  }

  return { form: matchedForm, guideline: matchedGuideline };
}

export async function fetchTicketDialogue(ticketId: string): Promise<TicketDialogueResult> {
  if (isMockMode || !supabase) {
    return {
      comments: [
        {
          id: 1,
          author_name: 'Cliente (Posto Exemplo)',
          author_role: 'end_user',
          created_at: new Date(Date.now() - 3600000 * 2).toISOString(),
          body: 'Boa tarde, estou com dificuldades para fechar o turno no PDV. Aparece erro 403 ao sincronizar vendas.',
          is_public: true
        },
        {
          id: 2,
          author_name: 'Suporte WebPosto',
          author_role: 'agent',
          created_at: new Date(Date.now() - 3600000 * 1.5).toISOString(),
          body: 'Olá! Boa tarde. Verifiquei aqui no servidor e liberei a permissão do seu usuário. Poderia tentar sincronizar novamente?',
          is_public: true
        },
        {
          id: 3,
          author_name: 'Cliente (Posto Exemplo)',
          author_role: 'end_user',
          created_at: new Date(Date.now() - 3600000 * 1).toISOString(),
          body: 'Deu certo agora! Muito obrigado pelo atendimento ágil!',
          is_public: true
        }
      ],
      ticketFields: [
        { title: 'Categoria', value: 'Suporte Técnico' },
        { title: 'Motivo do Contato', value: 'Erro de sincronização' }
      ],
      tags: ['cliente_final'],
      organizationName: 'Posto Exemplo',
      organizationTags: ['cliente_final']
    };
  }

  try {
    const { data, error } = await supabase.functions.invoke('helpdesk-queue', {
      body: { action: 'fetch_dialogue', ticket_id: ticketId }
    });

    if (error || !data?.comments) {
      throw new Error(error?.message || 'Falha ao obter diálogo do ticket');
    }

    const rawComments = (data.comments || []) as TicketCommentMessage[];
    const normalizedComments = normalizeTicketDialogue(rawComments);

    return {
      comments: normalizedComments,
      ticketFields: (data.ticket_fields || []) as { title: string; value: string }[],
      tags: Array.isArray(data.tags) ? data.tags : [],
      organizationName: data.organization_name,
      organizationTags: Array.isArray(data.organization_tags) ? data.organization_tags : [],
    };
  } catch (err: any) {
    console.error('[HelpdeskQueue] Erro ao carregar diálogo:', err);
    throw err;
  }
}

/**
 * Avalia o atendimento usando GLM 5.3 Flash via OpenRouter, baseado na ficha
 * de critérios, transcrição completa do ticket e dados do atendente/canal.
 * Em modo mock (offline) ou em caso de falha na API, cai no fallback local
 * para não travar o fluxo de triagem.
 */
export interface AIQueuedResult { queued: true; job_id: string }

export interface AuditorRecordGenerationInput {
  ticketId: string;
  form: EvaluationForm;
  score: number;
  answers: Record<string, 'SIM' | 'NAO' | 'NA'>;
  observations: Record<string, string>;
  criticalErrors: Record<string, boolean>;
  criticalErrorObservations: Record<string, string>;
}

export async function generateAuditorRecordWithAI(
  input: AuditorRecordGenerationInput,
): Promise<string> {
  if (isMockMode || !supabase) {
    throw new Error('A geração por IA não está disponível no modo offline.');
  }

  const { data, error } = await supabase.functions.invoke('helpdesk-queue', {
    body: {
      action: 'generate_auditor_record',
      ticket_id: input.ticketId,
      form_criteria: {
        sections: input.form.sections,
        critical_errors: input.form.critical_errors || [],
      },
      evaluation_context: {
        score: input.score,
        answers: input.answers,
        observations: input.observations,
        critical_errors: input.criticalErrors,
        critical_error_observations: input.criticalErrorObservations,
      },
    },
  });

  if (error) {
    throw new Error(data?.error || await extractFunctionErrorMessage(error, 'Falha ao gerar o registro do auditor.'));
  }

  const record = data?.result?.auditor_record;
  if (typeof record !== 'string' || !record.trim()) {
    throw new Error(data?.error || 'A IA não retornou um novo registro do auditor.');
  }

  return record.trim();
}

export async function evaluateTicketWithAI(
  ticketId: string,
  form: EvaluationForm,
  dialogue?: TicketCommentMessage[],
  agentInfo?: { name?: string; email?: string; team_name?: string; channel?: string },
  // Manuais escolhidos pelo monitor para essa avaliação específica — evita
  // enviar todo o conteúdo de todos os manuais ativos a cada chamada e
  // economiza tokens. [] = avaliar só com os critérios da ficha, sem manual.
  guidelineIds?: string[],
  // Campos de classificação do próprio ticket (categoria, motivo do
  // contato etc.) — contexto extra pra IA, não altera o schema de resposta.
  ticketFields?: { title: string; value: string }[],
  jobId?: string,
  draftMeta?: Record<string, unknown>,
): Promise<AIEvaluationResult | AIQueuedResult> {
  if (isMockMode || !supabase) {
    return getFallbackAIEvaluation(ticketId, form);
  }

  try {
    const { data, error } = await supabase.functions.invoke('helpdesk-queue', {
      body: {
        action: 'evaluate_ai',
        ticket_id: ticketId,
        form_criteria: { sections: form.sections },
        dialogue: dialogue || [],
        agent_info: agentInfo,
        guideline_ids: guidelineIds,
        ticket_fields: ticketFields,
        job_id: jobId,
        draft_meta: draftMeta,
      }
    });

    if (error) {
      throw new Error(await extractFunctionErrorMessage(error, 'Erro de comunicação com a IA'));
    }

    if (data?.queued === true && typeof data.job_id === 'string') return { queued: true, job_id: data.job_id };
    if (!data?.result) {
      throw new Error(data?.error || 'A IA não retornou resultado para este ticket');
    }

    const result = data.result as AIEvaluationResult;
    if (data?.technical) {
      result.fallback_used = Boolean(data.technical.fallbackUsed);
      result.model = data.technical.model;
    }
    return result;
  } catch (err: any) {
    console.error('[HelpdeskQueue] Erro ao chamar avaliação com IA:', err);
    throw err;
  }
}

/**
 * Fallback local (sem chamada externa) usado em modo mock ou quando a
 * integração externa está indisponível no modo mock — nunca bloqueia a
 * triagem, mas deixa claro que não é uma avaliação real da IA.
 */
function getFallbackAIEvaluation(ticketId: string, form: EvaluationForm): AIEvaluationResult {
  const suggestedAnswers: Record<string, 'SIM' | 'NAO' | 'NA'> = {};
  const suggestedObs: Record<string, string> = {};
  const suggestedCritErrors: Record<string, boolean> = {};

  form.sections.forEach(section => {
    section.questions.forEach(q => {
      suggestedAnswers[q.id] = 'SIM';
      suggestedObs[q.id] = 'Sugestão automática indisponível (IA offline) — revisar manualmente antes de concluir.';
      if (q.is_critical) {
        suggestedCritErrors[q.id] = false;
      }
    });
  });

  return {
    score: 0,
    summary: `Não foi possível obter a avaliação da IA para o ticket #${ticketId} (serviço de IA indisponível ou em modo offline). Preencha manualmente.`,
    strengths: [],
    improvements: ['Avaliação com IA indisponível no momento — revisar o atendimento manualmente.'],
    suggested_answers: suggestedAnswers,
    suggested_observations: suggestedObs,
    suggested_critical_errors: suggestedCritErrors
  };
}

/**
 * Avaliação de conformidade de abertura de Chamados Filhos com IA
 * (Nova Demanda, Enviar para Análise Técnica, Apoio Análise Técnica e Produtividade).
 */
export async function evaluateChildTicketWithAI(
  ticketId: string,
  ticketSubject: string,
  dialogue?: TicketCommentMessage[],
  ticketFields?: { title: string; value: string }[],
  macroType?: ChildTicketMacroType,
  jobId?: string,
  ticketStatus?: string,
): Promise<ChildTicketAiEvaluation | AIQueuedResult> {
  if (isMockMode || !supabase) {
    return getFallbackChildTicketEvaluation(ticketId, macroType);
  }

  try {
    const { data, error } = await supabase.functions.invoke('helpdesk-queue', {
      body: {
        action: 'evaluate_child_ticket',
        ticket_id: ticketId,
        ticket_subject: ticketSubject,
        ticket_status: ticketStatus,
        dialogue: dialogue || [],
        ticket_fields: ticketFields,
        macro_type: macroType,
        job_id: jobId,
      }
    });

    if (error) throw new Error(data?.error || await extractFunctionErrorMessage(error, 'Falha de comunicação com a IA.'));
    if (data?.queued === true && typeof data.job_id === 'string') return { queued: true, job_id: data.job_id };
    if (!data?.result) throw new Error(data?.error || 'A IA não retornou resultado.');

    const result = data.result as ChildTicketAiEvaluation;
    if (data?.technical) {
      result.fallback_used = Boolean(data.technical.fallbackUsed);
      result.model = data.technical.model;
    }
    return result;
  } catch (err) {
    console.error('[HelpdeskQueue] Erro ao chamar avaliação de chamado filho com IA:', err);
    throw err;
  }
}

function getFallbackChildTicketEvaluation(ticketId: string, macroType?: ChildTicketMacroType): ChildTicketAiEvaluation {
  return {
    detected_type: macroType || 'analise_tecnica',
    status: 'conforme',
    score: 100,
    summary: `Conferência automática prévia para o chamado filho #${ticketId}. Os quesitos operacionais de assunto, texto da macro e direcionamento foram validados.`,
    checks: [
      { question_id: 'child-subject-preserved', answer: 'SIM', rule: "Assunto da Abertura e Macro de Resolvido", passed: true, details: "O assunto da abertura é válido; alterações automáticas pela macro de resolvido também são aceitas." },
      { question_id: 'child-parent-linked', answer: 'SIM', rule: 'Vínculo com o chamado pai', passed: true, details: 'Cenário de demonstração: chamado pai vinculado corretamente.' },
      { question_id: 'child-macro-preserved', answer: 'SIM', rule: "Preservação do Texto da Macro", passed: true, details: "O texto-base da macro foi mantido integralmente, complementado com as informações técnicas do atendimento." },
      { question_id: 'child-macro-enriched', answer: 'SIM', rule: 'Detalhes técnicos complementares', passed: true, details: 'Cenário de demonstração: testes e evidências técnicas registrados.' },
      { question_id: 'child-routing-correct', answer: 'SIM', rule: "Direcionamento Correto ('Para')", passed: true, details: "Encaminhado corretamente para o grupo técnico especialista / fila responsável." }
    ],
    recommendations: ["Conferência preliminar aprovada. Revise os logs e evidências técnicas anexadas antes de concluir a validação."]
  };
}

/**
 * Mock data para demonstração e desenvolvimento offline
 */
/**
 * Cadastra (ou encontra, se o e-mail já existir) um agente do helpdesk
 * ainda não formalizado no QualiTrack, direto da ficha de monitoria — sem
 * precisar passar pela triagem automática. Cria uma conta provisória
 * (papel Atendente de Suporte) que é herdada automaticamente quando o
 * atendente completar o onboarding formal com o mesmo e-mail.
 */
export async function resolveManualAgent(
  email: string,
  name: string | undefined,
  teamId: string | undefined
): Promise<{ id: string; team_id?: string }> {
  if (isMockMode || !supabase) {
    throw new Error('Não é possível cadastrar agentes em modo mock/offline.');
  }

  const { data, error } = await supabase.functions.invoke('helpdesk-queue', {
    body: { action: 'resolve_agent', agent_email: email, agent_name: name, team_id: teamId }
  });

  if (error || !data?.agent?.id) {
    throw new Error(data?.error || await extractFunctionErrorMessage(error, 'Falha ao cadastrar o agente.'));
  }

  return data.agent as { id: string; team_id?: string };
}

/**
 * Completa a equipe de um agente já cadastrado, mas sem `primary_team_id`
 * — disparado logo após salvar QUALQUER monitoria (não só as vindas da
 * Central de Filas), pra pegar também agentes selecionados direto no
 * dropdown "Avaliado", que nunca passam pelo fluxo automático de resolução
 * por ticket. Best-effort: nunca sobrescreve equipe já definida, e uma
 * falha aqui não deve travar o fluxo de salvar a monitoria (por isso não
 * lança erro, só loga).
 */
export async function backfillAgentTeam(evaluatedId: string, teamId: string): Promise<void> {
  if (isMockMode || !supabase || !evaluatedId || !teamId) return;

  try {
    const { error } = await supabase.functions.invoke('helpdesk-queue', {
      body: { action: 'backfill_agent_team', evaluated_id: evaluatedId, team_id: teamId }
    });
    if (error) {
      console.warn('[HelpdeskQueue] Falha ao completar equipe do agente:', error.message);
    }
  } catch (err) {
    console.warn('[HelpdeskQueue] Erro ao completar equipe do agente:', err);
  }
}

export interface TicketAgentLookup {
  name: string;
  email: string;
  team_name?: string;
  channel?: string;
  /** Se já existir uma conta com esse e-mail no QualiTrack, o id dela. */
  existing_id?: string | null;
  existing_team_id?: string | null;
  ticket_group_team_id?: string | null;
}

/**
 * Busca no Zendesk quem é o atendente responsável por um ticket digitado
 * manualmente na ficha (fora do fluxo da Central de Filas) — não cria nada
 * no banco, é só consulta, para poder sugerir o nome/e-mail mesmo que o
 * atendente ainda não tenha conta formal no QualiTrack.
 */
export async function lookupTicketAgent(ticketId: string): Promise<TicketAgentLookup | null> {
  if (isMockMode || !supabase || !/^\d+$/.test(ticketId.trim())) {
    return null;
  }

  try {
    const { data, error } = await supabase.functions.invoke('helpdesk-queue', {
      body: { action: 'lookup_ticket_agent', ticket_id: ticketId.trim() }
    });

    if (error || !data?.success) return null;
    return (data.agent as TicketAgentLookup) || null;
  } catch (err) {
    console.warn('[HelpdeskQueue] Falha ao buscar agente do ticket:', err);
    return null;
  }
}

export interface ZendeskTicketDetails {
  ticket_kind?: 'atendimento' | 'chamado_filho';
  child_evaluation?: ChildTicketAiEvaluation | null;
  ticket_id: string;
  subject: string;
  description: string;
  status: string;
  channel?: string;
  created_at: string;
  satisfaction_rating?: {
    score: string;
    comment?: string;
  } | null;
  satisfaction_result: 'Positiva' | 'Negativa' | 'Sem pesquisa';
  tags: string[];
  agent?: {
    id: number;
    name: string;
    email: string;
  } | null;
  requester?: {
    id: number;
    name: string;
    email: string;
  } | null;
  organization_name?: string | null;
  group_name?: string | null;
  ticket_group_team_id?: string | null;
  matched_agent?: {
    id: string;
    name: string;
    email: string;
    primary_team_id?: string | null;
    team_ids?: string[];
  } | null;
  matched_team_id?: string | null;
}

export interface LookupTicketResult {
  found: boolean;
  ticket?: ZendeskTicketDetails;
  message?: string;
  error?: boolean;
}

/**
 * Busca completa de um chamado no Zendesk pelo ID (ou URL).
 * Usado pelo fluxo inteligente do botão "Nova Monitoria" para validar
 * se o chamado existe, identificar duplicidades e permitir avaliação
 * assistida com IA ou preenchimento manual guiado.
 */
export async function lookupTicketFromHelpdesk(ticketId: string): Promise<LookupTicketResult> {
  const cleanId = ticketId.replace(/\D/g, '').trim();
  if (!cleanId) {
    return { found: false, message: 'Número de ticket inválido.' };
  }

  if (isMockMode || !supabase) {
    // Simulação rica em mock mode
    await new Promise(r => setTimeout(r, 600));
    return {
      found: true,
      ticket: {
        ticket_id: cleanId,
        subject: `Atendimento ao Cliente - Suporte WebPosto #${cleanId}`,
        description: 'Cliente entrou em contato solicitando auxílio no fechamento de caixa e conferência de turnos.',
        status: 'solved',
        channel: 'Chat',
        created_at: new Date(Date.now() - 3600000 * 24).toISOString(),
        satisfaction_rating: {
          score: 'unoffered',
          comment: undefined
        },
        satisfaction_result: 'Sem pesquisa',
        tags: ['cliente_final', 'suporte_pdv', 'fechamento_caixa'],
        agent: {
          id: 9991,
          name: 'Ana Suporte',
          email: 'ana.suporte@empresa.com.br',
        },
        requester: {
          id: 8881,
          name: 'Carlos Gerente (Posto Ipiranga Centro)',
          email: 'carlos@postoipiranga.com.br',
        },
        organization_name: 'Rede Posto Centro Ltda',
        group_name: 'Suporte N1 - PDV',
        matched_agent: null,
        matched_team_id: null,
      }
    };
  }

  try {
    const { data, error } = await supabase.functions.invoke('helpdesk-queue', {
      body: { action: 'lookup_ticket', ticket_id: cleanId }
    });

    if (error) {
      const msg = await extractFunctionErrorMessage(error, 'Falha ao consultar chamado no Zendesk.');
      return { found: false, message: msg, error: true };
    }

    if (!data?.found || !data?.ticket) {
      return { found: false, message: data?.message || 'Chamado não encontrado no Zendesk.' };
    }

    return {
      found: true,
      ticket: data.ticket as ZendeskTicketDetails,
    };
  } catch (err: any) {
    console.error('[HelpdeskQueue] Erro ao buscar chamado no Zendesk:', err);
    return { found: false, message: err?.message || 'Erro de conexão com o helpdesk.', error: true };
  }
}
