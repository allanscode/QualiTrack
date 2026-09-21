import React from 'react';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'success' | 'warning' | 'error' | 'info' | 'neutral';
  className?: string;
  size?: 'xs' | 'sm' | 'md';
  title?: string;
}

export default function Badge({
  children,
  variant = 'neutral',
  className = '',
  size = 'sm',
  title
}: BadgeProps) {
  // All variants use design system tokens instead of raw Tailwind color classes
  const variants = {
    primary: 'bg-brand-accent/10 text-brand-accent border border-brand-accent/25',
    secondary: 'bg-surface-subtle text-brand-muted border border-surface-border',
    success: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/25',
    warning: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/25',
    error: 'bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-500/25',
    info: 'bg-sky-500/10 text-sky-700 dark:text-sky-400 border border-sky-500/25',
    neutral: 'bg-surface-subtle text-brand-muted border border-surface-border',
  };

  const sizes = {
    xs: 'px-2 py-0.5 text-[9px]',
    sm: 'px-2.5 py-0.5 text-[11px]',
    md: 'px-3 py-1 text-xs',
  };

  return (
    <span title={title} className={`inline-flex items-center gap-1.5 font-semibold rounded-full transition-colors ${variants[variant]} ${sizes[size]} ${className}`}>
      {children}
    </span>
  );
}
