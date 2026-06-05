import React, { useState } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import Card from '../../ui/Card';
import { PieChart as PieChartIcon } from 'lucide-react';
import { useQualityConfig } from '../../../lib/useQualityConfig';
import { useDashboard } from '../DashboardContext';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';

interface DistributionChartProps {
  title: string;
  data: { name: string; value: number; color: string }[];
}

export default function DistributionChart({ title, data }: DistributionChartProps) {
  const { config, saveConfig } = useQualityConfig();
  const [isHovered, setIsHovered] = useState(false);
  const [tempSub, setTempSub] = useState('');

  let dashboardContext = null;
  try {
    dashboardContext = useDashboard();
  } catch (e) {}
  const user = dashboardContext?.user;
  const isAdmin = dashboardContext?.loggedInUser?.role === 'admin' || user?.role === 'admin';

  const myUniqueId = `chart-${title}`;
  const isEditing = dashboardContext?.activeEditingId === myUniqueId;

  const customSub = (config?.statCardExplanations?.[title] !== undefined && config.statCardExplanations[title] !== '')
    ? config.statCardExplanations[title]
    : 'Curva de distribuição de qualidade';

  const handleEditClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setTempSub(typeof customSub === 'string' ? customSub.slice(0, 35) : '');
    dashboardContext?.setActiveEditingId(myUniqueId);
    setIsHovered(false);
  };

  const handleSave = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const updatedExplanations = {
        ...(config.statCardExplanations || {}),
        [title]: tempSub,
      };
      await saveConfig({
        ...config,
        statCardExplanations: updatedExplanations,
      });
      toast.success('Descrição atualizada com sucesso!');
      dashboardContext?.setActiveEditingId(null);
    } catch (err) {
      toast.error('Erro ao salvar descrição.');
    }
  };

  const total = data.reduce((a, b) => a + b.value, 0);

  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    const percent = total > 0 ? ((d.value / total) * 100).toFixed(1) : 0;
    return (
      <div className="bg-brand-primary text-brand-on-primary px-3 py-2 rounded-xl shadow-xl text-xs font-bold">
        <p className="mb-0.5">{d.name}</p>
        <p className="opacity-80">{d.value} ocorrências ({percent}%)</p>
      </div>
    );
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
              onClick={() => dashboardContext?.setActiveEditingId(null)}
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
            onClick={isAdmin ? handleEditClick : undefined}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            className={`relative w-9 h-9 rounded-xl bg-icon-accent flex items-center justify-center flex-shrink-0 text-brand-accent ${
              isAdmin ? 'cursor-pointer hover:ring-2 hover:ring-brand-accent/50 transition-all' : 'cursor-help'
            }`}
            title=""
          >
            <PieChartIcon className="w-5 h-5 fill-current fill-opacity-15" strokeWidth={2} fill="currentColor" fillOpacity={0.15} />
            <AnimatePresence>
              {isHovered && customSub && (
                <motion.div
                  initial={{ opacity: 0, y: -8, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -8, scale: 0.95 }}
                  transition={{ duration: 0.12, ease: 'easeOut' }}
                  className="absolute top-full left-0 mt-2 z-50 whitespace-nowrap bg-slate-900 text-white dark:bg-slate-50 dark:text-slate-900 text-[10px] font-semibold px-2.5 py-1.5 rounded-lg shadow-xl shadow-slate-900/10 border border-slate-800/10 dark:border-slate-200/10 pointer-events-none"
                >
                  {customSub}{isAdmin ? " (Clique para editar)" : ""}
                  {/* Subtle upward pointing arrow */}
                  <div className="absolute -top-1 left-4 w-2 h-2 bg-slate-900 dark:bg-slate-50 rotate-45" />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <h3 className="text-sm font-black text-brand-primary uppercase tracking-widest truncate flex-1 min-w-0" title="">{title}</h3>
        </div>
      )}
      {data.length > 0 ? (
        <div className="flex-1 flex flex-col">
          <div className="flex-1" style={{ minWidth: 0, minHeight: 150 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Tooltip content={<CustomTooltip />} />
                <Pie
                  data={data}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={75}
                  paddingAngle={4}
                  dataKey="value"
                >
                  {data.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-wrap justify-center gap-x-4 gap-y-2 mt-3 pt-3 border-t border-surface-border/40">
            {data.map((entry, index) => (
              <div key={index} className="flex items-center gap-1.5 text-[10px] text-brand-muted font-black uppercase tracking-tight">
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: entry.color }} />
                {entry.name} ({entry.value})
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-[10px] font-black uppercase tracking-widest text-brand-muted opacity-40">
          Nenhum dado
        </div>
      )}
    </Card>
  );
}
