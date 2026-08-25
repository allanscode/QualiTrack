import { supabase, isMockMode } from './supabase';
import {
  AuditingQueueType,
  AuditingQueueTicket,
  AgentQueueSummary,
  TicketCommentMessage,
  AIEvaluationResult,
  User,
  Monitoria,
  EvaluationForm
} from '../types';

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

/**
 * Busca tickets das filas do Zendesk (Negativas, Proativas ou Positivas).
 */
export async function fetchQueueTickets(
  type: AuditingQueueType,
  existingMonitorias: Monitoria[] = []
): Promise<AuditingQueueTicket[]> {
  const auditedTicketIds = new Set(
    existingMonitorias.map(m => m.ticket_id?.trim()).filter(Boolean)
  );

  let tickets: AuditingQueueTicket[];

  if (isMockMode || !supabase) {
    tickets = getMockQueueTickets(type, auditedTicketIds);
  } else {
    try {
      const { data, error } = await supabase.functions.invoke('helpdesk-queue', {
        body: { action: 'fetch_queue', queue_type: type }
      });

      if (error || !data?.tickets) {
        console.warn(`[HelpdeskQueue] Falha ao consultar Edge Function helpdesk-queue (${error?.message}). Usando fallback.`);
        tickets = getMockQueueTickets(type, auditedTicketIds);
      } else {
        tickets = (data.tickets as AuditingQueueTicket[]).map(t => ({
          ...t,
          already_audited: auditedTicketIds.has(t.ticket_id.trim())
        }));
      }
    } catch (err) {
      console.error('[HelpdeskQueue] Erro na requisição:', err);
      tickets = getMockQueueTickets(type, auditedTicketIds);
    }
  }

  // Fila de Negativas: chamados já validados (macro/tag aplicada no Zendesk,
  // filtrada na Edge Function) ou que já possuem monitoria registrada no
  // QualiTrack não devem mais aparecer — a apuração já foi concluída.
  if (type === 'negativas') {
    tickets = tickets.filter(t => !t.already_audited);
  }

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

  return tickets;
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
 * Busca o histórico de mensagens/diálogo de um ticket do Zendesk.
 */
export async function fetchTicketDialogue(ticketId: string): Promise<TicketCommentMessage[]> {
  if (isMockMode || !supabase) {
    return [
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
    ];
  }

  try {
    const { data, error } = await supabase.functions.invoke('helpdesk-queue', {
      body: { action: 'fetch_dialogue', ticket_id: ticketId }
    });

    if (error || !data?.comments) {
      throw new Error(error?.message || 'Falha ao obter diálogo do ticket');
    }

    return data.comments as TicketCommentMessage[];
  } catch (err: any) {
    console.error('[HelpdeskQueue] Erro ao carregar diálogo:', err);
    throw err;
  }
}

/**
 * Avalia o atendimento usando IA (Google Gemini 2.5 Flash) baseado na ficha
 * de critérios, transcrição completa do ticket e dados do atendente/canal.
 * Em modo mock (offline) ou em caso de falha na API, cai no fallback local
 * para não travar o fluxo de triagem.
 */
export async function evaluateTicketWithAI(
  ticketId: string,
  form: EvaluationForm,
  dialogue?: TicketCommentMessage[],
  agentInfo?: { name?: string; email?: string; team_name?: string; channel?: string },
  // Manuais escolhidos pelo monitor para essa avaliação específica — evita
  // enviar todo o conteúdo de todos os manuais ativos a cada chamada e
  // economiza tokens. [] = avaliar só com os critérios da ficha, sem manual.
  guidelineIds?: string[]
): Promise<AIEvaluationResult> {
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
      }
    });

    if (error || !data?.result) {
      console.warn(`[HelpdeskQueue] Falha ao avaliar com Gemini (${error?.message}). Usando fallback local.`);
      return getFallbackAIEvaluation(ticketId, form);
    }

    return data.result as AIEvaluationResult;
  } catch (err) {
    console.error('[HelpdeskQueue] Erro ao chamar avaliação com IA:', err);
    return getFallbackAIEvaluation(ticketId, form);
  }
}

/**
 * Fallback local (sem chamada externa) usado em modo mock ou quando a
 * integração com o Gemini falha/está indisponível — nunca bloqueia a
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
    summary: `Não foi possível obter a avaliação da IA para o ticket #${ticketId} (Gemini indisponível ou em modo offline). Preencha manualmente.`,
    strengths: [],
    improvements: ['Avaliação com IA indisponível no momento — revisar o atendimento manualmente.'],
    suggested_answers: suggestedAnswers,
    suggested_observations: suggestedObs,
    suggested_critical_errors: suggestedCritErrors
  };
}

/**
 * Mock data para demonstração e desenvolvimento offline
 */
