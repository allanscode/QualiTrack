import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';

interface Option {
  value: string | number;
  label: string;
}

interface CustomSelectProps {
  value: string | number;
  onChange: (value: string) => void;
  options: Option[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  label?: string;
}

export default function CustomSelect({ 
  value, 
  onChange, 
  options, 
  placeholder = 'Selecionar...', 
  className = '',
  disabled = false,
  label
}: CustomSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const selectedOption = options.find(opt => opt.value === value);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className={`flex flex-col gap-1 ${className}`} ref={containerRef}>
      {label && <label className="text-[10px] font-black text-brand-muted uppercase tracking-widest ml-1">{label}</label>}
      <div className={`relative ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}>
        <button
          type="button"
          onClick={() => !disabled && setIsOpen(!isOpen)}
          disabled={disabled}
          className={`flex items-center justify-between w-full bg-surface-card border border-surface-border rounded-2xl px-4 h-11 text-xs font-bold text-brand-primary transition-all shadow-sm ${!disabled ? 'hover:border-brand-accent cursor-pointer' : 'cursor-not-allowed'} ${isOpen ? 'ring-2 ring-brand-accent/20 border-brand-accent' : ''}`}
        >
          <span className="truncate">{selectedOption ? selectedOption.label : placeholder}</span>
          <ChevronDown className={`w-3.5 h-3.5 ml-2 transition-transform ${isOpen ? 'rotate-180 text-brand-accent' : 'text-brand-muted'}`} />
        </button>

        {isOpen && !disabled && (
          <div className="absolute top-[calc(100%+8px)] left-0 right-0 bg-surface-card border border-surface-border rounded-2xl shadow-premium-lg z-[100] max-h-60 overflow-auto py-2 animate-in fade-in slide-in-from-top-2 duration-200 no-scrollbar">
            {options.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  onChange(opt.value.toString());
                  setIsOpen(false);
                }}
                className={`w-full text-left px-4 py-2.5 text-xs font-bold transition-colors hover:bg-brand-highlight/20 ${value === opt.value ? 'text-brand-primary bg-brand-highlight/10' : 'text-brand-muted hover:text-brand-primary'}`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
