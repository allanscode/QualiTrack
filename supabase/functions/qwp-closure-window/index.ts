import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.108.2';
import { secretApiKey } from '../_shared/keys.ts';
import { corsFor, rejectRequest } from '../_shared/http.ts';
import { addZendeskBusinessHours } from '../helpdesk-queue/closure-window.ts';

const cors = corsFor(Deno.env.get('FRONTEND_URL'));
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...cors, 'Content-Type': 'application/json' },
});

Deno.serve(async request => {
  const rejected = rejectRequest(request, cors);
  if (rejected) return rejected;
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  const bearer = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!bearer) return response({ error: 'Sessão não fornecida' }, 401);
  const db = createClient(Deno.env.get('SUPABASE_URL')!, secretApiKey());
  const { data: { user }, error: authError } = await db.auth.getUser(bearer);
  if (authError || !user) return response({ error: 'Sessão inválida' }, 401);
  const { data: caller, error: callerError } = await db.from('users').select('role,active').eq('id', user.id).maybeSingle();
  if (callerError || !caller?.active || !['admin', 'gestor_qualidade', 'qualidade'].includes(caller.role)) {
    return response({ error: 'Sem permissão para criar monitoria' }, 403);
  }
  const payload = await request.json().catch(() => ({}));
  const ticketId = payload?.ticket_id;
  if (typeof ticketId !== 'string' || !/^\d{1,15}$/.test(ticketId)) return response({ error: 'ticket_id inválido' }, 400);
  const subdomain = Deno.env.get('ZENDESK_SUBDOMAIN');
  const email = Deno.env.get('ZENDESK_EMAIL');
  const token = Deno.env.get('ZENDESK_API_TOKEN');
  if (!subdomain || !email || !token) return response({ error: 'Zendesk não configurado' }, 503);
  const origin = `https://${subdomain}.zendesk.com`;
  const headers = { Authorization: `Basic ${btoa(`${email}/token:${token}`)}`, Accept: 'application/json' };
  try {
    const ticketResponse = await fetch(`${origin}/api/v2/tickets/${ticketId}.json`, {
      headers, signal: AbortSignal.timeout(10_000),
    });
    if (!ticketResponse.ok) return response({ error: 'Não foi possível confirmar o ticket no Zendesk' }, 502);
    const { ticket } = await ticketResponse.json();
    if (!ticket || String(ticket.id) !== ticketId || !Number.isFinite(Date.parse(ticket.created_at))) {
      return response({ error: 'Dados do ticket inválidos' }, 502);
    }
    if (!Array.isArray(ticket.tags) || !ticket.tags.includes('qwp_closure_4bd')) {
      return response({ applies: false, reason: 'ticket_outside_new_policy' });
    }
    if (ticket.status === 'closed' || ticket.status === 'archived') {
      return response({ applies: false, reason: 'ticket_already_closed' });
    }
    let anchor: string = ticket.created_at;
    if (ticket.status === 'solved') {
      const metricResponse = await fetch(`${origin}/api/v2/tickets/${ticketId}/metrics.json`, {
        headers, signal: AbortSignal.timeout(10_000),
      });
      if (!metricResponse.ok) return response({ error: 'Não foi possível confirmar a resolução no Zendesk' }, 502);
      const metrics = await metricResponse.json();
      const solvedAt = metrics.ticket_metric?.solved_at;
      if (typeof solvedAt !== 'string' || !Number.isFinite(Date.parse(solvedAt))) {
        return response({ error: 'Horário de resolução indisponível no Zendesk' }, 502);
      }
      anchor = solvedAt;
    }
    const scheduleId = String(ticket.schedule_id || Deno.env.get('ZENDESK_CLOSURE_SCHEDULE_ID') || '40928832528020');
    if (!/^\d+$/.test(scheduleId)) return response({ error: 'Agenda Zendesk inválida' }, 503);
    const [scheduleResponse, holidayResponse] = await Promise.all([
      fetch(`${origin}/api/v2/business_hours/schedules/${scheduleId}.json`, { headers, signal: AbortSignal.timeout(10_000) }),
      fetch(`${origin}/api/v2/business_hours/schedules/${scheduleId}/holidays.json`, { headers, signal: AbortSignal.timeout(10_000) }),
    ]);
    if (!scheduleResponse.ok || !holidayResponse.ok) return response({ error: 'Agenda Zendesk indisponível' }, 502);
    const { schedule } = await scheduleResponse.json();
    const { holidays } = await holidayResponse.json();
    if (!schedule || !Array.isArray(schedule.intervals) || !Array.isArray(holidays) || schedule.time_zone !== 'Brasilia') {
      return response({ error: 'Agenda Zendesk não compatível com o prazo configurado' }, 503);
    }
    const deadlineAt = addZendeskBusinessHours(anchor, 36, schedule.intervals, holidays);
    return response({ applies: true, deadline_at: deadlineAt, anchor_at: anchor,
      anchor_kind: ticket.status === 'solved' ? 'SOLVED' : 'CREATED', schedule_id: scheduleId });
  } catch (error) {
    console.error('[qwp-closure-window]', error instanceof Error ? error.message : String(error));
    return response({ error: 'Falha ao calcular prazo do Zendesk' }, 502);
  }
});
