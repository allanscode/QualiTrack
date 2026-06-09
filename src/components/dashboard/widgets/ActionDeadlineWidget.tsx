import React, { useState } from 'react';
import { Clock } from 'lucide-react';
import { Monitoria } from '../../../types';
import Card from '../../ui/Card';
import Badge from '../../ui/Badge';
import ActionDeadlineClock from '../../ui/ActionDeadlineClock';
import { useQualityConfig } from '../../../lib/useQualityConfig';
import { useDashboard } from '../DashboardContext';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';

interface ActionDeadlineWidgetProps {
  title: string;
  monitorias: Monitoria[];
  targetStatus?: string | string[];
  isCustomizing?: boolean;
  profile?: string;
  activeEditingId?: string | null;
  setActiveEditingId?: (id: string | null) => void;
  preFilteredSorted?: boolean;
}

export default function ActionDeadlineWidget({ 
  title, 
  monitorias, 
  targetStatus,
  isCustomizing = false,
  profile,
  activeEditingId,
  setActiveEditingId,
  preFilteredSorted = false
}: ActionDeadlineWidgetProps) {
  const { config, saveConfig } = useQualityConfig();
  const [isHovered, setIsHovered] = useState(false);
  const [tempSub, setTempSub] = useState('');

  let dashboardContext = null;
  try {
    dashboardContext = useDashboard();
  } catch (e) {}
  const user = dashboardContext?.user;
  const canEdit = isCustomizing;

  const myUniqueId = `chart-${title}`;
  const isEditing = activeEditingId !== undefined
    ? activeEditingId === myUniqueId
    : dashboardContext?.activeEditingId === myUniqueId;

  const lookupKey = profile ? `${profile}_${title}` : (user?.role ? `${user.role}_${title}` : title);
  const customSub = (config?.statCardExplanations?.[lookupKey] !== undefined && config.statCardExplanations[lookupKey] !== '')
    ? config.statCardExplanations[lookupKey]
    : (config?.statCardExplanations?.[title] !== undefined && config.statCardExplanations[title] !== '')
      ? config.statCardExplanations[title]
      : 'Controle de prazos de ação ativos';

  const handleEditClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setTempSub(typeof customSub === 'string' ? customSub.slice(0, 35) : '');
    if (setActiveEditingId) {
      setActiveEditingId(myUniqueId);
    } else {
      dashboardContext?.setActiveEditingId(myUniqueId);
    }
    setIsHovered(false);
  };

  const handleSave = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const updatedExplanations = {
        ...(config.statCardExplanations || {}),
        [lookupKey]: tempSub,
      };
      await saveConfig({
        ...config,
        statCardExplanations: updatedExplanations,
      });
      toast.success('Descrição atualizada com sucesso!');
      if (setActiveEditingId) {
        setActiveEditingId(null);
      } else {
        dashboardContext?.setActiveEditingId(null);
      }
    } catch (err) {
      toast.error('Erro ao salvar descrição.');
    }
  };

  const handleCancel = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (setActiveEditingId) {
      setActiveEditingId(null);
    } else {
      dashboardContext?.setActiveEditingId(null);
    }
  };

  const statuses = Array.isArray(targetStatus) ? targetStatus : (targetStatus ? [targetStatus] : []);

  const pending = preFilteredSorted
    ? monitorias.slice(0, 5)
    : monitorias
        .filter(m => statuses.includes(m.status) && !['concluida', 'contestacao_aceita', 'contestacao_negada', 'finalizada_alterada'].includes(m.status))
        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
        .slice(0, 5);

  const getName = (m: Monitoria) => {
    if (m.status === 'pendente_revisao') {
      const isProtectedRole = ['suporte', 'gestor_suporte'].includes(user?.role || '');
      if (isProtectedRole) {
        return 'Análise da Qualidade';
      }
      return m.evaluator_name || m.evaluator_id;
    }
    return m.evaluated_name || m.evaluated_id;
  };

  return (
    <Card padding="lg" className="h-full flex flex-col">
      {isEditing ? (
        <div className="flex flex-col gap-2 mb-5 animate-fade-in" onClick={(e) => e.stopPropagation()}>
          <span className="text-[10px] font-black uppercase tracking-widest text-brand-muted">
            Editar Descrição: {title}
          </span>
          <textarea
            value={tempSub}
            onChange={(e) => setTempSub(e.target.value.slice(0, 35))}
            maxLength={35}
            className="w-full text-xs p-1.5 rounded-lg border border-surface-border bg-surface-bg text-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-accent resize-none h-12"
            placeholder="Digite a descrição (máx. 35 caracteres)..."
            autoFocus
          />
          <div className="text-[10px] text-brand-muted text-right -mt-1">
            {tempSub.length}/35
          </div>
          <div className="flex justify-end gap-1.5">
            <button
              type="button"
              onClick={handleCancel}
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
        <div className="flex items-center gap-3 mb-5 min-w-0">
          <div 
            onClick={canEdit ? handleEditClick : undefined}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            className={`relative w-9 h-9 rounded-xl bg-functional-warning flex items-center justify-center flex-shrink-0 text-functional-warning ${
              canEdit ? 'cursor-pointer hover:ring-2 hover:ring-brand-accent/50 transition-all' : 'cursor-help'
            }`}
            title=""
          >
            <Clock className="w-5 h-5 fill-current fill-opacity-15" strokeWidth={2} fill="currentColor" fillOpacity={0.15} />
            <AnimatePresence>
              {isHovered && customSub && (
                <motion.div
                  initial={{ opacity: 0, y: -8, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -8, scale: 0.95 }}
                  transition={{ duration: 0.12, ease: 'easeOut' }}
                  className="absolute top-full left-0 mt-2 z-50 whitespace-nowrap bg-slate-900 text-white dark:bg-slate-50 dark:text-slate-900 text-[10px] font-semibold px-2.5 py-1.5 rounded-lg shadow-xl shadow-slate-900/10 border border-slate-800/10 dark:border-slate-200/10 pointer-events-none"
                >
                  {customSub}{canEdit ? " (Clique para editar)" : ""}
                  {/* Subtle upward pointing arrow */}
                  <div className="absolute -top-1 left-4 w-2 h-2 bg-slate-900 dark:bg-slate-50 rotate-45" />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-black text-brand-primary uppercase tracking-widest whitespace-normal leading-snug" title="">{title}</h3>
            <p className="text-[10px] font-bold text-brand-muted uppercase tracking-wider mt-0.5 whitespace-normal leading-snug" title="">
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
