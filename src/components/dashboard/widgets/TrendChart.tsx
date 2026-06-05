import React, { useState } from 'react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import Card from '../../ui/Card';
import { TrendingUp } from 'lucide-react';
import { useQualityConfig } from '../../../lib/useQualityConfig';
import { useDashboard } from '../DashboardContext';
import { toast } from 'sonner';

interface TrendChartProps {
  title: string;
  subtitle?: string;
  data: any[];
  dataKeys: { key: string; color: string; name: string }[];
}

export default function TrendChart({ title, subtitle, data, dataKeys }: TrendChartProps) {
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

  return (
    <Card padding="lg" className="h-full flex flex-col">
      {isEditing ? (
        <div className="flex flex-col gap-2 mb-6 animate-fade-in" onClick={(e) => e.stopPropagation()}>
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
        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-4">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div 
              onClick={isAdmin ? handleEditClick : undefined}
              className={`w-9 h-9 rounded-xl bg-surface-subtle flex items-center justify-center flex-shrink-0 text-brand-highlight ${
                isAdmin ? 'cursor-pointer hover:ring-2 hover:ring-brand-accent/50 transition-all' : ''
              }`}
              title={isAdmin ? "Clique para editar título" : undefined}
            >
              <TrendingUp className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-black text-brand-primary uppercase tracking-widest truncate">{customTitle}</h3>
              {subtitle && <p className="text-[10px] font-bold text-brand-muted uppercase tracking-wider mt-0.5 truncate">{subtitle}</p>}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-[10px] font-black uppercase tracking-widest text-brand-muted flex-shrink-0">
            {dataKeys.map(dk => (
              <div key={dk.key} className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ backgroundColor: dk.color }} />
                {dk.name}
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="flex-1 min-h-[150px]" style={{ minWidth: 0, minHeight: 150 }}>
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
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--surface-border)" />
            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: 'var(--brand-muted)', fontWeight: 700 }} dy={8} />
            <YAxis domain={[0, 100]} axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: 'var(--brand-muted)', fontWeight: 700 }} />
            <Tooltip
              cursor={{ stroke: 'var(--brand-accent)', strokeWidth: 2, strokeDasharray: '4 4' }}
              contentStyle={{ backgroundColor: 'var(--brand-primary)', border: 'none', borderRadius: '12px', color: 'var(--brand-on-primary)', fontSize: '11px', fontWeight: 700, padding: '8px 14px' }}
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
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
