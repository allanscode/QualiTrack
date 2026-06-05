import React, { useState } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import Card from '../../ui/Card';
import { PieChart as PieChartIcon } from 'lucide-react';
import { useQualityConfig } from '../../../lib/useQualityConfig';
import { useDashboard } from '../DashboardContext';
import { toast } from 'sonner';

interface DistributionChartProps {
  title: string;
  data: { name: string; value: number; color: string }[];
}

export default function DistributionChart({ title, data }: DistributionChartProps) {
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
        <div className="flex items-center gap-3 mb-4 min-w-0">
          <div 
            onClick={isAdmin ? handleEditClick : undefined}
            className={`w-9 h-9 rounded-xl bg-surface-subtle flex items-center justify-center flex-shrink-0 text-brand-accent ${
              isAdmin ? 'cursor-pointer hover:ring-2 hover:ring-brand-accent/50 transition-all' : ''
            }`}
            title={isAdmin ? "Clique para editar título" : undefined}
          >
            <PieChartIcon className="w-5 h-5" />
          </div>
          <h3 className="text-sm font-black text-brand-primary uppercase tracking-widest truncate flex-1 min-w-0">{customTitle}</h3>
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
