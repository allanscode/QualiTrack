import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useBackgroundRefresh } from './useBackgroundRefresh';
import { usePageCache } from './usePageCache';
import { userCacheScope } from '../lib/pageCache';
import { isMockMode, mockDb, supabase } from '../lib/supabase';
import type { Monitoria, User } from '../types';
import type { MonitoriaSortDirection, MonitoriaSortField } from './useMonitoriaFilters';

export type MonitoriaListFilters = {
  tab?: string;
  search?: string;
  teamFilter?: string;
  suporteFilter?: string;
  auditorFilter?: string;
  ticketKindFilter?: 'all' | 'child' | 'service';
  dateType?: 'analysis' | 'ticket';
  startDate?: string;
  endDate?: string;
  sortField?: MonitoriaSortField;
  sortDirection?: MonitoriaSortDirection;
};

export type MonitoriaDataOptions = {
  page?: number;
  pageSize?: number;
  filters?: MonitoriaListFilters;
  enabled?: boolean;
};

const CHILD_FORM_ID = '6c7d1e88-841b-4da9-9a66-9f1464ce896f';
const LIST_COLUMNS = 'id,form_id,child_verdict,evaluator_id,evaluated_id,ticket_id,ticket_date,analysis_date,score,status,resolution_type,action_deadline_at,active,team_id,team_name,evaluator_name,evaluated_name,pj_reviewer_id,pj_review_kind,pj_review_required,history,created_at,updated_at';
type SourceOffsets = { primary: number; reviewer: number };

function compareMonitorias(a: Monitoria, b: Monitoria, field: MonitoriaSortField, direction: MonitoriaSortDirection) {
  const left = a[field];
  const right = b[field];
  if (left == null && right != null) return 1;
  if (left != null && right == null) return -1;
  if (left != null && right != null) {
    const comparison = typeof left === 'number' && typeof right === 'number'
      ? left - right : String(left).localeCompare(String(right));
    if (comparison) return direction === 'asc' ? comparison : -comparison;
  }
  return (field === 'created_at' ? 0 : b.created_at.localeCompare(a.created_at)) || b.id.localeCompare(a.id);
}

function mergeSourcePage(primary: Monitoria[], reviewer: Monitoria[], pageSize: number, field: MonitoriaSortField, direction: MonitoriaSortDirection) {
  const rows: Monitoria[] = [];
  const seen = new Set<string>();
  let primaryUsed = 0;
  let reviewerUsed = 0;
  while (rows.length < pageSize && (primaryUsed < primary.length || reviewerUsed < reviewer.length)) {
    const nextPrimary = primary[primaryUsed];
    const nextReviewer = reviewer[reviewerUsed];
    const usePrimary = !nextReviewer || (nextPrimary && compareMonitorias(nextPrimary, nextReviewer, field, direction) <= 0);
    const row = usePrimary ? primary[primaryUsed++] : reviewer[reviewerUsed++];
    if (!seen.has(row.id)) {
      rows.push(row);
      seen.add(row.id);
    }
  }
  return { rows, primaryUsed, reviewerUsed };
}

function matchesFilters(row: Monitoria, filters: MonitoriaListFilters) {
  if (row.active === false) return false;
  if (filters.tab === 'pendente_revisao' && !['pendente_revisao', 'contestacao_negada'].includes(row.status)) return false;
  if (filters.tab === 'expiradas_prazo' && !(row.status === 'concluida' && row.resolution_type === 'automatic')) return false;
  if (filters.tab === 'concluida' && !(row.status === 'concluida' && row.resolution_type !== 'automatic')) return false;
  if (filters.tab && !['todas', 'pendente_revisao', 'expiradas_prazo', 'concluida'].includes(filters.tab) && row.status !== filters.tab) return false;
  if (filters.teamFilter && row.team_id !== filters.teamFilter) return false;
  if (filters.suporteFilter && row.evaluated_id !== filters.suporteFilter) return false;
  if (filters.auditorFilter && row.evaluator_id !== filters.auditorFilter) return false;
  if (filters.ticketKindFilter === 'child' && row.form_id !== CHILD_FORM_ID) return false;
  if (filters.ticketKindFilter === 'service' && row.form_id === CHILD_FORM_ID) return false;
  const date = filters.dateType === 'ticket' ? row.ticket_date : row.analysis_date || row.created_at;
  if (filters.startDate && (!date || date < filters.startDate)) return false;
  if (filters.endDate && (!date || date > `${filters.endDate}T23:59:59`)) return false;
  if (filters.search) {
    const term = filters.search.toLocaleLowerCase('pt-BR');
    if (![row.ticket_id, String(row.display_id || ''), row.team_name, row.evaluated_name, row.evaluator_name, row.evaluator_note]
      .some(value => String(value || '').toLocaleLowerCase('pt-BR').includes(term))) return false;
  }
  return true;
}

