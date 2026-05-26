import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Search } from 'lucide-react';

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
  const [search, setSearch] = useState('');
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const selectedOption = options.find(opt => opt.value === value);

  const filteredOptions = options.filter(opt =>
    opt.value === '' || opt.label.toLowerCase().includes(search.toLowerCase())
  );

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    const dropdown = dropdownRef.current;
    if (!trigger || !dropdown) return;

    const rect = trigger.getBoundingClientRect();
    const viewportH = window.innerHeight;
    const spaceBelow = viewportH - rect.bottom;
    const spaceAbove = rect.top;
    const dropdownHeight = 256;

    let top: number;
    if (spaceBelow >= dropdownHeight || spaceBelow >= spaceAbove) {
      top = rect.bottom + 8;
    } else {
      top = rect.top - dropdownHeight - 8;
    }

    dropdown.style.position = 'fixed';
    dropdown.style.top = `${top}px`;
    dropdown.style.left = `${rect.left}px`;
    dropdown.style.width = `${rect.width}px`;
    dropdown.style.zIndex = '9999';
  }, []);

  useEffect(() => {
    if (isOpen) {
      updatePosition();
      setSearch('');
      requestAnimationFrame(() => {
        searchRef.current?.focus();
      });
    }
  }, [isOpen, updatePosition]);

  useEffect(() => {
    if (!isOpen) return;

    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (
        triggerRef.current && !triggerRef.current.contains(target) &&
        dropdownRef.current && !dropdownRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    }

    function handleScroll() {
      updatePosition();
    }

    function handleResize() {
      updatePosition();
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', handleResize);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleResize);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, updatePosition]);

  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      {label && <label className="text-[10px] font-black text-brand-muted uppercase tracking-widest ml-1">{label}</label>}
      <div className={disabled ? 'opacity-60 cursor-not-allowed' : ''}>
        <button
          ref={triggerRef}
          type="button"
          onClick={() => !disabled && setIsOpen(!isOpen)}
          disabled={disabled}
          className={`flex items-center justify-between w-full bg-surface-card border border-surface-border rounded-2xl px-4 h-11 text-xs font-bold text-brand-primary transition-all shadow-sm ${!disabled ? 'hover:border-brand-accent cursor-pointer' : 'cursor-not-allowed'} ${isOpen ? 'ring-2 ring-brand-accent/20 border-brand-accent' : ''}`}
        >
          <span className="truncate">{selectedOption ? selectedOption.label : placeholder}</span>
          <ChevronDown className={`w-3.5 h-3.5 ml-2 transition-transform ${isOpen ? 'rotate-180 text-brand-accent' : 'text-brand-muted'}`} />
        </button>

        {isOpen && !disabled && createPortal(
          <div
            ref={dropdownRef}
            className="bg-surface-card border border-surface-border rounded-2xl shadow-premium-lg max-h-60 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200"
          >
            <div className="sticky top-0 bg-surface-card px-3 pt-3 pb-2 border-b border-surface-border">
              <div className="flex items-center gap-2 bg-surface-subtle rounded-xl px-3 h-8">
                <Search className="w-3.5 h-3.5 text-brand-muted flex-shrink-0" />
                <input
                  ref={searchRef}
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Buscar..."
                  className="w-full bg-transparent text-xs font-medium text-brand-primary placeholder:text-brand-muted/50 outline-none"
                />
              </div>
            </div>
            <div className="overflow-auto max-h-[calc(15rem-2.5rem)] no-scrollbar">
              {filteredOptions.length === 0 ? (
                <div className="px-4 py-3 text-xs text-brand-muted">Nenhum resultado</div>
              ) : (
                filteredOptions.map((opt) => (
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
                ))
              )}
            </div>
          </div>,
          document.body
        )}
      </div>
    </div>
  );
}
