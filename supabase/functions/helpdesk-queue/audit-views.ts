import { CHILD_AUDITED_TAG } from './queue-search.ts';

export const STANDARD_AUDITED_TAG = 'analisado_qa';

type ViewCondition = { field: string; operator: string; value?: string };
type ZendeskView = {
  id?: number;
  title?: string;
  conditions?: { all?: ViewCondition[]; any?: ViewCondition[] };
};

export function viewConditionsWithAuditExclusion(view: ZendeskView, tag: string) {
  const all = view.conditions?.all;
  const any = view.conditions?.any;
  if (!Array.isArray(all) || !Array.isArray(any)) {
    throw new Error('A view do Zendesk não retornou suas condições completas.');
  }
  if (all.some(condition => condition.field === 'current_tags'
    && condition.operator === 'not_includes' && condition.value === tag)) return null;
  return {
    all: [...all, { field: 'current_tags', operator: 'not_includes', value: tag }],
    any: [...any],
  };
}

type ViewResult = {
  queue: string;
  view_id: string;
  title: string;
  tag: string;
  changed: boolean;
  exclusion_confirmed: boolean;
  conditions?: ZendeskView['conditions'];
  removed_deleted_groups?: string[];
};

/** Reads every configured queue view before changing any Zendesk condition. */
export async function syncQueueViewAuditExclusions(
  env: (key: string) => string | undefined,
  apply: boolean,
  fetcher: typeof fetch = fetch,
): Promise<{ applied: boolean; views: ViewResult[] }> {
  const subdomain = env('ZENDESK_SUBDOMAIN');
  const email = env('ZENDESK_EMAIL');
  const token = env('ZENDESK_API_TOKEN');
  if (!subdomain || !/^[a-z0-9-]+$/i.test(subdomain) || !email || !token) {
    throw new Error('Credenciais Zendesk inválidas.');
  }
  const configured = [
    { queue: 'negativas', viewId: env('HELPDESK_NEGATIVE_VIEW_ID') || '47295789542804', tag: STANDARD_AUDITED_TAG },
    { queue: 'positivas', viewId: env('HELPDESK_POSITIVE_VIEW_ID') || '48318855861396', tag: STANDARD_AUDITED_TAG },
    { queue: 'proativas', viewId: env('HELPDESK_PROACTIVE_VIEW_ID') || '47851284392724', tag: STANDARD_AUDITED_TAG },
    { queue: 'filhos', viewId: env('HELPDESK_CHILD_VIEW_ID') || '47405806430228', tag: CHILD_AUDITED_TAG },
    { queue: 'filhos_invalidos', viewId: env('HELPDESK_INVALID_CHILD_VIEW_ID') || '47656856998292', tag: CHILD_AUDITED_TAG },
  ];
  if (configured.some(item => !/^\d+$/.test(item.viewId))
    || new Set(configured.map(item => item.viewId)).size !== configured.length) {
    throw new Error('IDs das views de triagem inválidos ou repetidos.');
  }
  const headers = {
    Authorization: `Basic ${btoa(`${email}/token:${token}`)}`,
    'Content-Type': 'application/json', Accept: 'application/json',
  };
  const readView = async (viewId: string): Promise<ZendeskView> => {
    const url = `https://${subdomain}.zendesk.com/api/v2/views/${viewId}.json`;
    const response = await fetcher(url, { headers, signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error(`Zendesk recusou a leitura da view ${viewId} (${response.status}).`);
    const view = (await response.json())?.view as ZendeskView | undefined;
    if (!view || String(view.id) !== viewId) throw new Error(`Zendesk retornou outra view para ${viewId}.`);
    return view;
  };
  const plans = [];
  for (const item of configured) {
    const view = await readView(item.viewId);
    const next = viewConditionsWithAuditExclusion(view, item.tag);
    plans.push({ ...item, title: view.title || '', conditions: view.conditions, next });
  }
  const views: ViewResult[] = [];
  for (const item of plans) {
    const removedDeletedGroups: string[] = [];
    if (apply && item.next) {
      const url = `https://${subdomain}.zendesk.com/api/v2/views/${item.viewId}.json`;
      let next = item.next;
      const maxAttempts = next.all.filter(condition => condition.field === 'group_id'
        && condition.operator === 'is_not').length + 1;
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const response = await fetcher(url, {
          method: 'PUT', headers, body: JSON.stringify({ view: next }),
          signal: AbortSignal.timeout(10_000),
        });
        if (response.ok) break;
        const detail = (await response.text()).slice(0, 1200);
        let deletedGroupId: string | undefined;
        try {
          const error = JSON.parse(detail) as { details?: { base?: Array<{ description?: string }> } };
          const deleted = error.details?.base?.find(item => /apagado|deleted/i.test(item.description || ''));
          deletedGroupId = deleted?.description?.match(/\b\d{8,}\b/)?.[0];
        } catch { /* Unexpected Zendesk error: preserve it below. */ }
        const removable = response.status === 422 && deletedGroupId
          && next.all.some(condition => condition.field === 'group_id'
            && condition.operator === 'is_not' && condition.value === deletedGroupId)
          && !next.any.some(condition => condition.field === 'group_id' && condition.value === deletedGroupId);
        if (!removable || attempt === maxAttempts - 1) {
          throw new Error(`Zendesk recusou a atualização da view ${item.viewId} (${response.status}): ${detail}`);
        }
        // Excluding a group that no longer exists cannot affect current tickets.
        next = { all: next.all.filter(condition => !(condition.field === 'group_id'
          && condition.operator === 'is_not' && condition.value === deletedGroupId)), any: next.any };
        removedDeletedGroups.push(deletedGroupId!);
      }
      if (viewConditionsWithAuditExclusion(await readView(item.viewId), item.tag) !== null) {
        throw new Error(`Zendesk não confirmou a exclusão de auditados da view ${item.viewId}.`);
      }
    }
    views.push({
      queue: item.queue, view_id: item.viewId, title: item.title, tag: item.tag,
      changed: apply && item.next !== null,
      exclusion_confirmed: apply || item.next === null,
      ...(apply ? {} : { conditions: item.conditions }),
      ...(removedDeletedGroups.length ? { removed_deleted_groups: removedDeletedGroups } : {}),
    });
  }
  return { applied: apply, views };
}
