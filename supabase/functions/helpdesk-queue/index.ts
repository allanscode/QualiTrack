import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('FRONTEND_URL') || '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Tag aplicada (via macro do Zendesk) quando um chamado negativo já foi
// apurado/validado pela qualidade. Chamados com essa tag saem da fila.
// Sem a secret configurada, NÃO filtramos por tag nenhuma — um nome de tag
// chutado poderia deixar passar negativas que na verdade não foram validadas.
const VALIDATED_TAG = Deno.env.get('HELPDESK_VALIDATED_TAG') || '';

// IDs das views salvas do Zendesk (Admin Center > Views > abrir a view >
// número no final da URL). Quando configuradas, cada fila busca exatamente
// os tickets da view correspondente — já filtrados pela lógica que a
// qualidade mantém lá dentro (ex.: negativas ainda não validadas) — em vez
// de reconstruir o filtro via Search API e arriscar divergir da contagem
// real que a equipe vê no Zendesk.
const NEGATIVE_VIEW_ID = Deno.env.get('HELPDESK_NEGATIVE_VIEW_ID') || '';
const POSITIVE_VIEW_ID = Deno.env.get('HELPDESK_POSITIVE_VIEW_ID') || '';

const RequestSchema = z.object({
  action: z.enum(['fetch_queue', 'fetch_dialogue', 'evaluate_ai']),
  queue_type: z.enum(['negativas', 'proativas', 'positivas']).optional(),
  ticket_id: z.string().optional(),
  form_criteria: z.any().optional(),
  dialogue: z.array(z.any()).optional(),
  agent_info: z.object({
    name: z.string().optional(),
    email: z.string().optional(),
    team_name: z.string().optional(),
    channel: z.string().optional(),
  }).optional(),
});

