import React, { useState } from 'react';
import Card from '../../ui/Card';
import { motion, AnimatePresence } from 'motion/react';

interface StatCardProps {
  title: string;
  value: string | number;
  sub: React.ReactNode;
  good: boolean;
  icon: React.ReactNode;
  accent: string;
  onClick?: () => void;
  badge?: React.ReactNode;
}

const BG_MAP: Record<string, string> = {
  'text-functional-error': 'bg-functional-error/10',
  'text-functional-warning': 'bg-functional-warning/10',
  'text-functional-success': 'bg-functional-success/10',
  'text-brand-accent': 'bg-icon-accent',
  'text-brand-highlight': 'bg-icon-highlight',
  'text-brand-muted': 'bg-surface-subtle',
  'text-brand-primary': 'bg-icon-primary',
  'text-info': 'bg-surface-subtle',
  'text-warning': 'bg-functional-warning/10',
  'text-success': 'bg-functional-success/10',
};

function getIconBg(accent: string): string {
  if (BG_MAP[accent]) return BG_MAP[accent];
  if (accent.startsWith('text-level-')) {
    const level = accent.replace('text-level-', 'bg-level-');
    return level;
  }
  return 'bg-surface-subtle';
}

export default function StatCard({ title, value, sub, icon, accent, onClick, badge }: StatCardProps) {
  const iconBg = getIconBg(accent);
  const [isHovered, setIsHovered] = useState(false);

  return (
    <Card onClick={onClick}>
      <div className="flex items-start justify-between mb-4">
        <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
          {title}
        </span>
        <div
          className={`relative w-9 h-9 rounded-xl ${iconBg} flex items-center justify-center flex-shrink-0 ${accent} cursor-help`}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          {icon}
          <AnimatePresence>
            {isHovered && sub && (
              <motion.div
                initial={{ opacity: 0, y: 8, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.95 }}
                transition={{ duration: 0.12, ease: 'easeOut' }}
                className="absolute bottom-full right-0 mb-2 z-50 whitespace-nowrap bg-slate-900 text-white dark:bg-slate-50 dark:text-slate-900 text-[10px] font-semibold px-2.5 py-1.5 rounded-lg shadow-xl shadow-slate-900/10 border border-slate-800/10 dark:border-slate-200/10 pointer-events-none"
              >
                {sub}
                {/* Subtle downward pointing arrow */}
                <div className="absolute top-full right-4 w-2 h-2 bg-slate-900 dark:bg-slate-50 rotate-45 -translate-y-1" />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
      <div className="flex items-baseline gap-2 mb-1">
        <p className="text-3xl font-black leading-none text-slate-900 dark:text-slate-50">
          {value}
        </p>
        {badge}
      </div>
    </Card>
  );
}