function applyQueryFilters(query: any, filters: MonitoriaListFilters) {
  query = query.eq('active', true);
  if (filters.tab === 'pendente_revisao') query = query.in('status', ['pendente_revisao', 'contestacao_negada']);
  else if (filters.tab === 'expiradas_prazo') query = query.eq('status', 'concluida').eq('resolution_type', 'automatic');
  else if (filters.tab === 'concluida') query = query.eq('status', 'concluida').or('resolution_type.is.null,resolution_type.neq.automatic');
  else if (filters.tab && filters.tab !== 'todas') query = query.eq('status', filters.tab);
  if (filters.teamFilter) query = query.eq('team_id', filters.teamFilter);
  if (filters.suporteFilter) query = query.eq('evaluated_id', filters.suporteFilter);
  if (filters.auditorFilter) query = query.eq('evaluator_id', filters.auditorFilter);
  if (filters.ticketKindFilter === 'child') query = query.eq('form_id', CHILD_FORM_ID);
  if (filters.ticketKindFilter === 'service') query = query.or(`form_id.is.null,form_id.neq.${CHILD_FORM_ID}`);
  const dateColumn = filters.dateType === 'ticket' ? 'ticket_date' : 'analysis_date';
  if (filters.startDate) query = query.gte(dateColumn, filters.startDate);
  if (filters.endDate) query = query.lte(dateColumn, filters.endDate);
  if (filters.search) {
    const term = filters.search.trim().replace(/[^\p{L}\p{N}\s-]/gu, '');
    if (term) {
      const predicates = [
        `ticket_id.ilike.%${term}%`, `team_name.ilike.%${term}%`,
        `evaluated_name.ilike.%${term}%`, `evaluator_name.ilike.%${term}%`,
        `evaluator_note.ilike.%${term}%`,
      ];
      query = query.or(predicates.join(','));
    }
  }
  return query;
}

