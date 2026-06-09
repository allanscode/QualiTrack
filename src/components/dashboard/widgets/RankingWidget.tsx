import React, { useState } from 'react';
import { User, Award } from 'lucide-react';
import Card from '../../ui/Card';
import { useQualityConfig } from '../../../lib/useQualityConfig';
import { useDashboard } from '../DashboardContext';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';

interface RankingItem {
  id: string;
  name: string;
  score?: number;
  count: number;
}

interface RankingWidgetProps {
  title: string;
  subtitle?: string;
  data: RankingItem[];
  type?: 'score' | 'count';
  icon?: React.ReactNode;
  accent?: string;
  isCustomizing?: boolean;
  profile?: string;
  activeEditingId?: string | null;
  setActiveEditingId?: (id: string | null) => void;
}

const RANKING_BG_MAP: Record<string, string> = {
  'text-functional-error': 'bg-functional-error',
  'text-functional-warning': 'bg-functional-warning',
  'text-functional-success': 'bg-functional-success',
  'text-brand-accent': 'bg-icon-accent',
  'text-brand-highlight': 'bg-icon-highlight',
  'text-brand-muted': 'bg-surface-subtle',
  'text-brand-primary': 'bg-icon-primary',
  'text-info': 'bg-surface-subtle',
  'text-warning': 'bg-functional-warning',
  'text-success': 'bg-functional-success',
};

function getIconBg(accent: string): string {
  if (RANKING_BG_MAP[accent]) return RANKING_BG_MAP[accent];
  if (accent.startsWith('text-level-')) {
    return accent.replace('text-level-', 'bg-level-');
  }
  return 'bg-surface-subtle';
}

