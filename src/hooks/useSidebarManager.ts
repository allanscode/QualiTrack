import { useState, useEffect, useRef, useMemo } from 'react';
import { useTheme } from '../providers/ThemeProvider';
import { useAuth } from '../providers/AuthProvider';
import { useStaticData } from '../lib/StaticDataContext';
import { upsertUserPreferences } from '../lib/supabase';
import { lastDbThemeRef } from './useSessionManager';
import type { Theme } from '../providers/ThemeProvider';
import type { User } from '../types';

export const lightToDarkColorMap: Record<string, string> = {
  '#475569': '#1E293B',
  '#3B82F6': '#1B2A4A',
  '#60A5FA': '#253366',
  '#34D399': '#0F5132',
  '#10B981': '#1A3A2A',
  '#7D9B82': '#3C4E2D',
  '#D97706': '#7A431D',
  '#EA580C': '#8A331E',
  '#C2410C': '#422006',
  '#DC2626': '#5C0624',
  '#F43F5E': '#801438',
  '#A78BFA': '#522258',
  '#7C3AED': '#3B0764',
  '#8B5CF6': '#4C1D95',
  '#0D9488': '#0F6B5C',
  '#B45309': '#7A431D',
  '#854D0E': '#422006',
  '#64748B': '#475569',
  '#84CC16': '#3C4E2D'
};

export const darkToLightColorMap: Record<string, string> = {
  '#1E293B': '#475569',
  '#1B2A4A': '#3B82F6',
  '#253366': '#60A5FA',
  '#0F5132': '#34D399',
  '#1A3A2A': '#10B981',
  '#3C4E2D': '#7D9B82',
  '#7A431D': '#D97706',
  '#8A331E': '#EA580C',
  '#422006': '#854D0E',
  '#5C0624': '#DC2626',
  '#801438': '#F43F5E',
  '#522258': '#A78BFA',
  '#3B0764': '#7C3AED',
  '#4C1D95': '#8B5CF6',
  '#0F6B5C': '#0D9488',
  '#12130F': '#475569',
  '#2F3129': '#64748B',
  '#0F4C81': '#3B82F6',
  '#475569': '#64748B'
};

export function isDarkColor(hex: string, resolvedTheme: 'light' | 'dark'): boolean {
  if (!hex) return resolvedTheme === 'dark';
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return resolvedTheme === 'dark';
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  const luma = (r * 299 + g * 587 + b * 114) / 1000;
  return luma < 128;
}

interface SidebarManagerOptions {
  userData: User | null;
  currentUser: any;
  prefetchedSidebarColor: string;
}

