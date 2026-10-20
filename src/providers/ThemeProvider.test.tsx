import React from 'react';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ThemeProvider, useTheme } from './ThemeProvider';

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); localStorage.clear(); document.documentElement.classList.remove('dark'); });
it('persists explicit light and dark choices and follows the OS in system mode', () => {
  localStorage.setItem('qualitrack_theme', 'dark');
  let listener!: () => void;
  const query = { matches: false, addEventListener: vi.fn((_name, fn) => { listener = fn; }), removeEventListener: vi.fn() };
  vi.stubGlobal('matchMedia', vi.fn(() => query));
  const hook = renderHook(useTheme, { wrapper: ({ children }) => <ThemeProvider>{children}</ThemeProvider> });

  expect(hook.result.current.theme).toBe('dark');
  expect(hook.result.current.resolvedTheme).toBe('dark');
  expect(document.documentElement).toHaveClass('dark');

  act(() => hook.result.current.setTheme('light'));
  expect(hook.result.current.resolvedTheme).toBe('light');
  expect(document.documentElement).not.toHaveClass('dark');
  expect(localStorage.getItem('qualitrack_theme')).toBe('light');

  act(() => hook.result.current.setTheme('system'));
  expect(hook.result.current.resolvedTheme).toBe('light');
  act(() => { query.matches = true; listener(); });
  expect(hook.result.current.resolvedTheme).toBe('dark');
  expect(document.documentElement).toHaveClass('dark');

  hook.unmount();
  expect(query.removeEventListener).toHaveBeenCalledWith('change', listener);
});
