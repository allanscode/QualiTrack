import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useQueueUpdateNotice } from './useQueueUpdateNotice';
import { checkQueueUpdates } from '../lib/helpdeskQueue';

vi.mock('../lib/helpdeskQueue', () => ({ checkQueueUpdates: vi.fn() }));

const checkUpdates = vi.mocked(checkQueueUpdates);
const options = {
  activeQueue: 'proativas' as const,
  enabled: true,
  searchTerm: '',
  loading: false,
  batchRunning: false,
};

describe('useQueueUpdateNotice', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-28T12:00:00Z'));
    checkUpdates.mockReset();
  });

  afterEach(() => vi.useRealTimers());

  it('keeps the current page until the user refreshes after new tickets arrive', async () => {
    checkUpdates.mockResolvedValueOnce(['101', '100']).mockResolvedValueOnce(['102', '101']);
    const { result } = renderHook(() => useQueueUpdateNotice(options));

    await act(async () => { result.current.rememberPage('proativas', ['101', '100']); });
    expect(result.current.hasUpdates).toBe(false);

    vi.setSystemTime(new Date('2026-09-28T12:03:01Z'));
    await act(async () => { window.dispatchEvent(new Event('focus')); });
    expect(result.current.hasUpdates).toBe(true);

    checkUpdates.mockResolvedValueOnce(['102', '101']);
    await act(async () => { result.current.rememberPage('proativas', ['102', '101']); });
    expect(result.current.hasUpdates).toBe(false);
  });
});
