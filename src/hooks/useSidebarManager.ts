import { useEffect, useRef } from 'react';
import { useTheme } from '../providers/ThemeProvider';
import { useAuth } from '../providers/AuthProvider';
import { useStaticData } from '../lib/StaticDataContext';
import { upsertUserPreferences } from '../lib/supabase';
import { lastDbThemeRef } from './useSessionManager';
import type { Theme } from '../providers/ThemeProvider';
import type { User } from '../types';

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

const DEFAULT_SIDEBAR_COLORS: Record<string, { light: string; dark: string }> = {
  admin: { light: '#F9F9F6', dark: '#1F2937' },
  gestor_qualidade: { light: '#F9F9F6', dark: '#1F2937' },
  qualidade: { light: '#F9F9F6', dark: '#1F2937' },
  gestor_suporte: { light: '#F9F9F6', dark: '#1F2937' },
  suporte: { light: '#F9F9F6', dark: '#1F2937' },
};

function getDefaultSidebarColor(role: string, resolvedTheme: 'light' | 'dark'): string {
  return DEFAULT_SIDEBAR_COLORS[role]?.[resolvedTheme] ?? DEFAULT_SIDEBAR_COLORS.admin[resolvedTheme];
}

interface SidebarManagerOptions {
  userData: User | null;
}

export function useSidebarManager({ userData }: SidebarManagerOptions) {
  const { resolvedTheme } = useTheme();
  const { theme, setTheme } = useAuth();
  const { loading: staticDataLoading } = useStaticData();
  const role = userData?.role || 'admin';
  const sidebarColor = getDefaultSidebarColor(role, resolvedTheme);

  const prevThemeForDbRef = useRef<'light' | 'dark' | 'system' | null>(null);
  useEffect(() => {
    if (!userData?.id || staticDataLoading || theme === prevThemeForDbRef.current) return;
    prevThemeForDbRef.current = theme;
    if (theme !== lastDbThemeRef.current) {
      lastDbThemeRef.current = theme;
      upsertUserPreferences(userData.id, { theme });
    }
  }, [theme, userData?.id, staticDataLoading]);

  const handleThemeChange = async (newTheme: Theme) => {
    setTheme(newTheme);
  };

  const sidebarIsDark = isDarkColor(sidebarColor, resolvedTheme);
  const sidebarContrastClass = sidebarIsDark ? 'text-white' : 'text-slate-900';
  const sidebarContrastSubtle = sidebarIsDark ? 'text-white/40' : 'text-slate-700/60';
  const sidebarBorderClass = sidebarIsDark ? 'border-white/5' : 'border-black/5';
  const sidebarStyle = {
    backgroundColor: `var(--sidebar-bg-${role.replace('_', '-')})`,
  };

  return {
    sidebarColor,
    handleThemeChange,
    sidebarIsDark,
    sidebarContrastClass,
    sidebarContrastSubtle,
    sidebarBorderClass,
    sidebarStyle,
  };
}
