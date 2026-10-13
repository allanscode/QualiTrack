import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useBackgroundRefresh } from './useBackgroundRefresh';

afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });
it('refreshes visible idle pages, pauses hidden pages and removes listeners on unmount', () => {
  vi.useFakeTimers();
  const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  const refresh = vi.fn();
  const hook = renderHook(({ enabled }) => useBackgroundRefresh(refresh, enabled), { initialProps: { enabled: true } });
  act(() => vi.advanceTimersByTime(180_000));
  expect(refresh).toHaveBeenCalledTimes(1);
  visibility.mockReturnValue('hidden');
  act(() => vi.advanceTimersByTime(180_000));
  expect(refresh).toHaveBeenCalledTimes(1);
  visibility.mockReturnValue('visible');
  act(() => document.dispatchEvent(new Event('visibilitychange')));
  expect(refresh).toHaveBeenCalledTimes(2);
  hook.rerender({ enabled: false });
  act(() => vi.advanceTimersByTime(180_000));
  expect(refresh).toHaveBeenCalledTimes(2);
  hook.unmount();
  act(() => window.dispatchEvent(new Event('focus')));
  expect(refresh).toHaveBeenCalledTimes(2);
});