export function useSidebarManager(opts: SidebarManagerOptions) {
  const { userData, currentUser, prefetchedSidebarColor } = opts;
  const { resolvedTheme } = useTheme();
  const { theme, setTheme } = useAuth();
  const { teams, userPreferences, loading: staticDataLoading } = useStaticData();

  const [sidebarColor, setSidebarColor] = useState<string>(() => {
    if (prefetchedSidebarColor) return prefetchedSidebarColor;
    if (typeof window !== 'undefined') {
      const email = userData?.email || currentUser?.email || '';
      if (email) {
        return localStorage.getItem(`qualitrack_sidebar_color_${email}`) || '';
      }
    }
    return '';
  });

  const sidebarColors = useMemo(() => {
    if (resolvedTheme === 'dark') {
      return [
        { value: '', label: 'Padrão', hex: 'bg-gradient-to-br from-brand-muted/20 to-brand-primary/20' },
        { value: '#12130F', label: 'Obsidiana', hex: 'bg-[#12130F]' },
        { value: '#2F3129', label: 'Grafite Escuro', hex: 'bg-[#2F3129]' },
        { value: '#1E293B', label: 'Slate Azulado', hex: 'bg-[#1E293B]' },
        { value: '#1B2A4A', label: 'Azul Marinho', hex: 'bg-[#1B2A4A]' },
        { value: '#253366', label: 'Azul Indigo', hex: 'bg-[#253366]' },
        { value: '#0F4C81', label: 'Azul Oceano', hex: 'bg-[#0F4C81]' },
        { value: '#0F5132', label: 'Esmeralda Escuro', hex: 'bg-[#0F5132]' },
        { value: '#1A3A2A', label: 'Verde Floresta', hex: 'bg-[#1A3A2A]' },
        { value: '#3C4E2D', label: 'Verde Oliva', hex: 'bg-[#3C4E2D]' },
        { value: '#0F6B5C', label: 'Menta Escuro', hex: 'bg-[#0F6B5C]' },
        { value: '#7A431D', label: 'Bronze / Cobre', hex: 'bg-[#7A431D]' },
        { value: '#422006', label: 'Café Profundo', hex: 'bg-[#422006]' },
        { value: '#8A331E', label: 'Terracota Escuro', hex: 'bg-[#8A331E]' },
        { value: '#5C0624', label: 'Vinho', hex: 'bg-[#5C0624]' },
        { value: '#801438', label: 'Cereja Negra', hex: 'bg-[#801438]' },
        { value: '#522258', label: 'Ametista', hex: 'bg-[#522258]' },
        { value: '#3B0764', label: 'Roxo Meia-Noite', hex: 'bg-[#3B0764]' },
        { value: '#4C1D95', label: 'Lavanda Escuro', hex: 'bg-[#4C1D95]' },
        { value: '#475569', label: 'Aço Escuro', hex: 'bg-[#475569]' }
      ];
    } else {
      return [
        { value: '', label: 'Padrão', hex: 'bg-gradient-to-br from-brand-muted/20 to-brand-primary/20' },
        { value: '#475569', label: 'Slate Clássico', hex: 'bg-[#475569]' },
        { value: '#3B82F6', label: 'Azul Denim', hex: 'bg-[#3B82F6]' },
        { value: '#60A5FA', label: 'Azul Celeste', hex: 'bg-[#60A5FA]' },
        { value: '#34D399', label: 'Verde Hortelã', hex: 'bg-[#34D399]' },
        { value: '#10B981', label: 'Esmeralda Suave', hex: 'bg-[#10B981]' },
        { value: '#7D9B82', label: 'Verde Sálvia', hex: 'bg-[#7D9B82]' },
        { value: '#D97706', label: 'Amarelo Mostarda', hex: 'bg-[#D97706]' },
        { value: '#EA580C', label: 'Laranja Cenoura', hex: 'bg-[#EA580C]' },
        { value: '#C2410C', label: 'Terracota Suave', hex: 'bg-[#C2410C]' },
        { value: '#DC2626', label: 'Vermelho Carmim', hex: 'bg-[#DC2626]' },
        { value: '#F43F5E', label: 'Rosa Coral', hex: 'bg-[#F43F5E]' },
        { value: '#A78BFA', label: 'Lilás Médio', hex: 'bg-[#A78BFA]' },
        { value: '#7C3AED', label: 'Roxo Real', hex: 'bg-[#7C3AED]' },
        { value: '#8B5CF6', label: 'Ameixa', hex: 'bg-[#8B5CF6]' },
        { value: '#0D9488', label: 'Azul Turquesa', hex: 'bg-[#0D9488]' },
        { value: '#B45309', label: 'Bronze Dourado', hex: 'bg-[#B45309]' },
        { value: '#854D0E', label: 'Argila', hex: 'bg-[#854D0E]' },
        { value: '#64748B', label: 'Aço Claro', hex: 'bg-[#64748B]' },
        { value: '#84CC16', label: 'Verde Oliva Claro', hex: 'bg-[#84CC16]' }
      ];
    }
  }, [resolvedTheme]);

  const prevThemeUserIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!userData?.id) return;
    if (staticDataLoading) return;

    const userId = userData.id;
    const isLogin = prevThemeUserIdRef.current !== userId;
    prevThemeUserIdRef.current = userId;

    const myPrefs = userPreferences[userId];
    const dbTheme = myPrefs?.theme;

    if (dbTheme) {
      lastDbThemeRef.current = dbTheme;
      setTheme(dbTheme);
      localStorage.setItem('qualitrack_theme', dbTheme);
    } else if (isLogin && myPrefs !== undefined) {
      const osDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      const resolved = osDark ? 'dark' as const : 'light' as const;
      lastDbThemeRef.current = resolved;
      setTheme(resolved);
      localStorage.setItem('qualitrack_theme', resolved);
      upsertUserPreferences(userId, { theme: resolved });
    }
  }, [userData?.id, userPreferences, staticDataLoading]);

  const prevThemeForDbRef = useRef<'light' | 'dark' | 'system' | null>(null);
  useEffect(() => {
    if (!userData?.id) return;
    if (staticDataLoading) return;
    if (theme === prevThemeForDbRef.current) return;
    prevThemeForDbRef.current = theme;

    const resolved = theme === 'system'
      ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' as const : 'light' as const)
      : theme;

    if (resolved !== lastDbThemeRef.current) {
      lastDbThemeRef.current = resolved;
      upsertUserPreferences(userData.id, { theme: resolved });
    }
  }, [theme, userData?.id, staticDataLoading]);

  useEffect(() => {
    if (!userData?.id) return;
    const userId = userData.id;
    const email = userData.email || currentUser?.email;

    const myPrefs = userPreferences[userId];
    let dbColor: string | undefined = myPrefs?.sidebar_color;

    if (!dbColor) {
      const metadataColor = currentUser?.user_metadata?.sidebar_color;
      if (metadataColor) {
        dbColor = metadataColor;
        upsertUserPreferences(userId, { sidebar_color: metadataColor });
      }
    }

    const finalColor = dbColor || '';
    setSidebarColor(finalColor);
    if (email) localStorage.setItem(`qualitrack_sidebar_color_${email}`, finalColor);
  }, [userData?.id, userPreferences]);

  const handleSidebarColorChange = async (color: string) => {
    setSidebarColor(color);
    const email = userData?.email || currentUser?.email;
    if (email) {
      localStorage.setItem(`qualitrack_sidebar_color_${email}`, color);
    }
    if (userData?.id) {
      await upsertUserPreferences(userData.id, { sidebar_color: color });
    }
  };

  const handleThemeChange = async (newTheme: Theme) => {
    const currentResolved = resolvedTheme;
    let targetResolved: 'light' | 'dark';
    if (newTheme === 'system') {
      targetResolved = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    } else {
      targetResolved = newTheme;
    }

    if (currentResolved !== targetResolved) {
      let mappedColor = sidebarColor;
      if (targetResolved === 'light') {
        mappedColor = darkToLightColorMap[sidebarColor] !== undefined ? darkToLightColorMap[sidebarColor] : '';
      } else {
        mappedColor = lightToDarkColorMap[sidebarColor] !== undefined ? lightToDarkColorMap[sidebarColor] : '';
      }

      setSidebarColor(mappedColor);
      const email = userData?.email || currentUser?.email;
      if (email) {
        localStorage.setItem(`qualitrack_sidebar_color_${email}`, mappedColor);
      }
      if (userData?.id) {
        await upsertUserPreferences(userData.id, { sidebar_color: mappedColor });
      }
    }

    setTheme(newTheme);
  };

  const isSidebarLight = !isDarkColor(sidebarColor, resolvedTheme);
  const sidebarIsDark = !isSidebarLight;
  const sidebarContrastClass = isSidebarLight ? 'text-slate-900' : 'text-white';
  const sidebarContrastSubtle = isSidebarLight ? 'text-slate-700/60' : 'text-white/40';
  const sidebarBorderClass = isSidebarLight ? 'border-black/5' : 'border-white/5';

  const sidebarStyle = {
    backgroundColor: sidebarColor || `var(--sidebar-bg-${(userData?.role || 'admin').replace('_', '-')})`,
  };

  return {
    sidebarColor,
    sidebarColors,
    handleSidebarColorChange,
    handleThemeChange,
    sidebarIsDark,
    sidebarContrastClass,
    sidebarContrastSubtle,
    sidebarBorderClass,
    sidebarStyle,
  };
}
