import React from 'react';
import { Award, AlertTriangle } from 'lucide-react';

interface RankingItem {
  id: string;
  name: string;
  score: number;
  count: number;
}

interface RankingWidgetProps {
  title: string;
  items: RankingItem[];
  type: 'top' | 'bottom';
}

export default function RankingWidget({ title, items, type }: RankingWidgetProps) {
  const Icon = type === 'top' ? Award : AlertTriangle;
  const iconColor = type === 'top' ? 'text-[#A7C0A5]' : 'text-red-400';
  const barColor = type === 'top' ? 'bg-emerald-400' : 'bg-red-400';

  return (
    <div className="bg-white rounded-3xl border border-[#E2E4D8] p-6 shadow-sm">
      <div className="flex items-center gap-2 mb-5">
        <Icon className={`w-5 h-5 ${iconColor}`} />
        <h3 className="font-bold text-[#2D3A3A] text-lg">{title}</h3>
      </div>
      <div className="space-y-3">
        {items.length > 0 ? items.map((item, idx) => {
          const isTop = idx === 0 && type === 'top';
          return (
            <div key={item.id} className={`flex items-center gap-3 p-3 rounded-2xl transition-colors hover:bg-[#F9F9F6] ${isTop ? 'bg-[#F9F9F6]' : ''}`}>
              <span className={`text-xs font-black w-5 text-center ${isTop ? 'text-[#A7C0A5]' : 'text-[#C5C7BB]'}`}>#{idx + 1}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-[#2D3A3A] truncate">{item.name}</p>
                <p className="text-[10px] text-[#7A7D71]">{item.count} monitoria{item.count > 1 ? 's' : ''}</p>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-20 h-1.5 bg-[#F0F1E8] rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${barColor}`} style={{ width: `${Math.max(0, Math.min(100, item.score))}%` }} />
                </div>
                <span className={`text-xs font-bold w-10 text-right ${item.score >= 75 ? 'text-emerald-600' : 'text-red-600'}`}>{item.score}%</span>
              </div>
            </div>
          );
        }) : (
          <div className="text-center text-sm text-[#7A7D71] py-10">
            Nenhum dado suficiente
          </div>
        )}
      </div>
    </div>
  );
}
