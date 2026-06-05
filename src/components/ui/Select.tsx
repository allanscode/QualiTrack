import React from 'react';
import { ChevronDown } from 'lucide-react';

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  options: { value: string | number; label: string }[];
}

export default function Select({ label, options, className = '', ...props }: SelectProps) {
  return (
    <div className="flex flex-col gap-1">
      {label && <label className="text-[10px] font-bold text-brand-muted uppercase tracking-widest ml-1">{label}</label>}
      <div className="relative">
        <select 
          className={`
            appearance-none
            w-full
            bg-surface-card 
            border border-surface-border 
            rounded-lg 
            px-4 py-2 pr-10
            text-sm font-semibold text-brand-primary 
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
        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-brand-muted">
          <ChevronDown className="h-4 w-4" />
        </div>
      </div>
    </div>
  );
}
