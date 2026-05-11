import React from 'react';
import Card from '../../ui/Card';

interface StatCardProps {
  title: string;
  value: string | number;
  sub: string;
  good: boolean;
  icon: React.ReactNode;
  accent: string;
  onClick?: () => void;
}

export default function StatCard({ title, value, sub, good, icon, accent, onClick }: StatCardProps) {
  return (
    <Card onClick={onClick}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] font-bold uppercase tracking-widest text-brand-muted">{title}</span>
        <div className={`${accent}`}>{icon}</div>
      </div>
      <p className="text-3xl font-black text-brand-primary leading-none mb-1.5">{value}</p>
      <p className={`text-xs font-semibold ${good ? 'text-brand-muted' : 'text-error'}`}>{sub}</p>
    </Card>
  );
}