/** Fetch a bounded page only while the evaluations tab (or an explicit caller) needs it. */
export function useMonitoriaData(user: User | null, activeTab?: string, options: MonitoriaDataOptions = {}) {
  const page = Math.max(0, options.page || 0);
  const pageSize = Math.min(50, Math.max(25, options.pageSize || 50));
  const filters = options.filters || {};
  const filterKey = JSON.stringify(filters);
  const enabled = options.enabled ?? activeTab === 'monitorias';
  const scope = userCacheScope(user);
  const cache = usePageCache<{ rows: Monitoria[]; total: number }>(scope, `monitorias:${page}:${pageSize}:${filterKey}`);
  const [loadedKey, setLoadedKey] = useState(`${scope}:${page}:${pageSize}:${filterKey}`);
  const [monitorias, setMonitorias] = useState<Monitoria[]>(cache.initial?.rows || []);
  const [total, setTotal] = useState(cache.initial?.total || 0);
  const [loading, setLoading] = useState(enabled && cache.initial === undefined);
  const userRef = useRef(user);
  const enabledRef = useRef(enabled);
  const filtersRef = useRef(filters);
  const loadedOnceRef = useRef(cache.initial !== undefined);
  const cursorIdentity = `${scope}:${pageSize}:${filterKey}`;
  const cursorsRef = useRef<{ identity: string; pages: Map<number, SourceOffsets> }>({
    identity: cursorIdentity, pages: new Map([[0, { primary: 0, reviewer: 0 }]]),
  });
  if (cursorsRef.current.identity !== cursorIdentity) {
    cursorsRef.current = { identity: cursorIdentity, pages: new Map([[0, { primary: 0, reviewer: 0 }]]) };
  }
  userRef.current = user;
  enabledRef.current = enabled;
  filtersRef.current = filters;
  const key = `${scope}:${page}:${pageSize}:${filterKey}`;

  useEffect(() => {
    setLoadedKey(key);
    setMonitorias(cache.initial?.rows || []);
    setTotal(cache.initial?.total || 0);
    setLoading(enabled && cache.initial === undefined);
    loadedOnceRef.current = cache.initial !== undefined;
  }, [cache, enabled, key]);

  const load = useCallback(async (silent = false) => {
    const currentUser = userRef.current;
    if (!currentUser || !enabledRef.current) return;
    if (!silent && !loadedOnceRef.current) setLoading(true);
    try {
      let rows: Monitoria[] = [];
      let count = 0;
      const currentFilters = filtersRef.current;
      const sortField = currentFilters.sortField || 'created_at';
      const sortDirection = currentFilters.sortDirection || 'desc';
      if (isMockMode) {
        const { data } = await mockDb.get('monitorias');
        const all = ((data || []) as Monitoria[]).filter(row => {
          if (currentUser.role === 'suporte' && row.evaluated_id !== currentUser.id && row.pj_reviewer_id !== currentUser.id) return false;
          if (currentUser.role === 'gestor_suporte' && !currentUser.team_ids?.includes(row.team_id || '') && row.pj_reviewer_id !== currentUser.id) return false;
          return matchesFilters(row, currentFilters);
        }).sort((a, b) => compareMonitorias(a, b, sortField, sortDirection));
        count = all.length;
        rows = all.slice(page * pageSize, (page + 1) * pageSize);
      } else {
        const isSuporte = currentUser.role === 'suporte';
        const source = isSuporte ? 'vw_monitorias_suporte' : 'monitorias';
        const makeQuery = (name: string) => {
          let query = supabase!.from(name).select(LIST_COLUMNS, { count: 'exact' });
          query = applyQueryFilters(query, currentFilters);
          if (name === source && isSuporte) query = query.eq('evaluated_id', currentUser.id);
          if (name === source && currentUser.role === 'gestor_suporte') {
            query = currentUser.team_ids?.length ? query.in('team_id', currentUser.team_ids) : query.eq('team_id', '00000000-0000-0000-0000-000000000000');
          }
          query = query.order(sortField, { ascending: sortDirection === 'asc', nullsFirst: false });
          if (sortField !== 'created_at') query = query.order('created_at', { ascending: false });
          return query.order('id', { ascending: false });
        };
        const hasReviewer = isSuporte || currentUser.role === 'gestor_suporte';
        if (!hasReviewer) {
          const result = await makeQuery(source).range(page * pageSize, (page + 1) * pageSize - 1);
          if (result.error) throw result.error;
          rows = (result.data || []) as Monitoria[];
          count = result.count || 0;
        } else {
          // The reviewer view adds cases outside the user's own/team list. Remember
          // how many rows each source contributed so both requests stay bounded.
          const pages = cursorsRef.current.pages;
          let nextPage = page;
          while (!pages.has(nextPage)) nextPage--;
          for (; nextPage <= page; nextPage++) {
            const offsets = pages.get(nextPage)!;
            let reviewerQuery = makeQuery('vw_monitorias_pj_reviewer').eq('pj_reviewer_id', currentUser.id);
            if (isSuporte) reviewerQuery = reviewerQuery.neq('evaluated_id', currentUser.id);
            if (currentUser.role === 'gestor_suporte' && currentUser.team_ids?.length) {
              reviewerQuery = reviewerQuery.or(`team_id.is.null,team_id.not.in.(${currentUser.team_ids.join(',')})`);
            }
            const results = await Promise.all([
              makeQuery(source).range(offsets.primary, offsets.primary + pageSize - 1),
              reviewerQuery.range(offsets.reviewer, offsets.reviewer + pageSize - 1),
            ]);
            const failure = results.find(item => item.error)?.error;
            if (failure) throw failure;
            if (!cache.isCurrent()) return;
            const merged = mergeSourcePage(
              (results[0].data || []) as Monitoria[],
              (results[1].data || []) as Monitoria[], pageSize, sortField, sortDirection,
            );
            for (const laterPage of pages.keys()) if (laterPage > nextPage) pages.delete(laterPage);
            pages.set(nextPage + 1, {
              primary: offsets.primary + merged.primaryUsed,
              reviewer: offsets.reviewer + merged.reviewerUsed,
            });
            rows = merged.rows;
            count = (results[0].count || 0) + (results[1].count || 0);
          }
        }
      }
      if (!cache.isCurrent()) return;
      cache.write({ rows, total: count });
      setMonitorias(rows);
      setTotal(count);
      loadedOnceRef.current = true;
    } catch (error) {
      console.error('[Monitorias] Falha ao carregar página:', error);
      toast.error(loadedOnceRef.current ? 'Não foi possível atualizar as monitorias.' : 'Não foi possível carregar as monitorias.');
    } finally {
      if (cache.isCurrent()) setLoading(false);
    }
  }, [cache, page, pageSize]);

  const loadRef = useRef(load);
  loadRef.current = load;
  useEffect(() => { if (enabled && user) void load(); }, [enabled, user, load]);
  useEffect(() => {
    if (!enabled || isMockMode || !user) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const channel = supabase!.channel(`monitorias-list-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'monitorias' }, () => {
        clearTimeout(timer);
        timer = setTimeout(() => void loadRef.current(true), 300);
      }).subscribe();
    return () => { clearTimeout(timer); void supabase!.removeChannel(channel); };
  }, [enabled, user]);
  useEffect(() => {
    if (!enabled) return;
    const reconnect = () => void loadRef.current(true);
    window.addEventListener('qualitrack:reconnected', reconnect);
    return () => window.removeEventListener('qualitrack:reconnected', reconnect);
  }, [enabled]);
  useBackgroundRefresh(() => { if (enabledRef.current) void loadRef.current(true); }, enabled && Boolean(user));

  const fetchDetail = useCallback(async (id: string): Promise<Monitoria | null> => {
    const currentUser = userRef.current;
    if (!currentUser) return null;
    if (isMockMode) {
      const { data } = await mockDb.get('monitorias');
      return ((data || []) as Monitoria[]).find(row => row.id === id &&
        (currentUser.role !== 'suporte' || row.evaluated_id === currentUser.id || row.pj_reviewer_id === currentUser.id) &&
        (currentUser.role !== 'gestor_suporte' || currentUser.team_ids?.includes(row.team_id || '') || row.pj_reviewer_id === currentUser.id)) || null;
    }
    const sources = currentUser.role === 'suporte'
      ? ['vw_monitorias_suporte', 'vw_monitorias_pj_reviewer']
      : currentUser.role === 'gestor_suporte' ? ['monitorias', 'vw_monitorias_pj_reviewer'] : ['monitorias'];
    for (const source of sources) {
      let query = supabase!.from(source).select('*').eq('id', id);
      if (source === 'monitorias' && currentUser.role === 'gestor_suporte') {
        query = currentUser.team_ids?.length ? query.in('team_id', currentUser.team_ids) : query.eq('team_id', '00000000-0000-0000-0000-000000000000');
      }
      const { data, error } = await query.maybeSingle();
      if (error) throw error;
      if (data) return { ...(data as Monitoria), history: (data as Monitoria).history || [], answers: (data as Monitoria).answers || {} };
    }
    return null;
  }, []);

  const fetchExportRows = useCallback(async (ids: string[]): Promise<Monitoria[]> => {
    const currentUser = userRef.current;
    if (!currentUser || ids.length === 0) return [];
    if (isMockMode) {
      const { data } = await mockDb.get('monitorias');
      const byId = new Map(((data || []) as Monitoria[]).map(row => [row.id, row]));
      return ids.map(id => byId.get(id)).filter((row): row is Monitoria => Boolean(row));
    }
    const source = currentUser.role === 'suporte' ? 'vw_monitorias_suporte' : 'monitorias';
    const requests = [supabase!.from(source).select('*').in('id', ids)];
    if (currentUser.role === 'suporte' || currentUser.role === 'gestor_suporte') {
      requests.push(supabase!.from('vw_monitorias_pj_reviewer').select('*').in('id', ids));
    }
    const results = await Promise.all(requests);
    const failure = results.find(result => result.error)?.error;
    if (failure) throw failure;
    const byId = new Map(results.flatMap(result => (result.data || []) as Monitoria[]).map(row => [row.id, row]));
    return ids.map(id => byId.get(id)).filter((row): row is Monitoria => Boolean(row));
  }, []);

  return {
    monitorias: loadedKey === key ? monitorias : cache.initial?.rows || [],
    setMonitorias,
    loading: enabled && (loadedKey === key ? loading : cache.initial === undefined),
    total: loadedKey === key ? total : cache.initial?.total || 0,
    load,
    fetchDetail,
    fetchExportRows,
  };
}
