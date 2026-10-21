import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useChartRevealAnimation } from './useChartRevealAnimation';

vi.mock('motion/react', () => ({ useReducedMotion: () => false }));

describe('useChartRevealAnimation', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('activates once when the chart scrolls into the dashboard viewport', async () => {
    class MockResizeObserver {
      observe = vi.fn();
      disconnect = vi.fn();
    }
    vi.stubGlobal('ResizeObserver', MockResizeObserver);
    let targetTop = 150;
    const root = document.createElement('div');
    root.dataset.dashboardScrollRoot = '';
    Object.defineProperties(root, {
      clientHeight: { configurable: true, value: 100 },
      clientWidth: { configurable: true, value: 100 },
    });
    const chart = document.createElement('div');
    root.append(chart);
    document.body.append(root);

    vi.spyOn(root, 'getBoundingClientRect').mockReturnValue({
      top: 0, right: 100, bottom: 100, left: 0, width: 100, height: 100,
      x: 0, y: 0, toJSON: () => ({}),
    });
    vi.spyOn(chart, 'getBoundingClientRect').mockImplementation(() => ({
      top: targetTop, right: 100, bottom: targetTop + 100, left: 0, width: 100, height: 100,
      x: 0, y: targetTop, toJSON: () => ({}),
    }));

    const { result } = renderHook(() => useChartRevealAnimation());
    act(() => result.current.ref(chart));
    expect(result.current.animateChart).toBe(false);

    targetTop = 40;
    act(() => root.dispatchEvent(new Event('scroll')));
    await waitFor(() => expect(result.current.animateChart).toBe(true));

    targetTop = 150;
    act(() => root.dispatchEvent(new Event('scroll')));
    expect(result.current.animateChart).toBe(true);
    root.remove();
  });
});
