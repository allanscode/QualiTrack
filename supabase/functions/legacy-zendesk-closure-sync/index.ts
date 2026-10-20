// Reconciles only imported October child monitorias that remain open while
// their Zendesk ticket is solved. The Zendesk `closed` status is authoritative.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.108.2';
import { secretApiKey } from '../_shared/keys.ts';

type Candidate = { ticket_id: string };
type Ticket = { id: number; status: string };

const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json' },
});

Deno.serve(async (request) => {
  if (request.method !== 'POST') return response({ error: 'Method not allowed' }, 405);
  if (request.headers.get('apikey') !== secretApiKey()) return response({ error: 'Forbidden' }, 403);

  const subdomain = Deno.env.get('ZENDESK_SUBDOMAIN');
  const email = Deno.env.get('ZENDESK_EMAIL');
  const token = Deno.env.get('ZENDESK_API_TOKEN');
  const url = Deno.env.get('SUPABASE_URL');
  if (!subdomain || !email || !token || !url) return response({ error: 'Configuration unavailable' }, 503);

  const db = createClient(url, secretApiKey());
  const { data, error } = await db.from('monitorias').select('ticket_id')
    .eq('active', true).eq('status', 'pendente_revisao').lt('score', 75)
    .contains('form_snapshot', { legacy_source: 'zendesk_child_note', legacy_zendesk_status: 'solved' })
    .order('ticket_id').limit(100);
  if (error) return response({ error: 'Could not list monitorias' }, 502);
  const candidates = (data ?? []) as Candidate[];
  if (!candidates.length) return response({ checked: 0, closed: 0 });
  if (candidates.some(({ ticket_id }) => !/^\d{1,15}$/.test(ticket_id))) {
    return response({ error: 'Invalid ticket ID in database' }, 500);
  }

  const headers = { Authorization: `Basic ${btoa(`${email}/token:${token}`)}`, Accept: 'application/json' };
  let closed = 0;
  let checked = 0;
  for (let offset = 0; offset < candidates.length; offset += 20) {
    const batch = candidates.slice(offset, offset + 20);
    const zendesk = await fetch(`https://${subdomain}.zendesk.com/api/v2/tickets/show_many.json?ids=${batch.map(row => row.ticket_id).join(',')}`, { headers });
    if (!zendesk.ok) return response({ error: `Zendesk HTTP ${zendesk.status}`, checked, closed }, 502);
    const payload = await zendesk.json() as { tickets?: Ticket[] };
    if (!Array.isArray(payload.tickets)) return response({ error: 'Invalid Zendesk response', checked, closed }, 502);
    const statuses = new Map(payload.tickets.map(ticket => [String(ticket.id), ticket.status]));
    if (batch.some(row => !statuses.has(row.ticket_id))) {
      return response({ error: 'Zendesk ticket missing', checked, closed }, 502);
    }
    const checkedAt = new Date().toISOString();
    for (const row of batch) {
      checked++;
      if (statuses.get(row.ticket_id) !== 'closed') continue;
      const { data: changed, error: updateError } = await db.rpc('reconcile_legacy_child_closed', {
        p_ticket_id: row.ticket_id, p_checked_at: checkedAt,
      });
      if (updateError) return response({ error: 'Could not conclude monitoria', checked, closed }, 502);
      if (changed === true) closed++;
    }
  }
  return response({ checked, closed, remaining: candidates.length - closed });
});
