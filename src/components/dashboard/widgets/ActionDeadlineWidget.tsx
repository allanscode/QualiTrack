import React, { useState } from 'react';
import { Clock } from 'lucide-react';
import { Monitoria } from '../../../types';
import Card from '../../ui/Card';
import Badge from '../../ui/Badge';
import ActionDeadlineClock from '../../ui/ActionDeadlineClock';
import { useQualityConfig } from '../../../lib/useQualityConfig';
import { useDashboard } from '../DashboardContext';
import { toast } from 'sonner';

interface ActionDeadlineWidgetProps {
  title: string;
  monitorias: Monitoria[];
  targetStatus: string | string[];
}

export default function ActionDeadlineWidget({ title, monitorias, targetStatus }: ActionDeadlineWidgetProps) {
  const { config, saveConfig } = useQualityConfig();
  const [isEditing, setIsEditing] = useState(false);
  const [tempTitle, setTempTitle] = useState('');

  let dashboardContext = null;
  try {
    dashboardContext = useDashboard();
  } catch (e) {}
  const user = dashboardContext?.user;
  const isAdmin = user?.role === 'admin';

  const customTitle = (config?.dashboardWidgetTitles?.[title] !== undefined && config.dashboardWidgetTitles[title] !== '')
    ? config.dashboardWidgetTitles[title]
    : title;

  const handleEditClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setTempTitle(customTitle);
    setIsEditing(true);
  };

  const handleSave = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const updatedTitles = {
        ...(config.dashboardWidgetTitles || {}),
        [title]: tempTitle,
      };
      await saveConfig({
        ...config,
        dashboardWidgetTitles: updatedTitles,
      });
      toast.success('Título atualizado com sucesso!');
      setIsEditing(false);
    } catch (err) {
      toast.error('Erro ao salvar título.');
    }
  };

  const statuses = Array.isArray(targetStatus) ? targetStatus : [targetStatus];

  const pending = monitorias
    .filter(m => statuses.includes(m.status) && !['concluida', 'contestacao_aceita', 'contestacao_negada', 'finalizada_alterada'].includes(m.status))
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    .slice(0, 5);

  const getName = (m: Monitoria) => {
    if (m.status === 'pendente_revisao') return m.evaluator_name || m.evaluator_id;
    return m.evaluated_name || m.evaluated_id;
  };

  return (
    <Card padding="lg" className="h-full flex flex-col">
      {isEditing ? (
        <div className="flex flex-col gap-2 mb-5 animate-fade-in" onClick={(e) => e.stopPropagation()}>
          <span className="text-[10px] font-black uppercase tracking-widest text-brand-muted">
            Editar Título:
          </span>
          <input
            type="text"
            value={tempTitle}
            onChange={(e) => setTempTitle(e.target.value.slice(0, 35))}
            maxLength={35}
            className="w-full text-xs p-1.5 rounded-lg border border-surface-border bg-surface-bg text-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-accent h-8"
            placeholder="Digite o título (máx. 35 caracteres)..."
            autoFocus
          />
          <div className="text-[10px] text-brand-muted text-right -mt-1">
            {tempTitle.length}/35
          </div>
          <div className="flex justify-end gap-1.5">
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded-md text-brand-muted hover:bg-surface-subtle transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded-md bg-brand-accent text-white hover:bg-brand-accent/90 transition-colors cursor-pointer"
            >
              Salvar
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2.5 mb-5 min-w-0">
          <div 
            onClick={isAdmin ? handleEditClick : undefined}
            className={`w-9 h-9 rounded-xl bg-functional-warning flex items-center justify-center flex-shrink-0 text-functional-warning ${
              isAdmin ? 'cursor-pointer hover:ring-2 hover:ring-brand-accent/50 transition-all' : ''
            }`}
            title={isAdmin ? "Clique para editar título" : undefined}
          >
            <Clock className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-black text-brand-primary uppercase tracking-widest leading-tight truncate">{customTitle}</h3>
            <p className="text-[10px] font-bold text-brand-muted uppercase tracking-wider mt-0.5 truncate">
              {pending.length} pendência{pending.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
      )}

      <div className="space-y-2.5 flex-1 overflow-y-auto max-h-[400px] pr-2 custom-scrollbar">
        {pending.length > 0 ? pending.map((m) => {
          const days = Math.floor((new Date().getTime() - new Date(m.created_at).getTime()) / (1000 * 3600 * 24));
          const isCritical = days >= 2;

          return (
            <div key={m.id} className="flex items-center justify-between p-3.5 rounded-2xl border border-surface-border hover:bg-surface-subtle/40 transition-colors">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <Badge variant="info" size="xs">Mon: {m.display_id || m.id.slice(0, 4)}</Badge>
                  <span className="font-mono text-[10px] font-black text-brand-primary">#{m.ticket_id}</span>
                </div>
                <p className="text-[10px] text-brand-muted truncate font-bold uppercase tracking-wider">
                  {m.status === 'pendente_revisao' ? `Qualidade: ${getName(m)}` : `Suporte: ${getName(m)}`}
                </p>
              </div>
              <div className="text-right ml-3 flex-shrink-0">
                <ActionDeadlineClock actionDeadlineAt={m.action_deadline_at} status={m.status} />
              </div>
            </div>
          );
        }) : (
          <div className="h-full flex flex-col items-center justify-center text-center text-brand-muted py-10 flex-1">
            <div className="w-12 h-12 rounded-2xl bg-surface-subtle flex items-center justify-center mx-auto mb-3">
              <Clock className="w-6 h-6 text-surface-border" />
            </div>
            <p className="text-[10px] font-black uppercase tracking-widest">Nenhuma pendência</p>
          </div>
        )}
      </div>
    </Card>
  );
}
