import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearPageCache, createPageCacheWriter, readPageCache, userCacheScope } from './pageCache';
import type { User } from '../types';

afterEach(() => { clearPageCache(); vi.useRealTimers(); });
const user = { id: 'one', role: 'admin', active: true, team_ids: ['a', 'b'] } as User;

describe('private page cache', () => {
  it('isolates identities and permissions, independent of team ordering', () => {
    const scope = userCacheScope(user);
    createPageCacheWriter<number>([scope, 'dashboard'])(42);
    expect(readPageCache([userCacheScope({ ...user, team_ids: ['b', 'a'] }), 'dashboard'])).toBe(42);
    for (const other of [{ ...user, id: 'two' }, { ...user, role: 'suporte' as const },
      { ...user, team_ids: ['a'] }, { ...user, active: false }]) {
      expect(readPageCache([userCacheScope(other), 'dashboard'])).toBeUndefined();
    }
  });

  it('expires snapshots and rejects late responses after logout', () => {
    vi.useFakeTimers();
    const write = createPageCacheWriter<number>(['one', 'dashboard']);
    write(42);
    vi.advanceTimersByTime(10 * 60_000);
    expect(readPageCache(['one', 'dashboard'])).toBeUndefined();
    clearPageCache();
    write(99);
    expect(readPageCache(['one', 'dashboard'])).toBeUndefined();
  });
});
