import React from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import Card from '../../ui/Card';

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
    <Card padding="lg" className="h-full flex flex-col">
      {(title || subtitle) && (
        <div className="mb-4">
          {title && <h3 className="text-sm font-black text-brand-primary uppercase tracking-widest">{title}</h3>}
          {subtitle && <p className="text-[10px] font-bold text-brand-muted uppercase tracking-wider mt-0.5">{subtitle}</p>}
        </div>
      )}
      <div className="flex-1 min-h-[150px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--surface-border)" />
            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: 'var(--brand-muted)', fontWeight: 700 }} dy={8} />
            <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: 'var(--brand-muted)', fontWeight: 700 }} />
            <Tooltip
              cursor={false}
              contentStyle={{ backgroundColor: 'var(--brand-primary)', border: 'none', borderRadius: '12px', color: 'var(--surface-bg)', fontSize: '11px', fontWeight: 700, padding: '10px 14px' }}
              itemStyle={{ fontSize: '11px', padding: '2px 0' }}
            />
            <Legend
              iconType="circle"
              iconSize={8}
              wrapperStyle={{ fontSize: '10px', fontWeight: 700, color: 'var(--brand-muted)', paddingTop: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}
            />
            {dataKeys.map(dk => (
              <Bar key={dk.key} dataKey={dk.key} name={dk.name} fill={dk.color} radius={[4, 4, 0, 0]} maxBarSize={40} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
