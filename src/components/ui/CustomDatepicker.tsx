import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { 
  format, 
  addMonths, 
  subMonths, 
  startOfMonth, 
  endOfMonth, 
  startOfWeek, 
  endOfWeek, 
  eachDayOfInterval, 
  isSameMonth, 
  isSameDay, 
  isToday, 
  parseISO 
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { motion, AnimatePresence } from 'motion/react';

interface CustomDatepickerProps {
  value: string; // Formato padrão "YYYY-MM-DD"
  onChange: (date: string) => void;
  placeholder?: string;
  label?: string;
  disabled?: boolean;
  className?: string;
  clearable?: boolean;
  size?: 'md' | 'sm';
}

export default function CustomDatepicker({
  value,
  onChange,
  placeholder = 'Selecionar data...',
  label,
  disabled = false,
  className = '',
  clearable = false,
  size = 'md'
}: CustomDatepickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const posRef = useRef<React.CSSProperties>({});
  const triggerRef = useRef<HTMLDivElement>(null);
  const datepickerRef = useRef<HTMLDivElement>(null);

  // Mês atualmente visualizado no calendário
  const [currentMonth, setCurrentMonth] = useState<Date>(() => {
    if (value) {
      try {
        return parseISO(value);
      } catch (e) {
        return new Date();
      }
    }
    return new Date();
  });

  // Sincroniza o mês de visualização quando o valor externo mudar
  useEffect(() => {
    if (value) {
      try {
        const parsed = parseISO(value);
        setCurrentMonth(parsed);
      } catch (e) {
        // Ignora erros de parsing
      }
    }
  }, [value]);

  // Calcula a posição física do popover na tela via Portal
  const calcPosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const viewportH = window.innerHeight;
    const viewportW = window.innerWidth;
    
    const dropdownHeight = 310; // Altura aproximada do calendário
    const dropdownWidth = 280;  // Largura do calendário
    
    const spaceBelow = viewportH - rect.bottom;
    const spaceAbove = rect.top;
    
    // Decide se abre para cima ou para baixo
    const openUpward = spaceBelow < dropdownHeight && spaceAbove > spaceBelow;
    
    // Calcula o posicionamento horizontal para não estourar a janela à direita ou esquerda
    const leftPos = Math.max(8, Math.min(rect.left, viewportW - dropdownWidth - 8));

    posRef.current = {
      position: 'fixed',
      left: leftPos,
      width: dropdownWidth,
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

  // Registra os event listeners quando o calendário está aberto
  useEffect(() => {
    if (!isOpen) return;

    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (
        triggerRef.current && !triggerRef.current.contains(target) &&
        datepickerRef.current && !datepickerRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    }

    function handlePageScroll(event: Event) {
      const target = event.target as Node;
      // Permite scroll dentro do próprio calendário sem fechar
      if (datepickerRef.current && datepickerRef.current.contains(target)) return;
      setIsOpen(false);
    }

    function handleResize() {
      calcPosition();
      const popup = datepickerRef.current;
      if (popup) {
        Object.assign(popup.style, posRef.current);
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

  // Geração dos dias a exibir na grade do calendário
  const daysGrid = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 }); // Domingo
    const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });       // Sábado
    
    return eachDayOfInterval({ start: gridStart, end: gridEnd });
  }, [currentMonth]);

  // Navegação de meses
  const handlePrevMonth = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentMonth(prev => subMonths(prev, 1));
  };

  const handleNextMonth = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentMonth(prev => addMonths(prev, 1));
  };

  const handleSelectDay = (date: Date) => {
    const formatted = format(date, 'yyyy-MM-dd');
    onChange(formatted);
    setIsOpen(false);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('');
    setIsOpen(false);
  };

  // Texto amigável de exibição
  const displayText = useMemo(() => {
    if (!value) return placeholder;
    try {
      const parsed = parseISO(value);
      return format(parsed, "dd 'de' MMM, yyyy", { locale: ptBR });
    } catch (e) {
      return placeholder;
    }
  }, [value, placeholder]);

  const selectedDate = useMemo(() => {
    if (!value) return null;
    try {
      return parseISO(value);
    } catch (e) {
      return null;
    }
  }, [value]);

  const weekdays = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

  return (
    <div className={`flex flex-col gap-1 w-full flex-1 min-w-[120px] ${className}`}>
      {label && (
        <label className="text-[10px] font-black text-brand-muted uppercase tracking-widest ml-1">
          {label}
        </label>
      )}
      <div className={disabled ? 'opacity-60 cursor-not-allowed' : ''}>
        <div
          ref={triggerRef}
          onClick={handleToggle}
          className={`flex items-center justify-between w-full bg-surface-card border border-surface-border px-3 transition-all shadow-sm ${
            size === 'sm' ? 'h-9 rounded-lg px-2.5 text-[10px]' : 'h-10 rounded-lg px-3 text-[11px]'
          } ${
            !disabled ? 'hover:border-brand-accent cursor-pointer' : 'cursor-not-allowed'
          } ${isOpen ? 'ring-2 ring-brand-accent/20 border-brand-accent' : ''}`}
        >
          <div className="flex items-center gap-2 truncate flex-1 min-w-0">
            <CalendarIcon className={`shrink-0 ${size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5'} ${isOpen ? 'text-brand-accent' : 'text-brand-muted'}`} />
            <span className={`truncate ${!value ? 'text-brand-muted/60' : 'text-brand-primary'} font-bold`}>
              {displayText}
            </span>
          </div>
          <div className="flex items-center gap-1">
            {clearable && value && !disabled && (
              <button
                type="button"
                onClick={handleClear}
                className="p-1 rounded-lg hover:bg-surface-subtle text-brand-muted hover:text-functional-error transition-colors"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>

        {isOpen && !disabled && createPortal(
          <div
            ref={datepickerRef}
            style={posRef.current}
            onWheel={e => e.stopPropagation()}
            className="bg-surface-card border border-surface-border rounded-lg shadow-premium-lg overflow-hidden select-none"
          >
            <AnimatePresence initial={false}>
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: -4 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: -4 }}
                transition={{ duration: 0.12, ease: 'easeOut' }}
                className="p-4"
              >
                {/* Cabeçalho do Calendário (Mês e Ano + Navegação) */}
                <div className="flex items-center justify-between mb-4">
                  <button
                    type="button"
                    onClick={handlePrevMonth}
                    className="p-1.5 rounded-lg hover:bg-surface-subtle border border-surface-border/50 text-brand-muted hover:text-brand-primary hover:opacity-80 active:scale-95 transition-all duration-200 flex items-center justify-center cursor-pointer"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-xs font-black text-brand-primary uppercase tracking-wider hover:text-brand-accent transition-all duration-200 cursor-pointer select-none">
                    {format(currentMonth, 'MMMM yyyy', { locale: ptBR })}
                  </span>
                  <button
                    type="button"
                    onClick={handleNextMonth}
                    className="p-1.5 rounded-lg hover:bg-surface-subtle border border-surface-border/50 text-brand-muted hover:text-brand-primary hover:opacity-80 active:scale-95 transition-all duration-200 flex items-center justify-center cursor-pointer"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>

                {/* Dias da Semana (D, S, T, ...) */}
                <div className="grid grid-cols-7 gap-1 text-center mb-1">
                  {weekdays.map((day, idx) => (
                    <span
                      key={idx}
                      className="text-[9px] font-black text-brand-muted/70 uppercase tracking-widest h-6 flex items-center justify-center"
                    >
                      {day}
                    </span>
                  ))}
                </div>

                {/* Grade de Dias */}
                <div className="grid grid-cols-7 gap-1 text-center">
                  {daysGrid.map((day, idx) => {
                    const isSelected = selectedDate ? isSameDay(day, selectedDate) : false;
                    const isCurrentMonth = isSameMonth(day, currentMonth);
                    const isCurrentDay = isToday(day);
                    
                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => handleSelectDay(day)}
                        className={`text-[10px] h-7 w-7 rounded-lg flex items-center justify-center transition-all duration-200 cursor-pointer ${
                          isSelected 
                            ? 'bg-brand-primary text-brand-on-primary font-black shadow-premium-sm scale-105 hover:opacity-90' 
                            : `${
                                !isCurrentMonth 
                                  ? 'text-brand-muted/30 hover:bg-slate-100 dark:hover:bg-slate-800/50 font-bold' 
                                  : 'text-brand-primary hover:bg-slate-100 dark:hover:bg-slate-800/50 font-bold'
                              } ${
                                isCurrentDay 
                                  ? 'border border-brand-accent/50 text-brand-accent font-black' 
                                  : ''
                              }`
                        }`}
                      >
                        {format(day, 'd')}
                      </button>
                    );
                  })}
                </div>
              </motion.div>
            </AnimatePresence>
          </div>,
          document.body
        )}
      </div>
    </div>
  );
}
