import React from 'react';

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  options: { value: string | number; label: string }[];
}

export default function Select({ label, options, className = '', ...props }: SelectProps) {
  return (
    <div className="flex flex-col gap-1">
      {label && <label className="text-[10px] font-bold text-brand-muted uppercase tracking-widest ml-1">{label}</label>}
      <select 
        className={`
          bg-surface-bg 
          border border-surface-border 
          rounded-xl 
          px-3 py-2 
          text-xs font-semibold text-brand-primary 
          focus:border-brand-accent focus:outline-none 
          transition-colors
          ${className}
        `}
        {...props}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
