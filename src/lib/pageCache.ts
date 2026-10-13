import { queryClient } from './queryClient';
import type { User } from '../types';

// Memory only: private data never survives logout or a browser restart.
const MAX_AGE_MS = 10 * 60_000;
let generation = 0;

export function userCacheScope(user: User | null | undefined): string {
  return JSON.stringify(user ? [user.id, user.role, user.active,
    [...(user.team_ids || [])].sort(), user.primary_team_id || ''] : ['anonymous']);
}

export function readPageCache<T>(key: readonly string[]): T | undefined {
  const state = queryClient.getQueryState<T>(['pageCache', ...key]);
  return state && Date.now() - state.dataUpdatedAt < MAX_AGE_MS ? state.data : undefined;
}

export function createPageCacheWriter<T>(key: readonly string[]) {
  const startedIn = generation;
  return (data: T) => {
    if (generation === startedIn) queryClient.setQueryData(['pageCache', ...key], data);
  };
}

export function clearPageCache() {
  generation++;
  queryClient.removeQueries({ queryKey: ['pageCache'] });
}
