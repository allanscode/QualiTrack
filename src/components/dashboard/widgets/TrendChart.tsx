import React, { useState } from 'react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import Card from '../../ui/Card';
import { TrendingUp } from 'lucide-react';
import { useQualityConfig } from '../../../lib/useQualityConfig';
import { useDashboard } from '../DashboardContext';
import { toast } from 'sonner';
import { LazyMotion, domAnimation, m, AnimatePresence, useReducedMotion } from 'motion/react';

interface TrendChartProps {
  title: string;
  subtitle?: string;
  data: any[];
  dataKeys: { key: string; color: string; name: string }[];
  isCustomizing?: boolean;
  profile?: string;
  activeEditingId?: string | null;
  setActiveEditingId?: (id: string | null) => void;
}

export default function TrendChart({ 
  title, 
  subtitle, 
  data, 
  dataKeys,
  isCustomizing = false,
  profile,
  activeEditingId,
  setActiveEditingId
}: TrendChartProps) {
  const { config, saveConfig } = useQualityConfig();
  const [isHovered, setIsHovered] = useState(false);
  const [tempSub, setTempSub] = useState('');

  const shouldReduceMotion = useReducedMotion();

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
      : (subtitle || 'Visualização gráfica dos dados');

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
    <LazyMotion features={domAnimation}>
      <Card padding="lg" className="h-full flex flex-col print:shadow-none print:border print:border-slate-300 print:bg-white print:text-black print:p-4">
        {isEditing ? (
          <div className="flex flex-col gap-2 mb-6 animate-fade-in print:hidden" onClick={(e) => e.stopPropagation()}>
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
          <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-4 print:mb-4">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div 
                onClick={canEdit ? handleEditClick : undefined}
                onMouseEnter={() => setIsHovered(true)}
                onMouseLeave={() => setIsHovered(false)}
                className={`relative w-9 h-9 rounded-xl bg-icon-highlight flex items-center justify-center flex-shrink-0 text-brand-highlight print:bg-slate-100 print:text-slate-800 ${
                  canEdit ? 'cursor-pointer hover:ring-2 hover:ring-brand-accent/50 transition-all' : 'cursor-help'
                }`}
                title=""
              >
                <TrendingUp className="w-5 h-5 fill-current fill-opacity-15" strokeWidth={2} fill="currentColor" fillOpacity={0.15} />
                <AnimatePresence>
                  {isHovered && customSub && (
                    <m.div
                      initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.95 }}
                      transition={{ duration: 0.12, ease: 'easeOut' }}
                      style={{ willChange: 'transform, opacity' }}
                      className="absolute top-full left-0 mt-2 z-50 whitespace-nowrap bg-slate-900 text-white dark:bg-slate-50 dark:text-slate-900 text-[10px] font-semibold px-2.5 py-1.5 rounded-lg shadow-xl shadow-slate-900/10 border border-slate-800/10 dark:border-slate-200/10 pointer-events-none print:hidden"
                    >
                      {customSub}{canEdit ? " (Clique para editar)" : ""}
                      {/* Subtle upward pointing arrow */}
                      <div className="absolute -top-1 left-4 w-2 h-2 bg-slate-900 dark:bg-slate-50 rotate-45" />
                    </m.div>
                  )}
                </AnimatePresence>
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-black text-brand-primary uppercase tracking-widest whitespace-normal leading-snug print:text-black" title="">{title}</h3>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-4 text-[10px] font-black uppercase tracking-widest text-brand-muted flex-shrink-0 print:text-slate-700">
              {dataKeys.map(dk => (
                <div key={dk.key} className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm inline-block print:border print:border-slate-400" style={{ backgroundColor: dk.color }} />
                  {dk.name}
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="flex-1 min-h-[150px] print:h-[220px]" style={{ minWidth: 0, minHeight: 150 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
              <defs>
                {dataKeys.map(dk => (
                  <linearGradient key={dk.key} id={`color-${dk.key}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={dk.color} stopOpacity={0.25} />
                    <stop offset="95%" stopColor={dk.color} stopOpacity={0} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--surface-border)" className="print:stroke-slate-200" />
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: 'var(--brand-muted)', fontWeight: 700 }} dy={8} className="print:fill-slate-700" />
              <YAxis domain={[0, 100]} axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: 'var(--brand-muted)', fontWeight: 700 }} className="print:fill-slate-700" />
              <Tooltip
                cursor={{ stroke: 'var(--brand-accent)', strokeWidth: 2, strokeDasharray: '4 4' }}
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  return (
                    <div className="bg-slate-900 text-slate-50 dark:bg-white dark:text-slate-900 px-3 py-2.5 rounded-xl shadow-premium text-[10px] border border-black/5 dark:border-white/10 font-sans font-bold animate-fade-in print:hidden">
                      <p className="mb-1 leading-snug uppercase tracking-widest opacity-60 text-[8px] font-black">{label}</p>
                      <div className="space-y-1">
                        {payload.map((p: any, i: number) => (
                          <div key={i} className="flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: p.stroke || p.color }} />
                            <span className="opacity-90 font-semibold">{p.name}:</span>
                            <span className="font-extrabold">{p.value}%</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                }}
              />
              {dataKeys.map(dk => (
                <Area
                  key={dk.key}
                  type="monotone"
                  dataKey={dk.key}
                  name={dk.name}
                  stroke={dk.color}
                  strokeWidth={2.5}
                  fillOpacity={1}
                  fill={`url(#color-${dk.key})`}
                  activeDot={{ r: 5, strokeWidth: 0, fill: dk.color }}
                  isAnimationActive={false} // Optimized to save CPU cycles
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </LazyMotion>
  );
}