function jsonResponse(body: any, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/**
 * Garante que exista um usuário QualiTrack correspondente ao e-mail do
 * atendente vindo do helpdesk. Nunca depende de listas locais fixas: usa
 * o e-mail como chave universal de correlação e `external_id`/`source_system`
 * como metadados agnósticos de provider (ver SPEC de mapeamento de agentes).
 * Se o atendente ainda não existe no QualiTrack, cria uma conta provisória
 * (sem senha, sem convite) que é herdada automaticamente quando ele concluir
 * o onboarding formal com o mesmo e-mail (trigger `handle_new_user`).
 */
async function resolveOrCreateAgent(
  supabase: ReturnType<typeof createClient>,
  email: string | undefined,
  name: string | undefined,
  externalId: string | number | undefined,
  sourceSystem: string,
  teamName: string | undefined
): Promise<{ id?: string; team_id?: string } | null> {
  if (!email) return null;
  const normalizedEmail = email.trim().toLowerCase();

  const { data: existing } = await supabase
    .from('users')
    .select('id, primary_team_id, team_ids')
    .eq('email', normalizedEmail)
    .maybeSingle();

  if (existing) {
    return { id: existing.id as string, team_id: (existing.primary_team_id as string) || (existing.team_ids as string[] | null)?.[0] };
  }

  // Tenta casar a equipe pelo nome do grupo/time do helpdesk (best-effort).
  let teamId: string | undefined;
  if (teamName) {
    const { data: team } = await supabase
      .from('teams')
      .select('id')
      .ilike('name', teamName)
      .maybeSingle();
    teamId = team?.id as string | undefined;
  }

  const { data: created, error: createError } = await supabase
    .from('users')
    .insert({
      email: normalizedEmail,
      name: name || normalizedEmail.split('@')[0],
      role: 'suporte',
      active: true,
      must_change_password: false,
      external_id: externalId != null ? String(externalId) : null,
      source_system: sourceSystem,
      is_provisional: true,
      primary_team_id: teamId || null,
      team_ids: teamId ? [teamId] : [],
    })
    .select('id')
    .single();

  if (createError) {
    console.error('[helpdesk-queue] Falha ao criar agente provisório:', createError.message);
    return teamId ? { team_id: teamId } : null;
  }

  return { id: created.id as string, team_id: teamId };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return jsonResponse({ error: 'Token de autenticação não fornecido' }, 401);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Valida o usuário autenticado
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return jsonResponse({ error: 'Sessão inválida ou expirada' }, 401);
    }

    const body = await req.json().catch(() => ({}));
    const parseResult = RequestSchema.safeParse(body);

    if (!parseResult.success) {
      return jsonResponse({ error: 'Payload inválido', details: parseResult.error.flatten() }, 400);
    }

    const { action, queue_type, ticket_id } = parseResult.data;

    // 3. Avaliação com IA (Google Gemini) — não depende do Zendesk
    if (action === 'evaluate_ai') {
      return await handleEvaluateAI(parseResult.data);
    }

    const subdomain = Deno.env.get('ZENDESK_SUBDOMAIN');
    const email = Deno.env.get('ZENDESK_EMAIL');
    const apiToken = Deno.env.get('ZENDESK_API_TOKEN');

    if (!subdomain || !email || !apiToken) {
      return jsonResponse({
        error: 'Credenciais do Zendesk não configuradas no Supabase Secrets'
      }, 500);
    }

    const zendeskAuth = btoa(`${email}/token:${apiToken}`);
    const zendeskHeaders = {
      Authorization: `Basic ${zendeskAuth}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };

    // 1. Busca de Fila de Chamados
    if (action === 'fetch_queue') {
      let results: any[];
      let sideloadedUsers: Map<number, any>;
      let sideloadedGroups: Map<number, any>;

      // Negativas/Positivas: quando a view real do Zendesk está configurada,
      // busca exatamente os tickets dela (mesma contagem que a equipe vê lá
      // dentro), em vez de reconstruir o filtro via Search API.
      const viewId = queue_type === 'negativas' ? NEGATIVE_VIEW_ID
        : queue_type === 'positivas' ? POSITIVE_VIEW_ID
        : '';

      if (viewId) {
        const viewUrl = `https://${subdomain}.zendesk.com/api/v2/views/${viewId}/tickets.json?include=users,groups`;
        const response = await fetch(viewUrl, { headers: zendeskHeaders });

        if (!response.ok) {
          const errText = await response.text().catch(() => '');
          throw new Error(`Zendesk Views API falhou (${response.status}): ${errText}`);
        }

        const viewData = await response.json();
        results = viewData.tickets || [];
        sideloadedUsers = new Map<number, any>((viewData.users || []).map((u: any) => [u.id, u]));
        sideloadedGroups = new Map<number, any>((viewData.groups || []).map((g: any) => [g.id, g]));
      } else {
        let searchQuery = 'type:ticket';

        if (queue_type === 'negativas') {
          searchQuery += ' satisfaction_score:bad satisfaction_score:bad_with_comment';
          // Chamados já apurados/validados pela qualidade (tag aplicada via
          // macro) saem da fila — só filtra se a tag real estiver configurada.
          if (VALIDATED_TAG) {
            searchQuery += ` -tags:${VALIDATED_TAG}`;
          }
        } else if (queue_type === 'positivas') {
          searchQuery += ' satisfaction_score:good satisfaction_score:good_with_comment';
        } else {
          // Proativas: tickets resolvidos sem pesquisa ou com pesquisa pendente
          searchQuery += ' status:solved status:closed';
        }

        // Sideload de usuários e grupos para resolver o atendente (nome/e-mail)
        // e a equipe de origem de cada chamado, sem depender de lista local.
        const searchUrl = `https://${subdomain}.zendesk.com/api/v2/search.json?query=${encodeURIComponent(searchQuery)}&sort_by=created_at&sort_order=desc&include=users,groups`;
        const response = await fetch(searchUrl, { headers: zendeskHeaders });

        if (!response.ok) {
          const errText = await response.text().catch(() => '');
          throw new Error(`Zendesk Search API falhou (${response.status}): ${errText}`);
        }

        const searchData = await response.json();
        results = searchData.results || [];
        sideloadedUsers = new Map<number, any>((searchData.users || []).map((u: any) => [u.id, u]));
        sideloadedGroups = new Map<number, any>((searchData.groups || []).map((g: any) => [g.id, g]));
      }

      // Resolve/garante o vínculo do agente no QualiTrack pelo e-mail (chave
      // universal), criando conta provisória quando necessário.
      const mappedTickets = await Promise.all(results.map(async (t: any) => {
        let csatStatus: 'bad' | 'good' | 'unrated' = 'unrated';
        if (t.satisfaction_rating?.score === 'bad' || t.satisfaction_rating?.score === 'bad_with_comment') {
          csatStatus = 'bad';
        } else if (t.satisfaction_rating?.score === 'good' || t.satisfaction_rating?.score === 'good_with_comment') {
          csatStatus = 'good';
        }

        const assignee = t.assignee_id ? sideloadedUsers.get(t.assignee_id) : undefined;
        const group = t.group_id ? sideloadedGroups.get(t.group_id) : undefined;

        const agentLink = await resolveOrCreateAgent(
          supabase,
          assignee?.email,
          assignee?.name,
          assignee?.id,
          'zendesk',
          group?.name
        );

        return {
          ticket_id: String(t.id),
          subject: t.subject || 'Sem assunto',
          channel: t.via?.channel || 'chat',
          csat_status: csatStatus,
          csat_comment: t.satisfaction_rating?.comment || undefined,
          ticket_date: t.created_at || new Date().toISOString(),
          status: t.status || 'solved',
          url: `https://${subdomain}.zendesk.com/agent/tickets/${t.id}`,
          agent_name: assignee?.name,
          agent_email: assignee?.email,
          agent_id: agentLink?.id,
          team_id: agentLink?.team_id,
        };
      }));

      return jsonResponse({ success: true, tickets: mappedTickets }, 200);
    }

    // 2. Busca de Histórico / Diálogo do Chamado
    if (action === 'fetch_dialogue') {
      if (!ticket_id) {
        return jsonResponse({ error: 'ticket_id é obrigatório para fetch_dialogue' }, 400);
      }

      const commentsUrl = `https://${subdomain}.zendesk.com/api/v2/tickets/${ticket_id}/comments.json`;
      const response = await fetch(commentsUrl, { headers: zendeskHeaders });

      if (!response.ok) {
        const errText = await response.text().catch(() => '');
        throw new Error(`Zendesk Comments API falhou (${response.status}): ${errText}`);
      }

      const commentsData = await response.json();
      const comments = commentsData.comments || [];

      const mappedComments = comments.map((c: any) => ({
        id: c.id,
        author_role: c.public ? 'agent' : 'system',
        created_at: c.created_at,
        body: c.body || c.html_body || '',
        is_public: c.public !== false,
      }));

      return jsonResponse({ success: true, comments: mappedComments }, 200);
    }

    return jsonResponse({ error: 'Ação não suportada' }, 400);
  } catch (error: any) {
    console.error('[helpdesk-queue] Erro:', error);
    return jsonResponse({ error: error.message || 'Erro interno do servidor' }, 500);
  }
});

