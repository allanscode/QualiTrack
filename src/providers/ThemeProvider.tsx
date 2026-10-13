import React, { useEffect, useState, useCallback, useMemo } from 'react';

export type Theme = 'light' | 'dark' | 'system';

interface ThemeContextType {
  theme: Theme;
  setTheme: React.Dispatch<React.SetStateAction<Theme>>;
  resolvedTheme: 'light' | 'dark';
}

const ThemeContext = React.createContext<ThemeContextType | undefined>(undefined);

export const useTheme = () => {
  const context = React.useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within a ThemeProvider');
  return context;
};

// Função para resolver tema do sistema (usada no logout)
export function resolveSystemTheme(): 'light' | 'dark' {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

// Função para aplicar tema ao DOM imediatamente (sem esperar React)
export function applyThemeToDOM(resolved: 'light' | 'dark') {
  const root = document.documentElement;
  if (resolved === 'dark') {
    root.classList.add('dark');
    root.style.colorScheme = 'dark';
  } else {
    root.classList.remove('dark');
    root.style.colorScheme = 'light';
  }
}

interface ThemeProviderProps {
  children: React.ReactNode;
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  const theme: Theme = 'system';
  const [resolvedTheme, setResolvedTheme] = useState(resolveSystemTheme);
  // Compatibility for session restoration: old saved choices cannot override the OS.
  const setTheme = useCallback<React.Dispatch<React.SetStateAction<Theme>>>(() => {
    setResolvedTheme(resolveSystemTheme());
  }, []);

  useEffect(() => { applyThemeToDOM(resolvedTheme); }, [resolvedTheme]);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const listener = () => setResolvedTheme(mediaQuery.matches ? 'dark' : 'light');
    listener();
    mediaQuery.addEventListener('change', listener);
    return () => mediaQuery.removeEventListener('change', listener);
  }, []);

  useEffect(() => { localStorage.setItem('qualitrack_theme', 'system'); }, []);
  const value = useMemo(() => ({ theme, setTheme, resolvedTheme }), [setTheme, resolvedTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
