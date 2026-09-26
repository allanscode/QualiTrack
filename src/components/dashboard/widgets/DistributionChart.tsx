import React, { useState } from 'react';
import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import Card from '../../ui/Card';
import { PieChart as PieChartIcon } from 'lucide-react';
import { useQualityConfig } from '../../../lib/useQualityConfig';
import { useDashboard, useEditing } from '../DashboardContext';
import { toast } from 'sonner';
import { m, AnimatePresence, useReducedMotion } from 'motion/react';

const CustomTooltip = ({ active, payload, total }: any) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const percent = total > 0 ? ((d.value / total) * 100).toFixed(1) : 0;
  return (
    <div className="bg-slate-900 text-slate-50 dark:bg-white dark:text-slate-900 px-3 py-2 rounded-xl shadow-premium text-[10px] border border-black/5 dark:border-white/10 font-sans font-bold print:hidden">
      <p className="mb-0.5">{d.name}</p>
      <p className="opacity-80 font-semibold">{d.value} ocorrência{d.value !== 1 ? 's' : ''} ({percent}%)</p>
    </div>
  );
};

interface DistributionChartProps {
  title: string;
  data: { name: string; value: number; color: string }[];
  isCustomizing?: boolean;
  profile?: string;
  activeEditingId?: string | null;
  setActiveEditingId?: (id: string | null) => void;
}

const QUALITY_DISTRIBUTION_TITLE = 'Insatisfação — Visão da Qualidade';

const renderArcLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent, value }: any) => {
  if (value === 0 || percent < 0.05) return null;
  const RADIAN = Math.PI / 180;
  const radius = (innerRadius + outerRadius) / 2;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);

  return (
    <text
      x={x}
      y={y}
      fill="#ffffff"
      textAnchor="middle"
      dominantBaseline="central"
      className="text-[10px] font-black pointer-events-none drop-shadow select-none"
    >
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  );
};

export default function DistributionChart({ 
  title, 
  data,
  isCustomizing = false,
  profile,
  activeEditingId,
  setActiveEditingId
}: DistributionChartProps) {
  const { config, saveConfig } = useQualityConfig();
  const [isHovered, setIsHovered] = useState(false);
  const [tempSub, setTempSub] = useState('');

  const shouldReduceMotion = useReducedMotion();

  let dashboardContext = null;
  let editingContext = null;
  try {
    dashboardContext = useDashboard();
    editingContext = useEditing();
  } catch (e) {}
  const user = dashboardContext?.user;
  const canEdit = isCustomizing;

  const myUniqueId = `chart-${title}`;
  const isEditing = activeEditingId !== undefined
    ? activeEditingId === myUniqueId
    : editingContext?.activeEditingId === myUniqueId;

  const lookupKey = profile ? `${profile}_${title}` : (user?.role ? `${user.role}_${title}` : title);
  const customSub = (config?.statCardExplanations?.[lookupKey] !== undefined && config.statCardExplanations[lookupKey] !== '')
    ? config.statCardExplanations[lookupKey]
    : (config?.statCardExplanations?.[title] !== undefined && config.statCardExplanations[title] !== '')
      ? config.statCardExplanations[title]
      : 'Curva de distribuição de qualidade';

  const handleEditClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setTempSub(typeof customSub === 'string' ? customSub.slice(0, 35) : '');
    if (setActiveEditingId) {
      setActiveEditingId(myUniqueId);
    } else {
      editingContext?.setActiveEditingId(myUniqueId);
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
        editingContext?.setActiveEditingId(null);
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
      editingContext?.setActiveEditingId(null);
    }
  };

  const total = data.reduce((a, b) => a + b.value, 0);

  const renderChart = () => {
    return (
      <PieChart>
        <Tooltip content={<CustomTooltip total={total} />} />
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={50}
          outerRadius={70}
          paddingAngle={3}
          dataKey="value"
          label={renderArcLabel}
          labelLine={false}
          isAnimationActive={false} // Optimized to save CPU cycles
        >
          {data.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={entry.color} />
          ))}
        </Pie>
      </PieChart>
    );
  };


  return (
    <Card padding="lg" className="h-full flex flex-col print:shadow-none print:border print:border-slate-300 print:bg-white print:text-black print:p-4">
        {isEditing ? (
          <div className="flex flex-col gap-2 mb-4 animate-fade-in print:hidden" onClick={(e) => e.stopPropagation()}>
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
          <div className="flex items-center gap-3 mb-4 min-w-0">
        <div
          onClick={canEdit ? handleEditClick : undefined}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          className={`relative w-9 h-9 rounded-xl bg-icon-accent flex items-center justify-center flex-shrink-0 text-brand-accent print:bg-slate-100 print:text-slate-800 ${
            canEdit ? 'cursor-pointer hover:ring-2 hover:ring-brand-accent/50 transition-all' : 'cursor-help'
          }`}
          tabIndex={0}
          aria-describedby={isHovered && customSub ? `tooltip-${myUniqueId}` : undefined}
        >
          <PieChartIcon className="w-5 h-5 fill-current fill-opacity-15" strokeWidth={2} fill="currentColor" fillOpacity={0.15} />
          <AnimatePresence>
            {isHovered && customSub && (
              <m.div
                id={`tooltip-${myUniqueId}`}
                role="tooltip"
                initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.95 }}
                transition={{ duration: 0.12, ease: 'easeOut' }}
                style={{ willChange: 'transform, opacity' }}
                className="absolute top-full left-0 mt-2 z-50 whitespace-nowrap bg-slate-900 text-white dark:bg-slate-50 dark:text-slate-900 text-[10px] font-semibold px-2.5 py-1.5 rounded-lg shadow-xl shadow-slate-900/10 border border-slate-800/10 dark:border-slate-200/10 pointer-events-none print:hidden"
              >
                {customSub}{canEdit ? " (Clique para editar)" : ""}
                <div className="absolute -top-1 left-4 w-2 h-2 bg-slate-900 dark:bg-slate-50 rotate-45" />
              </m.div>
            )}
          </AnimatePresence>
        </div>
        <h3 className="text-[13px] font-black text-brand-primary uppercase tracking-wider whitespace-normal flex-1 leading-snug print:text-black">{title}</h3>
          </div>
        )}
        {data.length > 0 ? (
          <div className="flex-1 flex flex-col sm:flex-row items-center justify-between gap-4 min-h-[160px]">
            <div className="w-full sm:w-[55%] h-[160px] relative" style={{ minWidth: 0 }}>
              <ResponsiveContainer width="100%" height="100%">
                {renderChart()}
              </ResponsiveContainer>
            </div>
            <div className="w-full sm:w-[45%] flex flex-col justify-center gap-2 pl-0 sm:pl-3 sm:border-l border-surface-border/40 max-h-[160px] overflow-y-auto no-scrollbar">
              {data.map((entry, index) => {
                const percent = total > 0 ? ((entry.value / total) * 100).toFixed(1) : '0';
                return (
                  <div key={index} className="flex items-center justify-between gap-2 text-[10px] text-brand-muted font-black uppercase tracking-tight print:text-slate-800">
                    <div className="flex items-center gap-1.5 truncate">
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: entry.color }} />
                      <span className="truncate">{entry.name}</span>
                    </div>
                    <span className="text-brand-primary whitespace-nowrap font-bold">
                      {entry.value} ({percent}%)
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-[10px] font-black uppercase tracking-widest text-brand-muted opacity-40 print:text-slate-500">
            Nenhum dado
          </div>
        )}
      </Card>
  );
}
