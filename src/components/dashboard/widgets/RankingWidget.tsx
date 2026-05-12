import React from 'react';
import { User, Award, TrendingDown, Target } from 'lucide-react';
import Card from '../../ui/Card';
import { useQualityConfig } from '../../../lib/useQualityConfig';

interface RankingItem {
  id: string;
  name: string;
  score: number;
  count: number;
}

interface RankingWidgetProps {
  title: string;
  subtitle?: string;
  data: RankingItem[];
  type?: 'score' | 'count';
}

export default function RankingWidget({ title, subtitle, data, type = 'score' }: RankingWidgetProps) {
  const { getLevelForScore } = useQualityConfig();

  return (
    <Card padding="lg" className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="font-black text-brand-primary uppercase tracking-tight leading-tight">{title}</h3>
          {subtitle && <p className="text-[10px] font-bold text-brand-muted uppercase tracking-wider mt-0.5">{subtitle}</p>}
        </div>
        <div className="w-10 h-10 rounded-2xl bg-surface-subtle flex items-center justify-center">
          <Award className="w-5 h-5 text-brand-primary" />
        </div>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto pr-1">
        {data.map((item, index) => {
          const level = getLevelForScore(item.score);
          const isCount = type === 'count';

          return (
            <div 
              key={item.id} 
              className="group flex items-center gap-4 p-3 rounded-2xl border border-surface-border hover:border-brand-primary/20 hover:bg-surface-subtle transition-all duration-300"
            >
              <div className="relative flex-shrink-0">
                <div className="w-10 h-10 rounded-xl bg-brand-primary text-white flex items-center justify-center font-black text-sm shadow-premium group-hover:scale-110 transition-transform">
                  {index + 1}
                </div>
                {index === 0 && (
                  <div className="absolute -top-1 -right-1 w-4 h-4 bg-yellow-400 rounded-full border-2 border-white flex items-center justify-center">
                    <Award className="w-2.5 h-2.5 text-white" />
                  </div>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <p className="font-bold text-brand-primary truncate text-sm">{item.name}</p>
                {!isCount && (
                  <p className="text-[10px] font-bold text-brand-muted uppercase tracking-widest">{item.count} monitoria{item.count !== 1 ? 's' : ''}</p>
                )}
              </div>

              <div className="text-right flex-shrink-0">
                <div className={`text-sm font-black ${isCount ? 'text-brand-primary' : level.color}`}>
                  {isCount ? `${item.count} Vol.` : `${item.score.toFixed(2)}%`}
                </div>
                {!isCount && (
                  <div className={`text-[8px] font-black uppercase tracking-widest ${level.color} opacity-70`}>
                    {level.label}
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {data.length === 0 && (
          <div className="h-full flex items-center justify-center py-8 opacity-40">
            <p className="text-xs font-bold uppercase tracking-widest text-brand-muted">Nenhum dado para exibir</p>
          </div>
        )}
      </div>
    </Card>
  );
}
