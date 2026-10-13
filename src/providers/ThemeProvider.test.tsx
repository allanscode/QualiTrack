import React from 'react';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ThemeProvider, useTheme } from './ThemeProvider';

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); localStorage.clear(); document.documentElement.classList.remove('dark'); });
it('follows the OS initially and live, ignoring old saved overrides', () => {
  localStorage.setItem('qualitrack_theme', 'dark');
  let listener!: () => void;
  const query = { matches: false, addEventListener: vi.fn((_name, fn) => { listener = fn; }), removeEventListener: vi.fn() };
  vi.stubGlobal('matchMedia', vi.fn(() => query));
  const hook = renderHook(useTheme, { wrapper: ({ children }) => <ThemeProvider>{children}</ThemeProvider> });
  expect(hook.result.current.resolvedTheme).toBe('light');
  expect(hook.result.current.theme).toBe('system');
  act(() => { query.matches = true; listener(); });
  expect(hook.result.current.resolvedTheme).toBe('dark');
  expect(document.documentElement).toHaveClass('dark');
  expect(document.documentElement.style.colorScheme).toBe('dark');
  act(() => hook.result.current.setTheme('light'));
  expect(hook.result.current.resolvedTheme).toBe('dark');
  act(() => { query.matches = false; listener(); });
  expect(document.documentElement).not.toHaveClass('dark');
  hook.unmount();
  expect(query.removeEventListener).toHaveBeenCalledWith('change', listener);
});
