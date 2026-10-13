type ViewCondition = { field: string; operator: string; value?: string };
type View = { id?: number; title?: string; conditions?: { all?: ViewCondition[]; any?: ViewCondition[] } };

/** Keep the time window, but measure it from resolution instead of closure. */
export function proactiveViewWithoutClosed(view: View): { all: ViewCondition[]; any: ViewCondition[] } | null {
  const all = view.conditions?.all;
  const any = view.conditions?.any;
  if (!Array.isArray(all) || !Array.isArray(any)) throw new Error('A view Proativas não retornou condições completas.');
  const statuses = all.filter(condition => condition.field === 'status');
  const closedWindows = all.filter(condition => condition.field.toUpperCase() === 'CLOSED');
  const solvedWindows = all.filter(condition => condition.field.toUpperCase() === 'SOLVED');
  if (statuses.length === 1 && statuses[0].operator === 'is' && statuses[0].value === 'solved'
    && closedWindows.length === 0) return null;
  if (statuses.length !== 1 || statuses[0].operator !== 'is' || statuses[0].value !== 'closed'
    || closedWindows.length !== 1 || solvedWindows.length > 0) {
    throw new Error('A condição de status da view Proativas mudou; nenhuma alteração foi feita.');
  }
  return {
    all: [...all.filter(condition => condition.field !== 'status' && condition.field.toUpperCase() !== 'CLOSED'),
      { ...closedWindows[0], field: 'SOLVED' },
      { field: 'status', operator: 'is', value: 'solved' }],
    any: [...any],
  };
}

export async function syncProactiveViewStatus(
  env: (key: string) => string | undefined,
  apply: boolean,
  fetcher: typeof fetch = fetch,
): Promise<{ view_id: string; title: string; changed: boolean; before: View['conditions']; after: View['conditions'] }> {
  const subdomain = env('ZENDESK_SUBDOMAIN');
  const email = env('ZENDESK_EMAIL');
  const token = env('ZENDESK_API_TOKEN');
  const viewId = env('HELPDESK_PROACTIVE_VIEW_ID') || '47851284392724';
  if (!subdomain || !/^[a-z0-9-]+$/i.test(subdomain) || !email || !token || !/^\d+$/.test(viewId)) {
    throw new Error('Configuração Zendesk inválida.');
  }
  const url = `https://${subdomain}.zendesk.com/api/v2/views/${viewId}.json`;
  const headers = { Authorization: `Basic ${btoa(`${email}/token:${token}`)}`, 'Content-Type': 'application/json' };
  const read = async (): Promise<View> => {
    const response = await fetcher(url, { headers, signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error(`Zendesk recusou a leitura da view Proativas (${response.status}).`);
    const view = (await response.json())?.view as View | undefined;
    if (!view || String(view.id) !== viewId) throw new Error('Zendesk retornou outra view.');
    return view;
  };
  const before = await read();
  const next = proactiveViewWithoutClosed(before);
  if (apply && next) {
    const response = await fetcher(url, {
      method: 'PUT', headers, body: JSON.stringify({ view: next }), signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`Zendesk recusou a atualização da view Proativas (${response.status}): ${(await response.text()).slice(0, 500)}`);
    const confirmed = await read();
    const signature = (conditions: ViewCondition[] | undefined) =>
      (conditions || []).map(condition => `${condition.field}|${condition.operator}|${String(condition.value ?? '')}`).sort().join(';');
    if (proactiveViewWithoutClosed(confirmed) !== null
      || signature(confirmed.conditions?.all) !== signature(next.all)
      || signature(confirmed.conditions?.any) !== signature(next.any)) {
      throw new Error('Zendesk não confirmou todas as condições da view Proativas.');
    }
  }
  return {
    view_id: viewId, title: before.title || '', changed: apply && next !== null,
    before: before.conditions, after: next || before.conditions,
  };
}
