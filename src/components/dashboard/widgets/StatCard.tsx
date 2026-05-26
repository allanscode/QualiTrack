import React from 'react';
import Card from '../../ui/Card';

interface StatCardProps {
  title: string;
  value: string | number;
  sub: React.ReactNode;
  good: boolean;
  icon: React.ReactNode;
  /** Tailwind text-color class for the icon, e.g. 'text-success', 'text-error' */
  accent: string;
  onClick?: () => void;
}

export default function StatCard({ title, value, sub, good, icon, accent, onClick }: StatCardProps) {
  return (
    <Card onClick={onClick}>
      <div className="flex items-start justify-between mb-4">
        <span className="text-[10px] font-black uppercase tracking-widest text-brand-muted">{title}</span>
        <div className={`w-9 h-9 rounded-xl bg-surface-subtle flex items-center justify-center flex-shrink-0 ${accent}`}>
          {icon}
        </div>
      </div>
      <p className="text-3xl font-black text-brand-primary leading-none mb-2">{value}</p>
      <div className={`text-[10px] font-bold uppercase tracking-wider ${good ? 'text-brand-muted' : 'text-functional-error'}`}>{sub}</div>
    </Card>
  );
}
