import React from 'react';

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
    <div 
      onClick={onClick}
      className={`bg-white p-5 rounded-3xl border border-[#E2E4D8] shadow-sm transition-all ${onClick ? 'cursor-pointer hover:shadow-md hover:border-[#C5C7BB] active:scale-[0.98]' : 'hover:shadow-md'}`}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] font-bold uppercase tracking-widest text-[#7A7D71]">{title}</span>
        <div className={`${accent}`}>{icon}</div>
      </div>
      <p className="text-3xl font-black text-[#2D3A3A] leading-none mb-1.5">{value}</p>
      <p className={`text-xs font-semibold ${good ? 'text-[#7A7D71]' : 'text-red-500'}`}>{sub}</p>
    </div>
  );
}
