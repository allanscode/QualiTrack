import React from 'react';
import Card from '../../ui/Card';

interface StatCardProps {
  title: string;
  value: string | number;
  sub: React.ReactNode;
  good: boolean;
  icon: React.ReactNode;
  accent: string;
  onClick?: () => void;
}

const BG_MAP: Record<string, string> = {
  'text-functional-error': 'bg-functional-error',
  'text-functional-warning': 'bg-functional-warning',
  'text-functional-success': 'bg-functional-success',
  'text-brand-accent': 'bg-icon-accent',
  'text-brand-highlight': 'bg-icon-highlight',
  'text-brand-muted': 'bg-surface-subtle',
  'text-brand-primary': 'bg-icon-primary',
  'text-info': 'bg-surface-subtle',
  'text-warning': 'bg-functional-warning',
  'text-success': 'bg-functional-success',
};

function getIconBg(accent: string): string {
  if (BG_MAP[accent]) return BG_MAP[accent];
  if (accent.startsWith('text-level-')) {
    const level = accent.replace('text-level-', 'bg-level-');
    return level;
  }
  return 'bg-surface-subtle';
}

export default function StatCard({ title, value, sub, good, icon, accent, onClick }: StatCardProps) {
  const iconBg = getIconBg(accent);

  return (
    <Card onClick={onClick}>
      <div className="flex items-start justify-between mb-4">
        <span className="text-[10px] font-black uppercase tracking-widest text-brand-muted">{title}</span>
        <div className={`w-9 h-9 rounded-xl ${iconBg} flex items-center justify-center flex-shrink-0 ${accent}`}>
          {icon}
        </div>
      </div>
      <p className="text-3xl font-black text-brand-primary leading-none mb-2">{value}</p>
      <div className={`text-[10px] font-bold uppercase tracking-wider ${good ? 'text-brand-muted' : 'text-functional-error'}`}>{sub}</div>
    </Card>
  );
}
