import React from 'react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';

interface TrendChartProps {
  title: string;
  subtitle?: string;
  data: any[];
  dataKeys: { key: string; color: string; name: string }[];
}

export default function TrendChart({ title, subtitle, data, dataKeys }: TrendChartProps) {
  return (
    <div className="bg-white rounded-3xl border border-[#E2E4D8] p-6 shadow-sm h-full flex flex-col">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-4">
        <div>
          <h3 className="font-bold text-[#2D3A3A] text-lg">{title}</h3>
          {subtitle && <p className="text-xs text-[#7A7D71] mt-0.5">{subtitle}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-4 text-[10px] font-bold uppercase tracking-wider">
          {dataKeys.map(dk => (
            <div key={dk.key} className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ backgroundColor: dk.color }} />
              {dk.name}
            </div>
          ))}
        </div>
      </div>
      <div className="flex-1 min-h-[150px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
            <defs>
              {dataKeys.map(dk => (
                <linearGradient key={dk.key} id={`color-${dk.key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={dk.color} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={dk.color} stopOpacity={0} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F0F1E8" />
            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#7A7D71', fontWeight: 600 }} dy={8} />
            <YAxis domain={[0, 100]} axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#7A7D71', fontWeight: 600 }} />
            <Tooltip
              cursor={{ stroke: '#E2E4D8', strokeWidth: 2, strokeDasharray: '4 4' }}
              contentStyle={{ backgroundColor: '#2D3A3A', border: 'none', borderRadius: '12px', color: '#fff', fontSize: '12px', fontWeight: 'bold', padding: '8px 14px' }}
            />
            {dataKeys.map(dk => (
              <Area 
                key={dk.key}
                type="monotone" 
                dataKey={dk.key} 
                name={dk.name}
                stroke={dk.color} 
                strokeWidth={3}
                fillOpacity={1} 
                fill={`url(#color-${dk.key})`} 
                activeDot={{ r: 6, strokeWidth: 0, fill: dk.color }}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