export default function RankingWidget({ 
  title, 
  subtitle, 
  data, 
  type = 'score', 
  icon, 
  accent,
  isCustomizing = false,
  profile,
  activeEditingId,
  setActiveEditingId
}: RankingWidgetProps) {
  const { getLevelForScore, config, saveConfig } = useQualityConfig();
  const [isHovered, setIsHovered] = useState(false);
  const [tempSub, setTempSub] = useState('');

  const isMelhoresSuporte = title === 'Melhores Suporte';
  const isTopReavRecusadas = title === 'Top Reav. Recusadas' || title === 'Top Reav. Aceitas';

  const tooltipPositionClass = isMelhoresSuporte
    ? 'left-0 translate-x-0'
    : isTopReavRecusadas
      ? 'right-0 translate-x-0'
      : 'left-1/2 -translate-x-1/2';

  const arrowPositionClass = isMelhoresSuporte
    ? 'left-6 -translate-x-1/2'
    : isTopReavRecusadas
      ? 'right-6 translate-x-1/2'
      : 'left-1/2 -translate-x-1/2';

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
      : (subtitle || 'Classificação de desempenho');

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

  return (
    <Card padding="md" className="h-full flex flex-col overflow-visible">
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
        <div className="flex items-center gap-3 mb-3 min-w-0">
          <div 
            onClick={canEdit ? handleEditClick : undefined}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            className={`relative w-8 h-8 rounded-xl ${accent ? getIconBg(accent) : 'bg-surface-subtle'} flex items-center justify-center flex-shrink-0 ${accent || ''} ${
              canEdit ? 'cursor-pointer hover:ring-2 hover:ring-brand-accent/50 transition-all' : (isMelhoresSuporte ? 'cursor-pointer' : 'cursor-help')
            }`}
            title=""
          >
            {(() => {
              const defaultIcon = icon || <Award className="w-4 h-4" />;
              return React.isValidElement(defaultIcon)
                ? React.cloneElement(defaultIcon as React.ReactElement<any>, {
                    className: 'w-4 h-4 fill-current fill-opacity-15',
                    strokeWidth: 2,
                    fill: 'currentColor',
                    fillOpacity: 0.15,
                  })
                : defaultIcon;
            })()}
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
          <div className="flex-1">
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 leading-tight whitespace-normal" title="">{title}</h3>
          </div>
        </div>
      )}

      <div className="flex-1 space-y-1.5 overflow-visible pr-1 no-scrollbar">
        {data.map((item, index) => {
          const level = item.score !== undefined ? getLevelForScore(item.score) : { color: 'text-brand-primary', label: '' };
          const isCount = type === 'count';

          return (
            <div
              key={item.id}
              className="group relative flex items-center gap-2 py-1 px-2 rounded-2xl border border-surface-border hover:border-brand-primary/20 hover:bg-surface-subtle/50 hover:z-[10000] transition-all duration-200"
            >
              {/* Tooltip flutuante CSS-driven premium */}
              <div 
                className={`absolute bottom-full ${tooltipPositionClass} mb-2.5 z-50 w-64 bg-slate-900 border border-slate-800 text-slate-100 p-2.5 rounded-lg shadow-xl pointer-events-none opacity-0 invisible scale-95 group-hover:opacity-100 group-hover:visible group-hover:scale-100 transition-all duration-150 origin-bottom dark:bg-slate-50 dark:border-slate-200 dark:text-slate-900`}
              >
                <p className="text-xs font-bold text-slate-200 dark:text-slate-900 leading-tight mb-1 truncate">
                  #{index + 1}º - {item.name}
                </p>
                <p className="text-[11px] font-medium text-slate-400 dark:text-slate-600 leading-tight whitespace-nowrap">
                  {(() => {
                    const isReav = title.toLowerCase().includes('reav');
                    const isCrit = title.toLowerCase().includes('crit') || title.toLowerCase().includes('ofensor');
                    if (type === 'score') {
                      return `Score Médio: ${(item.score ?? 0).toFixed(1)}% | Total: ${item.count} mon.`;
                    } else if (isReav) {
                      return `Reavaliações: ${item.count} Vol.`;
                    } else if (isCrit) {
                      return `Falhas: ${item.count} Vol.`;
                    } else {
                      return `Volume Total: ${item.count} Monitorias`;
                    }
                  })()}
                </p>
                {/* Seta do Balão */}
                <div 
                  className={`absolute top-full ${arrowPositionClass} -mt-1 w-2 h-2 border-r border-b rotate-45 pointer-events-none bg-slate-900 border-slate-800 dark:bg-slate-50 dark:border-slate-200`} 
                />
              </div>

              {/* Rank Badge */}
              <div className="relative flex-shrink-0">
                <div className="w-7 h-7 rounded-xl bg-brand-accent text-white flex items-center justify-center font-black text-[10px] shadow-premium group-hover:scale-105 transition-transform">
                  {index + 1}
                </div>
                {index === 0 && (
                  <div className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-yellow-400 rounded-full border border-surface-card flex items-center justify-center">
                    <Award className="w-2 h-2 text-white" />
                  </div>
                )}
              </div>

              {/* Name + Count */}
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-semibold text-brand-primary uppercase tracking-tight leading-tight">{item.name}</p>
                {!isCount && (
                  <p className="text-[9px] font-medium text-slate-400 dark:text-slate-500 mt-0.5">
                    {item.count} mon.
                  </p>
                )}
              </div>

              {/* Score / Volume */}
              <div className="text-right flex-shrink-0">
                <div className={`text-xs font-bold ${isCount ? 'text-brand-primary' : level.color}`}>
                  {isCount ? `${item.count} Vol.` : `${(item.score ?? 0).toFixed(1)}%`}
                </div>
              </div>
            </div>
          );
        })}
        {data.length === 0 && (
          <div className="h-full flex items-center justify-center py-8 opacity-40">
            <p className="text-[10px] font-black uppercase tracking-widest text-brand-muted">Nenhum dado para exibir</p>
          </div>
        )}
      </div>
    </Card>
  );
}
