import React, { useState } from 'react';
import { User, Award } from 'lucide-react';
import Card from '../../ui/Card';
import { useQualityConfig } from '../../../lib/useQualityConfig';
import { useDashboard } from '../DashboardContext';
import { toast } from 'sonner';

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

export default function RankingWidget({ title, subtitle, data, type = 'score', icon, accent }: RankingWidgetProps) {
  const { getLevelForScore, config, saveConfig } = useQualityConfig();
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
        <div className="flex items-center justify-between mb-5">
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-black text-brand-primary uppercase tracking-widest leading-tight truncate">{customTitle}</h3>
            {subtitle && <p className="text-[10px] font-bold text-brand-muted uppercase tracking-wider mt-0.5 truncate">{subtitle}</p>}
          </div>
          <div 
            onClick={isAdmin ? handleEditClick : undefined}
            className={`w-9 h-9 rounded-xl ${accent ? getIconBg(accent) : 'bg-surface-subtle'} flex items-center justify-center flex-shrink-0 ${accent || ''} ${
              isAdmin ? 'cursor-pointer hover:ring-2 hover:ring-brand-accent/50 transition-all' : ''
            }`}
            title={isAdmin ? "Clique para editar título" : undefined}
          >
            {icon || <Award className="w-5 h-5 text-brand-primary" />}
          </div>
        </div>
      )}

      <div className="flex-1 space-y-2 overflow-y-auto pr-1 no-scrollbar">
        {data.map((item, index) => {
          const level = item.score !== undefined ? getLevelForScore(item.score) : { color: 'text-brand-primary', label: '' };
          const isCount = type === 'count';

          return (
            <div
              key={item.id}
              className="group flex items-center gap-3 p-3 rounded-2xl border border-surface-border hover:border-brand-primary/20 hover:bg-surface-subtle/50 transition-all duration-200"
            >
              {/* Rank Badge */}
              <div className="relative flex-shrink-0">
        <div className="w-9 h-9 rounded-xl bg-brand-accent text-white flex items-center justify-center font-black text-xs shadow-premium group-hover:scale-105 transition-transform">
            {index + 1}
          </div>
          {index === 0 && (
            <div className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-yellow-400 rounded-full border-2 border-surface-card flex items-center justify-center">
                    <Award className="w-2 h-2 text-white" />
                  </div>
                )}
              </div>

              {/* Name + Count */}
              <div className="flex-1 min-w-0">
                <p className="font-black text-brand-primary truncate text-xs uppercase tracking-tight">{item.name}</p>
                {!isCount && (
                  <p className="text-[10px] font-bold text-brand-muted uppercase tracking-widest mt-0.5">
                    {item.count} monitoria{item.count !== 1 ? 's' : ''}
                  </p>
                )}
              </div>

              {/* Score / Volume */}
              <div className="text-right flex-shrink-0">
                <div className={`text-sm font-black ${isCount ? 'text-brand-primary' : level.color}`}>
                  {isCount ? `${item.count} Vol.` : `${(item.score ?? 0).toFixed(1)}%`}
                </div>
                {!isCount && (
                  <div className={`text-[9px] font-black uppercase tracking-widest ${level.color} opacity-70`}>
                    {level.label}
                  </div>
                )}
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