/**
 * Avalia um atendimento com um modelo gratuito via OpenRouter (API
 * compatível com o formato OpenAI Chat Completions), usando
 * response_format: json_schema para forçar retorno em JSON estrito,
 * alinhado aos critérios da ficha de monitoria enviada pelo front-end.
 */
async function handleEvaluateAI(payload: z.infer<typeof RequestSchema>): Promise<Response> {
  const { ticket_id, form_criteria, dialogue, agent_info } = payload;

  if (!ticket_id || !form_criteria?.sections) {
    return jsonResponse({ error: 'ticket_id e form_criteria são obrigatórios para evaluate_ai' }, 400);
  }

  const openRouterApiKey = Deno.env.get('OPENROUTER_API_KEY');
  const openRouterModel = Deno.env.get('OPENROUTER_MODEL') || 'nvidia/nemotron-3-super-120b-a12b:free';

  if (!openRouterApiKey) {
    return jsonResponse({ error: 'OPENROUTER_API_KEY não configurada no Supabase Secrets' }, 500);
  }

  // Monta o JSON Schema dinamicamente a partir das perguntas da ficha,
  // garantindo que a IA responda nota/justificativa para cada critério.
  const questionProperties: Record<string, any> = {};
  const questionRequired: string[] = [];

  for (const section of form_criteria.sections) {
    for (const q of section.questions || []) {
      const props: Record<string, any> = {
        answer: { type: 'string', enum: ['SIM', 'NAO', 'NA'] },
        justification: { type: 'string', description: 'Justificativa citando trecho literal do diálogo.' },
      };
      const required = ['answer', 'justification'];
      if (q.is_critical) {
        props.critical_error = { type: 'boolean', description: 'true se o erro crítico ocorreu.' };
        required.push('critical_error');
      }
      questionProperties[q.id] = { type: 'object', properties: props, required, additionalProperties: false };
      questionRequired.push(q.id);
    }
  }

  const responseSchema = {
    type: 'object',
    properties: {
      score: { type: 'number', description: 'Nota geral do atendimento de 0 a 100.' },
      summary: { type: 'string', description: 'Resumo executivo do atendimento.' },
      strengths: { type: 'array', items: { type: 'string' }, description: 'Pontos fortes observados.' },
      improvements: { type: 'array', items: { type: 'string' }, description: 'Oportunidades de melhoria.' },
      answers: { type: 'object', properties: questionProperties, required: questionRequired, additionalProperties: false },
    },
    required: ['score', 'summary', 'strengths', 'improvements', 'answers'],
    additionalProperties: false,
  };

  const dialogueText = (dialogue || [])
    .map((m: any) => `[${m.author_role === 'agent' ? 'ATENDENTE' : m.author_role === 'end_user' ? 'CLIENTE' : 'SISTEMA'}] ${m.author_name || ''}: ${m.body}`)
    .join('\n');

  const criteriaText = form_criteria.sections
    .map((s: any) => `Seção "${s.title}":\n${(s.questions || []).map((q: any) => `- [${q.id}] ${q.text}${q.is_critical ? ' (ERRO CRÍTICO)' : ''}`).join('\n')}`)
    .join('\n\n');

  const prompt = `Você é um analista sênior de qualidade de atendimento ao cliente da WebPosto.
Avalie o atendimento abaixo com base estritamente na ficha de critérios fornecida.

DADOS DO ATENDIMENTO:
- Atendente: ${agent_info?.name || 'não informado'}
- E-mail: ${agent_info?.email || 'não informado'}
- Equipe: ${agent_info?.team_name || 'não informada'}
- Canal: ${agent_info?.channel || 'não informado'}
- Ticket: #${ticket_id}

CRITÉRIOS DA FICHA DE MONITORIA:
${criteriaText}

TRANSCRIÇÃO COMPLETA DO ATENDIMENTO:
${dialogueText || '(sem mensagens registradas)'}

Para cada critério, responda SIM, NAO ou NA e justifique citando um trecho literal do diálogo sempre que possível.
Calcule a nota geral (score de 0 a 100) com base nas respostas. Produza um resumo executivo objetivo, com pontos
fortes e oportunidades de melhoria concretas, baseadas apenas no que está na transcrição.`;

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${openRouterApiKey}`,
        // Cabeçalhos recomendados pelo OpenRouter para identificar a app
        // (não obrigatórios, mas ajudam a evitar throttling nos modelos :free).
        'HTTP-Referer': Deno.env.get('FRONTEND_URL') || 'https://qualitrack.app',
        'X-Title': 'QualiTrack',
      },
      body: JSON.stringify({
        model: openRouterModel,
        temperature: 0.2,
        messages: [{ role: 'user', content: prompt }],
        response_format: {
          type: 'json_schema',
          json_schema: { name: 'avaliacao_atendimento', strict: true, schema: responseSchema },
        },
      }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error(`OpenRouter API falhou (${response.status}): ${errText}`);
    }

    const data = await response.json();
    let text: string | undefined = data.choices?.[0]?.message?.content;
    if (!text) {
      throw new Error('Resposta vazia da IA (modelo pode ter recusado ou atingido limite gratuito)');
    }

    // Alguns modelos gratuitos ignoram o strict mode e envolvem o JSON em
    // um bloco markdown (```json ... ```) — remove antes de fazer o parse.
    text = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();

    const parsed = JSON.parse(text);

    const suggested_answers: Record<string, string> = {};
    const suggested_observations: Record<string, string> = {};
    const suggested_critical_errors: Record<string, boolean> = {};

    for (const [qId, value] of Object.entries<any>(parsed.answers || {})) {
      suggested_answers[qId] = value.answer;
      suggested_observations[qId] = value.justification;
      if (value.critical_error !== undefined) {
        suggested_critical_errors[qId] = value.critical_error;
      }
    }

    return jsonResponse({
      success: true,
      result: {
        score: parsed.score,
        summary: parsed.summary,
        strengths: parsed.strengths || [],
        improvements: parsed.improvements || [],
        suggested_answers,
        suggested_observations,
        suggested_critical_errors,
      },
    }, 200);
  } catch (error: any) {
    console.error('[helpdesk-queue] Erro na avaliação com IA (OpenRouter):', error);
    return jsonResponse({ error: error.message || 'Falha ao avaliar com IA' }, 502);
  }
}
