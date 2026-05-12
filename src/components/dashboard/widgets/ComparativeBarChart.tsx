import React from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';

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

export default function ComparativeBarChart({ title, subtitle, data, dataKeys }: ComparativeBarChartProps) {
  return (
    <div className="w-full h-full flex flex-col">
      {(title || subtitle) && (
        <div className="mb-4">
          {title && <h3 className="font-bold text-[#2D3A3A] text-lg">{title}</h3>}
          {subtitle && <p className="text-xs text-[#7A7D71] mt-0.5">{subtitle}</p>}
        </div>
      )}
      <div className="flex-1 min-h-[150px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F0F1E8" />
            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#7A7D71', fontWeight: 600 }} dy={8} />
            <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#7A7D71', fontWeight: 600 }} />
            <Tooltip
              cursor={{ fill: '#F9F9F6' }}
              contentStyle={{ backgroundColor: '#2D3A3A', border: 'none', borderRadius: '12px', color: '#fff', fontSize: '12px', fontWeight: 'bold', padding: '12px 16px' }}
              itemStyle={{ fontSize: '12px', padding: '2px 0' }}
            />
            <Legend 
              iconType="circle"
              wrapperStyle={{ fontSize: '12px', fontWeight: 600, color: '#7A7D71', paddingTop: '8px' }}
            />
            {dataKeys.map(dk => (
              <Bar key={dk.key} dataKey={dk.key} name={dk.name} fill={dk.color} radius={[4, 4, 0, 0]} maxBarSize={40} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
