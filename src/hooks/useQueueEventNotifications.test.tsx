import { StrictMode } from 'react';
import { renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { User } from '../types';

afterEach(() => {
  vi.doUnmock('../lib/supabase');
  vi.resetModules();
});

it('creates a fresh Realtime channel when StrictMode mounts the effect twice', async () => {
  const topics: string[] = [];
  const channels = new Map<string, { joined: boolean; on: (...args: unknown[]) => unknown; subscribe: () => void }>();
  const client = {
    from: () => ({
      select: () => ({
        order: () => ({ limit: async () => ({ data: [], error: null }) }),
      }),
    }),
    channel: (topic: string) => {
      const existing = channels.get(topic);
      if (existing) return existing;
      const channel = {
        joined: false,
        on(..._args: unknown[]) {
          if (this.joined) throw new Error(`cannot add postgres_changes callbacks for ${topic} after subscribe()`);
          return this;
        },
        subscribe() { this.joined = true; },
      };
      channels.set(topic, channel);
      topics.push(topic);
      return channel;
    },
    removeChannel: async () => 'ok',
  };
  vi.doMock('../lib/supabase', () => ({ isMockMode: false, supabase: client }));
  const { useQueueEventNotifications } = await import('./useQueueEventNotifications');
  const user = { id: 'auditor-1', active: true, role: 'qualidade' } as User;

  const result = renderHook(() => useQueueEventNotifications(user), { wrapper: StrictMode });
  expect(topics).toHaveLength(2);
  expect(new Set(topics).size).toBe(2);
  result.unmount();
});
