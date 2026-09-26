import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  Search,
  LayoutDashboard,
  ClipboardList,
  Layers,
  Settings,
  Shield,
  Plus,
  Sun,
  Moon,
  Ticket,
  User,
  ArrowRight,
  Sparkles,
  Command,
  X,
} from 'lucide-react';
import { m, AnimatePresence } from 'motion/react';
import { Monitoria, User as UserType } from '../types';

interface CommandPaletteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigateTab: (tab: string) => void;
  onNewMonitoria: () => void;
  onToggleTheme: () => void;
  isDark: boolean;
  monitorias: Monitoria[];
  users: UserType[];
}

export default function CommandPaletteModal({
  isOpen,
  onClose,
  onNavigateTab,
  onNewMonitoria,
  onToggleTheme,
  isDark,
  monitorias,
  users,
}: CommandPaletteModalProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Foco automático ao abrir
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Ações de navegação estáticas
  const navigationItems = useMemo(() => [
    {
      id: 'nav-dashboard',
      category: 'Navegação',
      title: 'Dashboard Geral',
      subtitle: 'Indicadores, Bento Grid e gráficos de qualidade',
      icon: LayoutDashboard,
      action: () => { onNavigateTab('dashboard'); onClose(); },
    },
    {
      id: 'nav-monitorias',
      category: 'Navegação',
      title: 'Lista de Monitorias',
      subtitle: 'Consultar, filtrar e auditar avaliações',
      icon: ClipboardList,
      action: () => { onNavigateTab('monitorias'); onClose(); },
    },
    {
      id: 'nav-filas',
      category: 'Navegação',
      title: 'Central de Filas',
      subtitle: 'CSAT Negativas, Proativas e Chamados Filhos',
      icon: Layers,
      action: () => { onNavigateTab('filas'); onClose(); },
    },
    {
      id: 'nav-admin',
      category: 'Navegação',
      title: 'Painel Administrativo',
      subtitle: 'Usuários, equipes, fichas e acessos',
      icon: Shield,
      action: () => { onNavigateTab('admin'); onClose(); },
    },
    {
      id: 'action-new',
      category: 'Ações Rápidas',
      title: 'Nova Monitoria',
      subtitle: 'Criar uma nova avaliação de atendimento',
      icon: Plus,
      action: () => { onNewMonitoria(); onClose(); },
    },
    {
      id: 'action-theme',
      category: 'Ações Rápidas',
      title: isDark ? 'Ativar Modo Claro' : 'Ativar Modo Escuro',
      subtitle: 'Alternar tema de contraste visual da interface',
      icon: isDark ? Sun : Moon,
      action: () => { onToggleTheme(); onClose(); },
    },
  ], [onNavigateTab, onNewMonitoria, onToggleTheme, isDark, onClose]);

  // Busca dinâmica de tickets e atendentes
  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return navigationItems;

    // Filtra navegação
    const matchedNav = navigationItems.filter(
      item => item.title.toLowerCase().includes(q) || item.subtitle.toLowerCase().includes(q)
    );

    // Filtra monitorias por ticket ou protocolo ou atendente
    const cleanNum = q.replace(/^#/, '');
    const matchedMonitorias = monitorias
      .filter(m => {
        const ticketMatch = String(m.ticket_id || '').toLowerCase().includes(cleanNum);
        const displayMatch = String(m.display_id || '').toLowerCase().includes(cleanNum);
        const agentName = (m.evaluated_name || users.find(u => u.id === m.evaluated_id)?.name || '').toLowerCase();
        const agentMatch = agentName.includes(q);
        return ticketMatch || displayMatch || agentMatch;
      })
      .slice(0, 8)
      .map(m => {
        const agent = m.evaluated_name || users.find(u => u.id === m.evaluated_id)?.name || 'Atendente';
        return {
          id: `mon-${m.id}`,
          category: 'Monitorias & Tickets',
          title: `Ticket #${m.ticket_id || m.display_id || 'S/N'} • ${agent}`,
          subtitle: `Nota: ${m.score !== undefined ? `${m.score}%` : 'N/A'} — Status: ${m.status}`,
          icon: Ticket,
          action: () => {
            window.dispatchEvent(
              new CustomEvent('qualitrack:focus_monitoria', {
                detail: { monitoriaId: m.id, ticketId: m.ticket_id },
              })
            );
            onClose();
          },
        };
      });

    return [...matchedNav, ...matchedMonitorias];
  }, [query, navigationItems, monitorias, users, onClose]);

  // Navegação por teclado
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => (prev + 1) % Math.max(1, searchResults.length));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => (prev - 1 + searchResults.length) % Math.max(1, searchResults.length));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (searchResults[selectedIndex]) {
          searchResults[selectedIndex].action();
        }
      } else if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, searchResults, selectedIndex, onClose]);

  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-16 sm:pt-24 px-4 bg-black/40 backdrop-blur-md animate-fade-in"
      onMouseDown={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <m.div
        initial={{ opacity: 0, scale: 0.96, y: -10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: -10 }}
        transition={{ duration: 0.15, ease: 'easeOut' }}
        className="w-full max-w-2xl bg-surface-card border border-surface-border rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[75vh]"
      >
        {/* Input Bar */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-surface-border bg-surface-bg/50">
          <Search className="w-5 h-5 text-brand-muted shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            placeholder="Buscar tickets (#99022), atendente ou navegar..."
            className="w-full bg-transparent text-sm font-semibold text-brand-primary placeholder:text-brand-muted/60 focus:outline-none"
          />
          <div className="flex items-center gap-1.5 shrink-0">
            <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded border border-surface-border text-[10px] font-mono font-bold text-brand-muted bg-surface-card shadow-xs">
              ESC
            </kbd>
            <button
              onClick={onClose}
              className="p-1 rounded-lg text-brand-muted hover:text-brand-primary hover:bg-surface-subtle transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Results List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {searchResults.length === 0 ? (
            <div className="p-8 text-center text-xs font-bold text-brand-muted">
              Nenhum ticket, atendente ou comando encontrado para &quot;{query}&quot;.
            </div>
          ) : (
            searchResults.map((item, idx) => {
              const isSelected = idx === selectedIndex;
              const Icon = item.icon;
              return (
                <div
                  key={item.id}
                  onClick={item.action}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`flex items-center justify-between p-2.5 rounded-xl cursor-pointer transition-all ${
                    isSelected
                      ? 'bg-brand-primary text-brand-on-primary shadow-xs'
                      : 'hover:bg-surface-subtle/80 text-brand-primary'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1 mr-2">
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                        isSelected
                          ? 'bg-white/20 text-brand-on-primary'
                          : 'bg-surface-subtle text-brand-primary'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-black truncate">{item.title}</span>
                        <span
                          className={`text-[9px] uppercase font-bold px-1.5 py-0.2 rounded-md ${
                            isSelected
                              ? 'bg-white/15 text-brand-on-primary'
                              : 'bg-surface-subtle text-brand-muted'
                          }`}
                        >
                          {item.category}
                        </span>
                      </div>
                      <p
                        className={`text-[11px] truncate font-medium ${
                          isSelected ? 'text-brand-on-primary/80' : 'text-brand-muted'
                        }`}
                      >
                        {item.subtitle}
                      </p>
                    </div>
                  </div>
                  {isSelected && (
                    <ArrowRight className="w-4 h-4 text-brand-on-primary shrink-0 opacity-80" />
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer Shortcut Bar */}
        <div className="px-4 py-2 border-t border-surface-border bg-surface-bg/40 flex items-center justify-between text-[10px] text-brand-muted font-semibold">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded border border-surface-border bg-surface-card font-mono text-[9px]">
                ↑
              </kbd>
              <kbd className="px-1.5 py-0.5 rounded border border-surface-border bg-surface-card font-mono text-[9px]">
                ↓
              </kbd>
              navegar
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded border border-surface-border bg-surface-card font-mono text-[9px]">
                ENTER
              </kbd>
              selecionar
            </span>
          </div>
          <span className="flex items-center gap-1">
            <Command className="w-3 h-3 text-brand-muted" />
            QualiTrack QuickSearch
          </span>
        </div>
      </m.div>
    </div>,
    document.body
  );
}
