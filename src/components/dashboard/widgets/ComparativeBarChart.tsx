import React from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';

interface ComparativeChartData {
  date: string;
  mine: number;
  team: number;
}

interface ComparativeBarChartProps {
  title: string;
  subtitle?: string;
  data: ComparativeChartData[];
}

export default function ComparativeBarChart({ title, subtitle, data }: ComparativeBarChartProps) {
  return (
    <div className="bg-white rounded-3xl border border-[#E2E4D8] p-6 shadow-sm h-full flex flex-col">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-4">
        <div>
          <h3 className="font-bold text-[#2D3A3A] text-lg">{title}</h3>
          {subtitle && <p className="text-xs text-[#7A7D71] mt-0.5">{subtitle}</p>}
        </div>
      </div>
      <div className="flex-1 min-h-[150px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 20, right: 0, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F0F1E8" />
            <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#7A7D71', fontWeight: 600 }} dy={8} />
            <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#7A7D71', fontWeight: 600 }} />
            <Tooltip
              cursor={{ fill: '#F9F9F6' }}
              contentStyle={{ backgroundColor: '#2D3A3A', border: 'none', borderRadius: '12px', color: '#fff', fontSize: '12px', fontWeight: 'bold', padding: '12px 16px' }}
              itemStyle={{ fontSize: '12px', padding: '2px 0' }}
            />
            <Legend 
              iconType="circle"
              wrapperStyle={{ fontSize: '12px', fontWeight: 600, color: '#7A7D71', paddingTop: '20px' }}
            />
            <Bar dataKey="mine" name="Minha Volumetria" fill="#6366f1" radius={[4, 4, 0, 0]} maxBarSize={40} />
            <Bar dataKey="team" name="Média da Equipe" fill="#C5C7BB" radius={[4, 4, 0, 0]} maxBarSize={40} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
