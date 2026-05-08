import React from 'react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';

interface DistributionChartProps {
  title: string;
  data: { name: string; value: number; color: string }[];
}

export default function DistributionChart({ title, data }: DistributionChartProps) {
  const total = data.reduce((sum, item) => sum + item.value, 0);

  return (
    <div className="bg-white rounded-3xl border border-[#E2E4D8] p-6 shadow-sm flex flex-col h-full">
      <h3 className="font-bold text-[#2D3A3A] text-lg mb-6">{title}</h3>
      {total > 0 ? (
        <div className="flex-1 flex flex-col justify-center">
          <div className="min-h-[200px] flex-1">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Tooltip
                  contentStyle={{ backgroundColor: '#2D3A3A', border: 'none', borderRadius: '12px', color: '#fff', fontSize: '12px', fontWeight: 'bold' }}
                  itemStyle={{ color: '#fff' }}
                />
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
          <div className="flex flex-wrap justify-center gap-3 mt-4">
            {data.map((entry, index) => (
              <div key={index} className="flex items-center gap-1.5 text-xs text-[#7A7D71] font-semibold">
                <span className="w-3 h-3 rounded-full" style={{ backgroundColor: entry.color }} />
                {entry.name} ({entry.value})
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-sm text-[#7A7D71]">
          Dados insuficientes
        </div>
      )}
    </div>
  );
}
