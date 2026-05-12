import React from 'react';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'success' | 'warning' | 'error' | 'info' | 'neutral';
  className?: string;
  size?: 'xs' | 'sm' | 'md';
}

export default function Badge({
  children,
  variant = 'neutral',
  className = '',
  size = 'sm'
}: BadgeProps) {
  // All variants use design system tokens instead of raw Tailwind color classes
  const variants = {
    primary:   'bg-brand-primary text-white',
    secondary: 'bg-surface-subtle text-brand-muted',
    success:   'bg-success/10 text-success',
    warning:   'bg-warning/10 text-warning',
    error:     'bg-error/10 text-error',
    info:      'bg-info/10 text-info',
    neutral:   'bg-surface-subtle text-brand-muted',
  };

  const sizes = {
    xs: 'px-1.5 py-0.5 text-[9px]',
    sm: 'px-2.5 py-1 text-[10px]',
    md: 'px-3 py-1.5 text-xs',
  };

  return (
    <span className={`inline-flex items-center font-black uppercase tracking-widest rounded-lg transition-colors ${variants[variant]} ${sizes[size]} ${className}`}>
      {children}
    </span>
  );
}
