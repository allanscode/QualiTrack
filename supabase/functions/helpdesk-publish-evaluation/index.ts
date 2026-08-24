// Orquestra a publicação de uma avaliação de qualidade no helpdesk:
// autentica o chamador, busca a monitoria, monta o HTML do comentário
// (sempre no servidor — o frontend nunca envia HTML, só pede o preview
// com dry_run: true), escolhe o provider e registra o resultado.
//
// Trocar de helpdesk = trocar o `switch` abaixo por outra implementação de
// HelpdeskProvider (ver types.ts). Nada de Zendesk deve aparecer aqui além
// da escolha do provider.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

import type { HelpdeskProvider, PublishResult } from './types.ts';
import { buildEvaluationHtml } from './template.ts';
import { ZendeskProvider } from './zendesk.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('FRONTEND_URL') || '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const PublishSchema = z.object({
  monitoria_id: z.string().uuid(),
  outcome: z.enum(['positiva', 'negativa']).optional(),
  dry_run: z.boolean().optional(),
  force: z.boolean().optional(),
});

function jsonResponse(body: PublishResult, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function failure(error: string, stage: 'auth' | 'not_found' | 'provider' | 'validation', status: number): Response {
  return jsonResponse({ success: false, error, stage }, status);
}

/**
 * Escolhe a implementação de HelpdeskProvider a partir de
 * HELPDESK_PROVIDER. Um switch simples basta: não há necessidade de um
 * sistema de registro de plugins para uma única variável de ambiente.
 */
function resolveProvider(): HelpdeskProvider {
  const providerName = Deno.env.get('HELPDESK_PROVIDER') ?? 'zendesk';

  switch (providerName) {
    case 'zendesk': {
      const subdomain = Deno.env.get('ZENDESK_SUBDOMAIN');
      const email = Deno.env.get('ZENDESK_EMAIL');
      const apiToken = Deno.env.get('ZENDESK_API_TOKEN');

      if (!subdomain || !email || !apiToken) {
        throw new Error(
          'ZENDESK_SUBDOMAIN, ZENDESK_EMAIL e ZENDESK_API_TOKEN não configurados. Defina via: supabase secrets set ...',
        );
      }

      return new ZendeskProvider({ subdomain, email, apiToken });
    }
    default:
      throw new Error(`HELPDESK_PROVIDER desconhecido: ${providerName}`);
  }
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // 1. Validar JWT; resolver o usuário chamador.
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return failure('Cabeçalho Authorization ausente', 'auth', 401);
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();

    if (userError || !user) {
      return failure('Usuário não autenticado', 'auth', 401);
    }

    const body = await req.json();
    const parsed = PublishSchema.safeParse(body);

    if (!parsed.success) {
      return failure(
        `Payload inválido: ${parsed.error.errors.map((e) => e.message).join(', ')}`,
        'validation',
        400,
      );
    }

    const { monitoria_id, outcome, dry_run, force } = parsed.data;

    // Client com service role: a busca/gravação da monitoria e do envio
    // acontece independentemente das políticas de RLS do usuário chamador
    // — a Edge Function é a fronteira de autorização aqui, não o RLS.
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    // 2. Buscar a monitoria por monitoria_id. 404 se não existir.
    const { data: monitoria, error: monitoriaError } = await supabaseAdmin
      .from('monitorias')
      .select('id, ticket_id, evaluator_id, evaluated_id, team_id, evaluator_note, satisfaction_has_record, satisfaction_record_text, selected_critical_errors, status')
      .eq('id', monitoria_id)
      .maybeSingle();

    if (monitoriaError) {
      console.error('[helpdesk-publish-evaluation] Erro ao buscar monitoria:', monitoriaError);
      return failure('Erro ao buscar a monitoria', 'not_found', 500);
    }

    if (!monitoria) {
      return failure('Monitoria não encontrada', 'not_found', 404);
    }

    // 2b. AUTORIZAR o chamador.
    //
    // Duas permissões distintas, de propósito: ver o preview (dry_run) é
    // inofensivo — não escreve em lugar nenhum — mas PUBLICAR assina um
    // comentário como Qualidade WP num ticket real. Por isso:
    //
    //   - Visualizar o preview: gestão da qualidade, o auditor da monitoria,
    //     o agente avaliado e o gestor de suporte da equipe dele. É natural
    //     que o agente veja a avaliação que recebeu antes dela ir ao cliente.
    //   - Publicar de fato: só quem decide o veredito de qualidade — admin,
    //     gestor_qualidade, ou o auditor que avaliou esta monitoria
    //     especificamente. Nunca o agente avaliado nem o gestor de suporte:
    //     senão o próprio avaliado poderia validar a si mesmo no ticket do
    //     cliente, assinando como Qualidade WP.
    const { data: caller, error: callerError } = await supabaseAdmin
      .from('users')
      .select('id, role, active')
      .eq('id', user.id)
      .maybeSingle();

    if (callerError || !caller || !caller.active) {
      return failure('Usuário sem cadastro ativo no sistema', 'auth', 403);
    }

    const podePublicar =
      caller.role === 'admin' ||
      caller.role === 'gestor_qualidade' ||
      (caller.role === 'qualidade' && monitoria.evaluator_id === user.id);

    const podeVisualizar =
      podePublicar ||
      (caller.role === 'suporte' && monitoria.evaluated_id === user.id) ||
      caller.role === 'gestor_suporte';

    if (!dry_run && !podePublicar) {
      return failure('Você não tem permissão para publicar esta avaliação no helpdesk', 'auth', 403);
    }

    if (!podeVisualizar) {
      return failure('Você não tem permissão para ver esta avaliação', 'auth', 403);
    }

    // 3. Validar que ticket_id está preenchido e é numérico (para Zendesk).
    const ticketId: string | null = monitoria.ticket_id;
    if (!ticketId || !/^\d+$/.test(ticketId.trim())) {
      return failure(
        'O número do ticket desta monitoria não está preenchido ou não é numérico — obrigatório para publicar no Zendesk',
        'validation',
        400,
      );
    }
    const normalizedTicketId = ticketId.trim();

    // 3b. Determinar desfecho (outcome) automaticamente caso não seja passado
    const resolvedOutcome: 'positiva' | 'negativa' =
      outcome ?? ((monitoria.selected_critical_errors?.length ?? 0) > 0 ? 'negativa' : 'positiva');

    // 3c. Proteção contra duplicidade de postagem no Zendesk (se já enviado e não forçado)
    if (!dry_run && !force) {
      const { data: existing } = await supabaseAdmin
        .from('helpdesk_submissions')
        .select('id, external_comment_id')
        .eq('monitoria_id', monitoria_id)
        .eq('status', 'sent')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existing) {
        return jsonResponse(
          {
            success: true,
            preview_html: '',
            ticket_id: normalizedTicketId,
            external_comment_id: existing.external_comment_id ?? undefined,
          },
          200,
        );
      }
    }

    // 4. Montar o HTML a partir do template + campos.
    const previewHtml = buildEvaluationHtml({
      outcome: resolvedOutcome,
      evaluatorNote: monitoria.evaluator_note ?? null,
      satisfactionRecordText: monitoria.satisfaction_has_record
        ? monitoria.satisfaction_record_text ?? null
        : null,
    });

    // 5. Se dry_run, devolver o HTML e parar — nenhuma escrita.
    if (dry_run) {
      return jsonResponse(
        { success: true, preview_html: previewHtml, ticket_id: normalizedTicketId },
        200,
      );
    }

    // 6. Chamar o provider (Zendesk hoje).
    let provider: HelpdeskProvider;
    try {
      provider = resolveProvider();
    } catch (err: any) {
      console.error('[helpdesk-publish-evaluation] Provider não configurado:', err);
      return failure(err.message ?? 'Provider de helpdesk não configurado', 'provider', 500);
    }

    try {
      const { externalCommentId } = await provider.publishEvaluation({
        ticketId: normalizedTicketId,
        outcome: resolvedOutcome,
        htmlBody: previewHtml,
      });

      // 7. Registrar o sucesso em helpdesk_submissions.
      const { error: insertError } = await supabaseAdmin.from('helpdesk_submissions').insert({
        monitoria_id,
        provider: provider.name,
        external_ticket_id: normalizedTicketId,
        outcome: resolvedOutcome,
        status: 'sent',
        external_comment_id: externalCommentId,
        created_by: user.id,
      });

      if (insertError) {
        console.error('[helpdesk-publish-evaluation] Falha ao gravar helpdesk_submissions (sucesso):', insertError);
      }

      return jsonResponse(
        {
          success: true,
          preview_html: previewHtml,
          ticket_id: normalizedTicketId,
          external_comment_id: externalCommentId,
        },
        200,
      );
    } catch (err: any) {
      const errorMessage = err?.message ?? 'Falha desconhecida ao publicar no helpdesk';
      console.error('[helpdesk-publish-evaluation] Falha ao publicar no provider:', err);

      const { error: insertError } = await supabaseAdmin.from('helpdesk_submissions').insert({
        monitoria_id,
        provider: provider.name,
        external_ticket_id: normalizedTicketId,
        outcome: resolvedOutcome,
        status: 'failed',
        error_message: errorMessage,
        created_by: user.id,
      });

      if (insertError) {
        console.error('[helpdesk-publish-evaluation] Falha ao gravar helpdesk_submissions (falha):', insertError);
      }

      return failure(errorMessage, 'provider', 502);
    }
  } catch (error: any) {
    console.error('[helpdesk-publish-evaluation] Erro inesperado:', error);
    return failure(error?.message ?? 'Erro interno', 'validation', 500);
  }
});
