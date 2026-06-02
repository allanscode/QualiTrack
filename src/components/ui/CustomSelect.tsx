import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
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
  size?: 'md' | 'sm';
}

export default function CustomSelect({
  value,
  onChange,
  options,
  placeholder = 'Selecionar...',
  className = '',
  disabled = false,
  label,
  size = 'md'
}: CustomSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const posRef = useRef<React.CSSProperties>({});
  const triggerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const selectedOption = options.find(opt => opt.value === value);

  const filtered = query
    ? options.filter(opt =>
        opt.label.toLowerCase().includes(query.toLowerCase())
      )
    : options;

  const calcPosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const viewportH = window.innerHeight;
    const spaceBelow = viewportH - rect.bottom;
    const spaceAbove = rect.top;
    const dropdownHeight = 256;
    const openUpward = spaceBelow < dropdownHeight && spaceAbove > spaceBelow;

    posRef.current = {
      position: 'fixed',
      left: rect.left,
      width: rect.width,
      zIndex: 9999,
      ...(openUpward
        ? { bottom: viewportH - rect.top + 4 }
        : { top: rect.bottom + 4 }),
    };
  }, []);

  const handleToggle = useCallback(() => {
    if (disabled) return;
    if (!isOpen) {
      calcPosition();
    }
    setIsOpen(prev => !prev);
  }, [disabled, isOpen, calcPosition]);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    }
  }, [isOpen]);

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

    function handlePageScroll(event: Event) {
      const target = event.target as Node;
      if (dropdownRef.current && dropdownRef.current.contains(target)) return;
      setIsOpen(false);
    }

    function handleResize() {
      calcPosition();
      const dropdown = dropdownRef.current;
      if (dropdown) {
        Object.assign(dropdown.style, posRef.current);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('scroll', handlePageScroll, true);
    window.addEventListener('resize', handleResize);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('scroll', handlePageScroll, true);
      window.removeEventListener('resize', handleResize);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, calcPosition]);

  const displayText = isOpen
    ? (query || '')
    : (selectedOption ? selectedOption.label : placeholder);

  const isCompact = size === 'sm';

  return (
    <div className={`flex flex-col gap-1 flex-1 min-w-[120px] ${className}`}>
      {label && <label className="text-[10px] font-black text-brand-muted uppercase tracking-widest ml-1">{label}</label>}
      <div className={disabled ? 'opacity-60 cursor-not-allowed' : ''}>
        <div
          ref={triggerRef}
          onClick={handleToggle}
          className={`flex items-center justify-between w-full bg-surface-card border border-surface-border px-3 transition-all shadow-sm ${
            isCompact ? 'h-9 rounded-xl px-2.5 text-[10px]' : 'h-10 rounded-2xl px-3 text-[11px]'
          } ${!disabled ? 'hover:border-brand-accent cursor-pointer' : 'cursor-not-allowed'} ${
            isOpen ? 'ring-2 ring-brand-accent/20 border-brand-accent' : ''
          }`}
        >
          <span className="truncate flex-1 min-w-0 font-bold text-brand-primary">
            {isOpen ? (
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder={selectedOption ? selectedOption.label : placeholder}
                className={`w-full bg-transparent outline-none font-bold text-brand-primary placeholder:text-brand-muted/60 ${
                  isCompact ? 'text-[10px]' : 'text-[11px]'
                }`}
                onClick={e => e.stopPropagation()}
              />
            ) : (
              displayText || placeholder
            )}
          </span>
          <ChevronDown
            className={`shrink-0 transition-transform ${
              isCompact ? 'w-3 h-3 ml-1' : 'w-3.5 h-3.5 ml-1.5'
            } ${isOpen ? 'rotate-180 text-brand-accent' : 'text-brand-muted'}`}
          />
        </div>

        {isOpen && !disabled && createPortal(
          <div
            ref={dropdownRef}
            style={posRef.current}
            className={`bg-surface-card border border-surface-border shadow-premium-lg max-h-60 overflow-auto py-1 no-scrollbar ${
              isCompact ? 'rounded-xl' : 'rounded-2xl'
            }`}
            onWheel={e => e.stopPropagation()}
          >
            {filtered.length === 0 ? (
              <div className={`font-bold text-brand-muted ${isCompact ? 'px-2.5 py-1.5 text-[10px]' : 'px-3 py-2 text-[11px]'}`}>
                Nenhum resultado
              </div>
            ) : (
              filtered.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    onChange(opt.value.toString());
                    setIsOpen(false);
                  }}
                  className={`w-full text-left font-bold transition-colors hover:bg-brand-highlight/20 truncate ${
                    isCompact ? 'px-2.5 py-1.5 text-[10px]' : 'px-3 py-2 text-[11px]'
                  } ${value === opt.value ? 'text-brand-primary bg-brand-highlight/10' : 'text-brand-muted hover:text-brand-primary'}`}
                >
                  {opt.label}
                </button>
              ))
            )}
          </div>,
          document.body
        )}
      </div>
    </div>
  );
}
