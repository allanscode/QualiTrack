import React, { useState } from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import Card from '../../ui/Card';
import { BarChart3 } from 'lucide-react';
import { useQualityConfig } from '../../../lib/useQualityConfig';
import { useDashboard } from '../DashboardContext';
import { toast } from 'sonner';

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
}

export default function ComparativeBarChart({ title = '', subtitle, data, dataKeys }: ComparativeBarChartProps) {
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
      toast.success('Título updated successfully!');
      setIsEditing(false);
    } catch (err) {
      toast.error('Erro ao salvar título.');
    }
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
        (title || subtitle) && (
          <div className="flex items-center gap-3 mb-4 min-w-0">
            <div 
              onClick={isAdmin ? handleEditClick : undefined}
              className={`w-9 h-9 rounded-xl bg-surface-subtle flex items-center justify-center flex-shrink-0 text-brand-muted ${
                isAdmin ? 'cursor-pointer hover:ring-2 hover:ring-brand-accent/50 transition-all' : ''
              }`}
              title={isAdmin ? "Clique para editar título" : undefined}
            >
              <BarChart3 className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              {title && <h3 className="text-sm font-black text-brand-primary uppercase tracking-widest truncate">{customTitle}</h3>}
              {subtitle && <p className="text-[10px] font-bold text-brand-muted uppercase tracking-wider mt-0.5 truncate">{subtitle}</p>}
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
