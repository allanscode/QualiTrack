import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  padding?: 'none' | 'sm' | 'md' | 'lg' | 'xl';
}

export default function Card({ 
  children, 
  className = '', 
  onClick, 
  padding = 'md' 
}: CardProps) {
  const paddings = {
    none: '',
    sm: 'p-3',
    md: 'p-5',
    lg: 'p-6',
    xl: 'p-8'
  };

  return (
    <div 
      onClick={onClick}
      className={`
        bg-surface-card 
        border border-surface-border 
        rounded-card 
        shadow-premium 
        transition-all 
        ${paddings[padding]}
        ${onClick ? 'cursor-pointer hover:shadow-premium-lg hover:border-brand-highlight active:scale-[0.98]' : 'hover:shadow-premium-lg'}
        ${className}
      `}
    >
      {children}
    </div>
  );
}
