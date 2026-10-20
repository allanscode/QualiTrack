// Temporary service-only control for the WQ-80 rule rollout. Never updates tickets.
import { secretApiKey } from '../_shared/keys.ts';

const SOURCE_IDS = [49371758765204, 49394572883732, 43790393894164,
  47994001127700, 38542558166548, 52771253837588];
const TAG = 'qwp_closure_4bd';
const TRIGGER_TITLE = 'QWP 4DU | Marcar tickets criados após ativação';
const prefix = 'QWP 4DU | ';

type Rule = {
  id: number; title: string; active: boolean;
  actions: Array<{ field: string; value: string }>;
  conditions: { all: Array<{ field: string; operator: string; value: string }>; any: Array<{ field: string; operator: string; value: string }> };
};

const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json' },
});

Deno.serve(async request => {
  if (request.method !== 'POST') return reply({ error: 'Method not allowed' }, 405);
  if (request.headers.get('apikey') !== secretApiKey()) return reply({ error: 'Forbidden' }, 403);
  const subdomain = Deno.env.get('ZENDESK_SUBDOMAIN');
  const email = Deno.env.get('ZENDESK_EMAIL');
  const token = Deno.env.get('ZENDESK_API_TOKEN');
  if (!subdomain || !email || !token) return reply({ error: 'Zendesk configuration unavailable' }, 503);
  const mode = (await request.json().catch(() => ({})))?.mode;
  if (!['inspect', 'prepare', 'activate'].includes(mode)) return reply({ error: 'Invalid mode' }, 400);
  const origin = `https://${subdomain}.zendesk.com`;
  const headers = {
    Authorization: `Basic ${btoa(`${email}/token:${token}`)}`,
    Accept: 'application/json', 'Content-Type': 'application/json',
  };
  const api = async (path: string, method = 'GET', body?: unknown) => {
    const response = await fetch(`${origin}/api/v2/${path}`, {
      method, headers, body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`${method} ${path}: HTTP ${response.status} ${JSON.stringify(result).slice(0, 500)}`);
    return result;
  };
  try {
    const sources = await Promise.all(SOURCE_IDS.map(async id => (await api(`automations/${id}.json`)).automation as Rule));
    const [automationList, triggerList] = await Promise.all([
      api('automations.json?per_page=100'), api('triggers.json?per_page=100'),
    ]);
    const currentAutomations = automationList.automations as Rule[];
    const currentTriggers = triggerList.triggers as Rule[];
    const expected = sources.map(source => {
      const time = source.conditions.all.find(condition =>
        (condition.field === 'SOLVED' || condition.field === 'NEW')
          && condition.operator === 'greater_than_business_hours');
      if (mode !== 'inspect' && (!source.active || !source.actions.some(action => action.field === 'status' && action.value === 'closed')
        || time?.value !== '56')) throw new Error(`Source automation ${source.id} differs from the audit`);
      return { source, title: `${prefix}${source.id} | ${source.title.replaceAll('56', '37')}` };
    });
    const existing = expected.map(item => ({ source_id: item.source.id,
      clone: currentAutomations.find(rule => rule.title === item.title) }));
    const trigger = currentTriggers.find(rule => rule.title === TRIGGER_TITLE);
    if (mode === 'inspect') return reply({ sources: sources.map(rule => ({ id: rule.id, title: rule.title, active: rule.active,
      time: rule.conditions.all.filter(condition => condition.field === 'SOLVED' || condition.field === 'NEW'),
      closes: rule.actions.some(action => action.field === 'status' && action.value === 'closed') })),
      clones: existing.map(item => ({ source_id: item.source_id, id: item.clone?.id, active: item.clone?.active })),
      trigger: trigger ? { id: trigger.id, active: trigger.active } : null });

    if (mode === 'prepare') {
      const prepared: number[] = [];
      for (const item of expected) {
        if (currentAutomations.some(rule => rule.title === item.title)) continue;
        const conditions = structuredClone(item.source.conditions);
        const time = conditions.all.find(condition =>
          (condition.field === 'SOLVED' || condition.field === 'NEW')
            && condition.operator === 'greater_than_business_hours');
        if (!time) throw new Error(`Missing time condition on ${item.source.id}`);
        time.value = '37';
        conditions.all.push({ field: 'current_tags', operator: 'includes', value: TAG });
        const created = await api('automations.json', 'POST', { automation: {
          title: item.title, active: false, conditions, actions: item.source.actions,
        } });
        prepared.push(created.automation.id);
      }
      let triggerId = trigger?.id;
      if (!triggerId) {
        const created = await api('triggers.json', 'POST', { trigger: {
          title: TRIGGER_TITLE, active: false,
          conditions: { all: [{ field: 'update_type', value: 'Create' },
            { field: 'current_tags', operator: 'not_includes', value: TAG }], any: [] },
          actions: [{ field: 'current_tags', value: TAG }],
        } });
        triggerId = created.trigger.id;
      }
      return reply({ prepared, trigger_id: triggerId, active: false });
    }

    if (existing.some(item => !item.clone) || !trigger) throw new Error('Prepare all rules before activation');
    for (const item of existing) {
      if (!item.clone!.active) await api(`automations/${item.clone!.id}.json`, 'PUT', {
        automation: { active: true },
      });
    }
    if (!trigger.active) await api(`triggers/${trigger.id}.json`, 'PUT', { trigger: { active: true } });
    return reply({ activated: existing.map(item => item.clone!.id), trigger_id: trigger.id });
  } catch (error) {
    return reply({ error: error instanceof Error ? error.message : String(error) }, 502);
  }
});
