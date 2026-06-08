import React from 'react';
import { useDashboard } from '../DashboardContext';
import { useQualityConfig } from '../../../lib/useQualityConfig';
import { Monitoria, User } from '../../../types';
import Card from '../../ui/Card';
import Badge from '../../ui/Badge';
import ActionDeadlineClock from '../../ui/ActionDeadlineClock';
import { Clock, ClipboardList } from 'lucide-react';
import { getStatusConfig } from '../../../lib/statusHelper';

interface RecentAuditsTableProps {
  monitorias: Monitoria[];
  users: User[];
  title?: string;
  isCustomizing?: boolean;
}


export default function RecentAuditsTable({ monitorias, users, title = 'Monitorias Recentes', isCustomizing = false }: RecentAuditsTableProps) {
  let dashboardContext = null;
  try {
    dashboardContext = useDashboard();
  } catch (e) {
    // Fail-safe if used outside of DashboardProvider
  }
  const currentUser = dashboardContext?.user;
  const { getLevelForScore } = useQualityConfig();

  const getName = (id: string) => {
    const u = users.find(u => u.id === id);
    if (!u) return id;

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
      .slice(0, 20);
  }, [monitorias]);

  return (
    <Card padding="none" className="overflow-hidden flex flex-col">
      <div className="px-6 py-4 border-b border-surface-border flex justify-between items-center bg-surface-subtle/30 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="relative w-9 h-9 rounded-xl bg-surface-subtle flex items-center justify-center flex-shrink-0 text-brand-muted" title="">
            <ClipboardList className="w-5 h-5 fill-current fill-opacity-15" strokeWidth={2} fill="currentColor" fillOpacity={0.15} />
          </div>
          <div>
            <h3 className="text-sm font-black text-brand-primary uppercase tracking-widest" title="">{title}</h3>
            <p className="text-[10px] font-bold text-brand-muted uppercase tracking-wider mt-0.5" title="">
              {displayList.length} monitoria{displayList.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto overflow-y-auto max-h-[450px] custom-scrollbar">
        <table className="w-full text-left">
          <thead>
            <tr className="text-[10px] uppercase tracking-widest text-brand-muted font-black">
              <th className="sticky top-0 z-10 bg-surface-card border-b border-surface-border px-6 py-3">#</th>
              <th className="sticky top-0 z-10 bg-surface-card border-b border-surface-border px-6 py-3">Ticket</th>
              <th className="sticky top-0 z-10 bg-surface-card border-b border-surface-border px-6 py-3">Qualidade</th>
              <th className="sticky top-0 z-10 bg-surface-card border-b border-surface-border px-6 py-3">Suporte</th>
              <th className="sticky top-0 z-10 bg-surface-card border-b border-surface-border px-6 py-3">Score</th>
              <th className="sticky top-0 z-10 bg-surface-card border-b border-surface-border px-6 py-3">Status</th>
              <th className="sticky top-0 z-10 bg-surface-card border-b border-surface-border px-6 py-3">Prazo</th>
              <th className="sticky top-0 z-10 bg-surface-card border-b border-surface-border px-6 py-3">Data</th>
            </tr>
          </thead>
          <tbody>
            {displayList.map((m) => {
              const config = getStatusConfig(m.status);
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
                  <Badge variant={config.variant} size="xs" className="gap-1 px-2.5 py-1">
                    {m.status === 'concluida' && m.resolution_type === 'automatic' ? 'Concluída Sist.' : config.label}
                    {m.resolution_type === 'automatic' && (
                      <Clock className="w-3 h-3 opacity-70" />
                    )}
                  </Badge>
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
