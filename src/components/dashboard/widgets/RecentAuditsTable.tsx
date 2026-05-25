import React from 'react';
import { useDashboard } from '../DashboardContext';
import { useQualityConfig } from '../../../lib/useQualityConfig';
import { Monitoria, User } from '../../../types';
import Card from '../../ui/Card';
import ActionDeadlineClock from '../../ui/ActionDeadlineClock';

interface RecentAuditsTableProps {
  monitorias: Monitoria[];
  users: User[];
  limit?: number;
  title?: string;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  pendente_revisao:            { label: 'Aguardando Suporte',  color: 'text-warning',        bg: 'bg-warning/10' },
  em_contestacao:              { label: 'Em Reanálise',         color: 'text-orange-600',     bg: 'bg-orange-50' },
  aguardando_gestor_suporte:   { label: 'Aguardando Gestor',    color: 'text-info',            bg: 'bg-info/10' },
  aguardando_gestor_qualidade: { label: 'Aguardando Qualidade', color: 'text-purple-600',     bg: 'bg-purple-50' },
  concluida:                   { label: 'Finalizada',           color: 'text-success',         bg: 'bg-success/10' },
  contestacao_aceita:          { label: 'Contestação Aceita',   color: 'text-success',         bg: 'bg-success/10' },
  contestacao_negada:          { label: 'Contestação Negada',   color: 'text-error',           bg: 'bg-error/10' },
  finalizada_alterada:         { label: 'Finalizada Alterada',  color: 'text-info',            bg: 'bg-info/10' },
};

export default function RecentAuditsTable({ monitorias, users, limit = 8, title = 'Monitorias Recentes' }: RecentAuditsTableProps) {
  const { user: currentUser } = useDashboard();
  const { getLevelForScore } = useQualityConfig();

  const getName = (id: string) => {
    const u = users.find(u => u.id === id);
    if (!u) return id;

    // Anonymize auditor for agents and support managers
    const isProtectedRole = ['suporte', 'gestor_suporte'].includes(currentUser?.role || '');
    const isAuditorRole = ['qualidade', 'gestor_qualidade', 'admin'].includes(u.role);

    if (isProtectedRole && isAuditorRole) {
      return 'Análise da Qualidade';
    }

    return u.name;
  };

  const displayList = React.useMemo(() => {
    return [...monitorias]
      .sort((a, b) => {
        const dateA = new Date(a.created_at).getTime();
        const dateB = new Date(b.created_at).getTime();
        return dateB - dateA;
      })
      .slice(0, limit);
  }, [monitorias, limit]);

  return (
    <Card padding="none" className="overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-surface-border flex justify-between items-center bg-surface-subtle/30">
        <div>
          <h3 className="text-sm font-black text-brand-primary uppercase tracking-widest">{title}</h3>
          <p className="text-[10px] font-bold text-brand-muted uppercase tracking-wider mt-0.5">
            Mostrando {displayList.length} de {monitorias.length} monitorias
          </p>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto overflow-y-auto max-h-[450px] custom-scrollbar">
        <table className="w-full text-left">
          <thead className="bg-surface-subtle/20">
            <tr className="text-[10px] uppercase tracking-widest text-brand-muted font-black border-b border-surface-border">
              <th className="px-6 py-3">#</th>
              <th className="px-6 py-3">Ticket</th>
              <th className="px-6 py-3">Qualidade</th>
              <th className="px-6 py-3">Suporte</th>
              <th className="px-6 py-3">Score</th>
              <th className="px-6 py-3">Status</th>
              <th className="px-6 py-3">Prazo</th>
              <th className="px-6 py-3">Data</th>
            </tr>
          </thead>
          <tbody>
            {displayList.map((m) => {
              const cfg = STATUS_CONFIG[m.status] || { label: m.status, color: 'text-brand-muted', bg: 'bg-surface-subtle' };
              const sc = m.score || 0;
              const level = getLevelForScore(sc);
              return (
                <tr key={m.id} className="border-t border-surface-border/60 hover:bg-surface-subtle/30 transition-colors">
                  <td className="px-6 py-3.5 font-mono font-black text-[10px] text-brand-muted">#{m.display_id || m.id.slice(0,4)}</td>
                  <td className="px-6 py-3.5 font-mono font-black text-sm text-brand-primary">#{m.ticket_id}</td>
                  <td className="px-6 py-3.5 text-sm font-semibold text-brand-primary">{getName(m.evaluator_id)}</td>
                  <td className="px-6 py-3.5 text-sm font-medium text-brand-muted">{getName(m.evaluated_id)}</td>
                  <td className="px-6 py-3.5">
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider ${level.bgColor} ${level.color}`}>
                      {sc.toFixed(2)}%
                    </span>
                  </td>
                  <td className="px-6 py-3.5">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider ${cfg.bg} ${cfg.color}`}>
                      {cfg.label}
                    </span>
                  </td>
                  <td className="px-6 py-3.5">
                    <ActionDeadlineClock actionDeadlineAt={m.action_deadline_at} status={m.status} />
                  </td>
                  <td className="px-6 py-3.5 text-[10px] font-bold text-brand-muted uppercase tracking-wider">
                    {new Date(m.created_at).toLocaleDateString('pt-BR')}
                  </td>
                </tr>
              );
            })}
            {displayList.length === 0 && (
              <tr>
                <td colSpan={8} className="px-6 py-12 text-center text-brand-muted text-xs font-bold uppercase tracking-widest">
                  Nenhuma monitoria encontrada
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
