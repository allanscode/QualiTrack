import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import Card from '../../ui/Card';
import { PieChart as PieChartIcon } from 'lucide-react';

interface DistributionChartProps {
  title: string;
  data: { name: string; value: number; color: string }[];
}

export default function DistributionChart({ title, data }: DistributionChartProps) {
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
      <div className="flex items-center gap-3 mb-4">
        <div className="w-9 h-9 rounded-xl bg-surface-subtle flex items-center justify-center flex-shrink-0 text-brand-accent">
          <PieChartIcon className="w-5 h-5" />
        </div>
        <h3 className="text-sm font-black text-brand-primary uppercase tracking-widest">{title}</h3>
      </div>
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
