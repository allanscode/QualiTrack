import React from 'react';
import { User, Award } from 'lucide-react';
import Card from '../../ui/Card';
import { useQualityConfig } from '../../../lib/useQualityConfig';

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
}

export default function RankingWidget({ title, subtitle, data, type = 'score' }: RankingWidgetProps) {
  const { getLevelForScore } = useQualityConfig();

  return (
    <Card padding="lg" className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h3 className="text-sm font-black text-brand-primary uppercase tracking-widest leading-tight">{title}</h3>
          {subtitle && <p className="text-[10px] font-bold text-brand-muted uppercase tracking-wider mt-0.5">{subtitle}</p>}
        </div>
        <div className="w-9 h-9 rounded-xl bg-surface-subtle flex items-center justify-center flex-shrink-0">
          <Award className="w-4 h-4 text-brand-primary" />
        </div>
      </div>

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
                <div className="w-9 h-9 rounded-xl bg-brand-primary text-white flex items-center justify-center font-black text-xs shadow-premium group-hover:scale-105 transition-transform">
                  {index + 1}
                </div>
                {index === 0 && (
                  <div className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-yellow-400 rounded-full border-2 border-white flex items-center justify-center">
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
