import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  children: React.ReactNode;
  icon?: React.ReactNode;
  loading?: boolean;
}

export default function Button({ 
  variant = 'primary', 
  size = 'md', 
  children, 
  icon, 
  loading,
  className = '', 
  ...props 
}: ButtonProps) {
  const variants = {
    primary: 'bg-brand-primary text-brand-on-primary hover:bg-opacity-90 shadow-premium active:scale-[0.98]',
    secondary: 'bg-brand-accent text-brand-primary hover:bg-opacity-90 shadow-premium active:scale-[0.98]',
    outline: 'bg-transparent border border-surface-border text-brand-primary hover:bg-surface-subtle dark:hover:bg-slate-800/50 active:scale-[0.98]',
    danger: 'bg-error text-white hover:bg-opacity-90 shadow-premium active:scale-[0.98]',
    ghost: 'bg-transparent text-brand-muted hover:text-brand-primary hover:bg-surface-subtle dark:hover:bg-slate-800/50 active:scale-[0.98]'
  };

  const sizes = {
    sm: 'px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-lg',
    md: 'px-5 py-2.5 text-xs font-bold uppercase tracking-wider rounded-lg',
    lg: 'px-8 py-3.5 text-sm font-bold uppercase tracking-wider rounded-lg'
  };

  return (
    <button 
      className={`inline-flex items-center justify-center gap-2 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed ${variants[variant]} ${sizes[size]} ${className}`}
      disabled={props.disabled || loading}
      {...props}
    >
      {icon && <span className="flex-shrink-0">{icon}</span>}
      {children}
    </button>
  );
}
