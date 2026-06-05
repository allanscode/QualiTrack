import React, { useState } from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import Card from '../../ui/Card';
import { BarChart3 } from 'lucide-react';
import { useQualityConfig } from '../../../lib/useQualityConfig';
import { useDashboard } from '../DashboardContext';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';

interface DataKey {
  key: string;
  name: string;
  color: string;
}

interface ComparativeBarChartProps {
  title?: string;
  subtitle?: string;
  data: any[];
  dataKeys: DataKey[];
  isCustomizing?: boolean;
  profile?: string;
  activeEditingId?: string | null;
  setActiveEditingId?: (id: string | null) => void;
}

export default function ComparativeBarChart({ 
  title = '', 
  subtitle, 
  data, 
  dataKeys,
  isCustomizing = false,
  profile,
  activeEditingId,
  setActiveEditingId
}: ComparativeBarChartProps) {
  const { config, saveConfig } = useQualityConfig();
  const [isHovered, setIsHovered] = useState(false);
  const [tempSub, setTempSub] = useState('');

  let dashboardContext = null;
  try {
    dashboardContext = useDashboard();
  } catch (e) {}
  const user = dashboardContext?.user;
  const canEdit = isCustomizing;

  const myUniqueId = `chart-${title || 'comparativo'}`;
  const isEditing = activeEditingId !== undefined
    ? activeEditingId === myUniqueId
    : dashboardContext?.activeEditingId === myUniqueId;

  const lookupKey = profile ? `${profile}_${title || 'comparativo'}` : (user?.role ? `${user.role}_${title || 'comparativo'}` : (title || 'comparativo'));
  const customSub = (config?.statCardExplanations?.[lookupKey] !== undefined && config.statCardExplanations[lookupKey] !== '')
    ? config.statCardExplanations[lookupKey]
    : (config?.statCardExplanations?.[title || 'comparativo'] !== undefined && config.statCardExplanations[title || 'comparativo'] !== '')
      ? config.statCardExplanations[title || 'comparativo']
      : (subtitle || 'Comparativo de desempenho');

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
    <Card padding="lg" className="h-full flex flex-col">
      {isEditing ? (
        <div className="flex flex-col gap-2 mb-4 animate-fade-in" onClick={(e) => e.stopPropagation()}>
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
        (title || subtitle) && (
          <div className="flex items-center gap-3 mb-4 min-w-0">
            <div 
              onClick={canEdit ? handleEditClick : undefined}
              onMouseEnter={() => setIsHovered(true)}
              onMouseLeave={() => setIsHovered(false)}
              className={`relative w-9 h-9 rounded-xl bg-surface-subtle flex items-center justify-center flex-shrink-0 text-brand-muted ${
                canEdit ? 'cursor-pointer hover:ring-2 hover:ring-brand-accent/50 transition-all' : 'cursor-help'
              }`}
              title=""
            >
              <BarChart3 className="w-5 h-5 fill-current fill-opacity-15" strokeWidth={2} fill="currentColor" fillOpacity={0.15} />
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
              {title && <h3 className="text-sm font-black text-brand-primary uppercase tracking-widest truncate" title="">{title}</h3>}
            </div>
          </div>
        )
      )}
      <div className="flex-1 min-h-[150px]" style={{ minWidth: 0, minHeight: 150 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--surface-border)" />
            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: 'var(--brand-muted)', fontWeight: 700 }} dy={8} />
            <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: 'var(--brand-muted)', fontWeight: 700 }} />
            <Tooltip
              cursor={false}
        contentStyle={{ backgroundColor: 'var(--brand-primary)', border: 'none', borderRadius: '12px', color: 'var(--brand-on-primary)', fontSize: '11px', fontWeight: 700, padding: '10px 14px' }}
        itemStyle={{ fontSize: '11px', padding: '2px 0', color: 'var(--brand-on-primary)' }}
            />
            <Legend
              iconType="circle"
              iconSize={8}
              wrapperStyle={{ fontSize: '10px', fontWeight: 700, color: 'var(--brand-muted)', paddingTop: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}
            />
            {dataKeys.map(dk => (
              <Bar key={dk.key} dataKey={dk.key} name={dk.name} fill={dk.color} radius={[4, 4, 0, 0]} maxBarSize={40} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
