import React from 'react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import Card from '../../ui/Card';

interface TrendChartProps {
  title: string;
  subtitle?: string;
  data: any[];
  dataKeys: { key: string; color: string; name: string }[];
}

export default function TrendChart({ title, subtitle, data, dataKeys }: TrendChartProps) {
  return (
    <Card padding="lg" className="h-full flex flex-col">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-4">
        <div>
          <h3 className="text-sm font-black text-brand-primary uppercase tracking-widest">{title}</h3>
          {subtitle && <p className="text-[10px] font-bold text-brand-muted uppercase tracking-wider mt-0.5">{subtitle}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-4 text-[10px] font-black uppercase tracking-widest text-brand-muted">
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
                  <stop offset="5%" stopColor={dk.color} stopOpacity={0.25} />
                  <stop offset="95%" stopColor={dk.color} stopOpacity={0} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F0F1E8" />
            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#7A7D71', fontWeight: 700 }} dy={8} />
            <YAxis domain={[0, 100]} axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#7A7D71', fontWeight: 700 }} />
            <Tooltip
              cursor={{ stroke: '#E2E4D8', strokeWidth: 2, strokeDasharray: '4 4' }}
              contentStyle={{ backgroundColor: '#2D3A3A', border: 'none', borderRadius: '12px', color: '#fff', fontSize: '11px', fontWeight: 700, padding: '8px 14px' }}
            />
            {dataKeys.map(dk => (
              <Area
                key={dk.key}
                type="monotone"
                dataKey={dk.key}
                name={dk.name}
                stroke={dk.color}
                strokeWidth={2.5}
                fillOpacity={1}
                fill={`url(#color-${dk.key})`}
                activeDot={{ r: 5, strokeWidth: 0, fill: dk.color }}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
