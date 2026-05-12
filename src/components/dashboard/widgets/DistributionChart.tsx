import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

interface DistributionChartProps {
  title: string;
  data: { name: string; value: number; color: string }[];
}

export default function DistributionChart({ title, data }: DistributionChartProps) {
  const total = data.reduce((a, b) => a + b.value, 0);

  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    const percent = total > 0 ? ((d.value / total) * 100).toFixed(2) : 0;
    return (
      <div className="bg-[#2D3A3A] text-white px-3 py-2 rounded-xl shadow-xl text-xs font-bold">
        <p className="mb-0.5">{d.name}</p>
        <p className="text-brand-accent">{d.value} ocorrências ({percent}%)</p>
      </div>
    );
  };

  return (
    <div className="bg-white rounded-3xl border border-[#E2E4D8] shadow-sm p-6 h-full flex flex-col">
      <h3 className="font-bold text-[#2D3A3A] text-sm mb-4 uppercase tracking-wider">{title}</h3>
      {data.length > 0 ? (
        <div className="flex-1 flex flex-col">
          <div className="flex-1">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Tooltip content={<CustomTooltip />} />
                <Pie
                  data={data}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {data.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-wrap justify-center gap-x-4 gap-y-2 mt-4">
            {data.map((entry, index) => (
              <div key={index} className="flex items-center gap-1.5 text-[10px] text-[#7A7D71] font-black uppercase tracking-tight">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
                {entry.name} ({entry.value})
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-xs font-bold uppercase tracking-widest text-[#7A7D71] opacity-40">
          Nenhum dado
        </div>
      )}
    </div>
  );
}
