import React, { useEffect, useState, useMemo } from 'react';

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

// Detecta uma sessão real do Supabase no localStorage sem depender do ref do
// projeto. A versão anterior checava a chave literal
// 'sb-amyfyngzkqqzixmreeih-auth-token' — o ref de um projeto Supabase de
// terceiro (script de dev esquecido no repo original, nada a ver com este
// projeto). O supabase-js nomeia a chave como 'sb-<ref>-auth-token', então
// aquela checagem nunca batia com a sessão real deste app (ref
// vpytvgpsqdapgouyjowc) — o tema de usuário logado nunca era persistido em
// modo Supabase (só em Mock Mode, via 'qualitrack_session'). Escanear pelo
// padrão em vez do ref fixo corrige isso e sobrevive a uma eventual troca de
// projeto no futuro.
function hasSupabaseAuthToken(): boolean {
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith('sb-') && key.endsWith('-auth-token')) return true;
  }
  return false;
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
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem('qualitrack_theme');
    if (saved === 'light' || saved === 'dark' || saved === 'system') return saved;
    return 'system';
  });

  const resolvedTheme = useMemo(() => {
    if (theme === 'system') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return theme;
  }, [theme]);

  useEffect(() => {
    const root = document.documentElement;
    if (resolvedTheme === 'dark') {
      root.classList.add('dark');
      root.style.colorScheme = 'dark';
    } else {
      root.classList.remove('dark');
      root.style.colorScheme = 'light';
    }
  }, [resolvedTheme]);

  // Listener para mudança de tema do OS
  useEffect(() => {
    if (theme !== 'system') return;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const listener = () => {
      // Força um re-render para que `resolvedTheme` seja recalculado
      setTheme('system');
    };
    mediaQuery.addEventListener('change', listener);
    return () => mediaQuery.removeEventListener('change', listener);
  }, [theme]);

  // Salva no localStorage (apenas quando logado)
  useEffect(() => {
    if (localStorage.getItem('qualitrack_session') || hasSupabaseAuthToken()) {
      // Save the literal theme (including 'system'), not resolvedTheme
      localStorage.setItem('qualitrack_theme', theme);
    }
  }, [theme]);

  const value = { theme, setTheme, resolvedTheme };

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}