function getMockQueueTickets(type: AuditingQueueType, auditedIds: Set<string>): AuditingQueueTicket[] {
  const now = new Date();

  if (type === 'negativas') {
    return [
      {
        ticket_id: '154159',
        subject: 'Erro ao emitir NFC-e em contingência após atualização',
        requester_name: 'Posto Estrela do Sul (Carlos)',
        agent_name: 'Gabriel Dias',
        agent_email: 'gabriel.dias@webposto.com.br',
        csat_status: 'bad',
        csat_comment: 'Demorou muito para responder e o sistema travou o caixa na hora do pico.',
        channel: 'Chat',
        ticket_date: new Date(now.getTime() - 1000 * 3600 * 4).toISOString(),
        status: 'solved',
        url: 'https://webposto.zendesk.com/agent/tickets/154159',
        already_audited: auditedIds.has('154159')
      },
      {
        ticket_id: '154230',
        subject: 'Problema na integração TEF com PinPad',
        requester_name: 'Auto Posto Alvorada',
        agent_name: 'João Suporte (Auditado)',
        agent_email: 'suporte@teste.com',
        csat_status: 'bad',
        csat_comment: 'Atendente encerrou o chat antes de confirmar se a transação passou.',
        channel: 'Chat',
        ticket_date: new Date(now.getTime() - 1000 * 3600 * 8).toISOString(),
        status: 'solved',
        url: 'https://webposto.zendesk.com/agent/tickets/154230',
        already_audited: auditedIds.has('154230')
      }
    ];
  }

  if (type === 'positivas') {
    return [
      {
        ticket_id: '154509',
        subject: 'Dúvida sobre cadastro de novos bicos de abastecimento',
        requester_name: 'Posto Pioneiro (Mariana)',
        agent_name: 'João Suporte (Auditado)',
        agent_email: 'suporte@teste.com',
        csat_status: 'good',
        csat_comment: 'Excelente atendimento! Muito paciente e explicou o passo a passo com clareza.',
        channel: 'WhatsApp',
        ticket_date: new Date(now.getTime() - 1000 * 3600 * 5).toISOString(),
        status: 'closed',
        url: 'https://webposto.zendesk.com/agent/tickets/154509',
        already_audited: auditedIds.has('154509')
      },
      {
        ticket_id: '154610',
        subject: 'Configuração de impressora de cupom não fiscal',
        requester_name: 'Posto Rota 101',
        agent_name: 'Gabriel Dias',
        agent_email: 'gabriel.dias@webposto.com.br',
        csat_status: 'good',
        csat_comment: 'Resolvido em menos de 5 minutos, parabéns à equipe!',
        channel: 'Chat',
        ticket_date: new Date(now.getTime() - 1000 * 3600 * 12).toISOString(),
        status: 'closed',
        url: 'https://webposto.zendesk.com/agent/tickets/154610',
        already_audited: auditedIds.has('154610')
      }
    ];
  }

  // Proativas (CSAT Vazio / Unrated)
  return [
    {
      ticket_id: '154780',
      subject: 'Ajuste no relatório de fechamento de caixa por operador',
      requester_name: 'Posto São Lucas',
      agent_name: 'João Suporte (Auditado)',
      agent_email: 'suporte@teste.com',
      csat_status: 'unrated',
      channel: 'Email',
      ticket_date: new Date(now.getTime() - 1000 * 3600 * 6).toISOString(),
      status: 'solved',
      url: 'https://webposto.zendesk.com/agent/tickets/154780',
      already_audited: auditedIds.has('154780')
    },
    {
      ticket_id: '154812',
      subject: 'Reenvio de XML para contabilidade mês anterior',
      requester_name: 'Posto Central Park',
      agent_name: 'Gabriel Dias',
      agent_email: 'gabriel.dias@webposto.com.br',
      csat_status: 'unrated',
      channel: 'WhatsApp',
      ticket_date: new Date(now.getTime() - 1000 * 3600 * 14).toISOString(),
      status: 'closed',
      url: 'https://webposto.zendesk.com/agent/tickets/154812',
      already_audited: auditedIds.has('154812')
    }
  ];
}

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
    throw new Error(data?.error || error?.message || 'Falha ao cadastrar o agente.');
  }

  return data.agent as { id: string; team_id?: string };
}
