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
  const variants = {
    primary: 'bg-brand-primary text-white',
    secondary: 'bg-brand-subtle text-brand-muted',
    success: 'bg-emerald-100 text-emerald-700',
    warning: 'bg-amber-100 text-amber-700',
    error: 'bg-red-100 text-red-700',
    info: 'bg-indigo-100 text-indigo-700',
    neutral: 'bg-surface-subtle text-brand-muted'
  };

  const sizes = {
    xs: 'px-1.5 py-0.5 text-[9px]',
    sm: 'px-2.5 py-1 text-[10px]',
    md: 'px-3 py-1.5 text-xs'
  };

  return (
    <span className={`inline-flex items-center font-black uppercase tracking-widest rounded-lg transition-colors ${variants[variant]} ${sizes[size]} ${className}`}>
      {children}
    </span>
  );
}
