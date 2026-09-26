import React, { useState, useMemo } from 'react';
import { X, Search, ExternalLink, Shield, Tag, User as UserIcon } from 'lucide-react';
import Card from '../../ui/Card';
import Badge from '../../ui/Badge';
import Button from '../../ui/Button';
import { Monitoria } from '../../../types';
import { getStatusConfig } from '../../../lib/statusHelper';
import { formatTimelineDateTime } from '../../../lib/timeline';
import { matchesSearch } from '../../../utils/search';

interface SupportDrillDownModalProps {
  title: string;
  subtitle?: string;
  monitorias: Monitoria[];
  onClose: () => void;
  onNavigateToMonitoria?: (monitoriaId: string, ticketId?: string) => void;
}

export default function SupportDrillDownModal({
  title,
  subtitle,
  monitorias,
  onClose,
  onNavigateToMonitoria,
}: SupportDrillDownModalProps) {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredMonitorias = useMemo(() => {
    if (!searchTerm.trim()) return monitorias;
    return monitorias.filter(m => {
      const displayId = String(m.display_id || '');
      const ticketId = String(m.ticket_id || '');
      const agent = m.evaluated_name || '';
      const team = m.team_name || '';
      const score = m.score !== undefined && m.score !== null ? `${m.score}%` : '';

      return (
        matchesSearch(displayId, searchTerm) ||
        matchesSearch(ticketId, searchTerm) ||
        matchesSearch(agent, searchTerm) ||
        matchesSearch(team, searchTerm) ||
        matchesSearch(score, searchTerm)
      );
    });
  }, [monitorias, searchTerm]);

  const handleOpenMonitoria = (m: Monitoria) => {
    if (onNavigateToMonitoria) {
      onNavigateToMonitoria(m.id, m.ticket_id);
    } else {
      window.dispatchEvent(
        new CustomEvent('qualitrack:focus_monitoria', {
          detail: { monitoriaId: m.id, ticketId: m.ticket_id },
        })
      );
    }
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/25 dark:bg-black/40 backdrop-blur-md animate-fade-in"
      onClick={onClose}
    >
      <div
        className="max-w-4xl w-full h-[92vh] sm:h-auto sm:max-h-[85vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <Card
          padding="none"
          className="w-full flex-1 flex flex-col bg-surface-card border-t sm:border border-surface-border rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden"
        >
        {/* Header */}
        <div className="p-4 sm:p-6 border-b border-surface-border flex items-center justify-between gap-3 sm:gap-4">
          <div>
            <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
              <h3 className="text-base sm:text-lg font-black text-brand-primary uppercase tracking-tight">
                {title}
              </h3>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-brand-accent/10 text-brand-accent border border-brand-accent/20">
                {filteredMonitorias.length} {filteredMonitorias.length === 1 ? 'ticket' : 'tickets'}
              </span>
            </div>
            {subtitle && (
              <p className="text-xs text-brand-muted mt-1 font-medium">{subtitle}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-brand-muted hover:text-brand-primary hover:bg-surface-subtle transition-colors cursor-pointer"
            title="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Toolbar de Busca */}
        <div className="p-4 bg-surface-bg/40 border-b border-surface-border flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-muted" />
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Buscar por ticket, atendente, equipe ou protocolo..."
              className="w-full bg-surface-card border border-surface-border rounded-xl pl-10 pr-4 py-2 text-xs font-medium text-brand-primary placeholder:text-brand-muted focus:outline-none focus:border-brand-accent transition-all"
            />
          </div>
        </div>

        {/* Lista de Registros */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {filteredMonitorias.length === 0 ? (
            <div className="text-center py-12 text-brand-muted">
              <p className="text-sm font-semibold">Nenhum registro encontrado.</p>
              <p className="text-xs mt-1 opacity-70">
                Tente ajustar o termo de busca ou selecione outro período no dashboard.
              </p>
            </div>
          ) : (
            filteredMonitorias.map(m => {
              const cfg = getStatusConfig(m.status);
              const score = m.score ?? 0;
              const isPositive = score >= 75;

              return (
                <div
                  key={m.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 rounded-2xl bg-surface-bg/60 hover:bg-surface-subtle/80 border border-surface-border/50 transition-all gap-3 sm:gap-4"
                >
                  {/* Identificação */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="text-[10px] font-black text-brand-muted uppercase tracking-widest">
                        #{m.display_id || m.id.slice(0, 6)}
                      </span>
                      <span className="text-brand-muted/30">•</span>
                      <span className="font-mono text-xs font-black text-brand-primary tracking-tight">
                        Chamado #{m.ticket_id}
                      </span>
                      <span className="text-brand-muted/30">•</span>
                      <Badge variant={cfg.variant} size="sm">
                        {cfg.label}
                      </Badge>
                    </div>

                    <div className="flex items-center gap-3 text-[11px] font-medium text-brand-muted flex-wrap">
                      <span className="flex items-center gap-1 text-brand-primary font-semibold">
                        <UserIcon className="w-3 h-3 text-brand-highlight" />
                        {m.evaluated_name || 'Atendente'}
                      </span>
                      {m.team_name && (
                        <>
                          <span className="text-brand-muted/30">•</span>
                          <span className="flex items-center gap-1">
                            <Tag className="w-3 h-3 text-brand-highlight" />
                            {m.team_name}
                          </span>
                        </>
                      )}
                      <span className="text-brand-muted/30">•</span>
                      <span>{formatTimelineDateTime(m.created_at)}</span>
                    </div>
                  </div>

                  {/* Score & Ação */}
                  <div className="flex items-center justify-between sm:justify-end gap-4 flex-shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-surface-border/40">
                    <div className="text-right">
                      <span
                        className={`text-base font-black ${
                          isPositive ? 'text-functional-success' : 'text-functional-error'
                        }`}
                      >
                        {m.score !== undefined && m.score !== null ? `${m.score}%` : '—'}
                      </span>
                      <p className="text-[9px] font-bold text-brand-muted uppercase tracking-wider">
                        {isPositive ? 'Válido' : 'Invalidado'}
                      </p>
                    </div>

                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleOpenMonitoria(m)}
                      icon={<ExternalLink className="w-3.5 h-3.5" />}
                    >
                      Ver
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </Card>
      </div>
    </div>
  );
}
