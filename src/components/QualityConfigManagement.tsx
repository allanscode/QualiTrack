import React from 'react';
import { createPortal } from 'react-dom';
import { Save, Plus, Calendar, Check, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import { useQualityConfig } from '../lib/useQualityConfig';
import CustomSelect from './ui/CustomSelect';
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
  isSameDay 
} from 'date-fns';
import { ptBR } from 'date-fns/locale';

const COLORS = [
  { color: 'text-level-excelente', bgColor: 'bg-level-excelente', label: 'Indigo', hex: '#6366F1' },
  { color: 'text-level-aceitavel', bgColor: 'bg-level-aceitavel', label: 'Verde', hex: '#10B981' },
  { color: 'text-level-atencao', bgColor: 'bg-level-atencao', label: 'Ambar', hex: '#F59E0B' },
  { color: 'text-level-ruim', bgColor: 'bg-level-ruim', label: 'Vermelho', hex: '#EF4444' },
  { color: 'text-level-roxo', bgColor: 'bg-level-roxo', label: 'Roxo', hex: '#8B5CF6' },
  { color: 'text-level-azul', bgColor: 'bg-level-azul', label: 'Azul', hex: '#3B82F6' },
];

export default function QualityConfigManagement({ mode = 'operacao' }: { mode?: 'operacao' | 'metas' }) {
  const { config, oldConfig, saveConfig, recalculateActiveActionDeadlines } = useQualityConfig();
  const [localConfig, setLocalConfig] = React.useState(config);
  const [saving, setSaving] = React.useState(false);
  const [holidayInput, setHolidayInput] = React.useState('');
  const [openColorPickerIdx, setOpenColorPickerIdx] = React.useState<number | null>(null);

  const [calendarOpen, setCalendarOpen] = React.useState(false);
  const [currentMonth, setCurrentMonth] = React.useState<Date>(() => new Date()); // Start dynamically in current month and year
  const triggerRef = React.useRef<HTMLDivElement>(null);
  const datepickerRef = React.useRef<HTMLDivElement>(null);
  const [pos, setPos] = React.useState<React.CSSProperties>({});

  const calcPosition = React.useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const viewportH = window.innerHeight;
    const viewportW = window.innerWidth;
    
    const dropdownHeight = 310;
    const dropdownWidth = 280;
    
    const spaceBelow = viewportH - rect.bottom;
    const spaceAbove = rect.top;
    
    const openUpward = spaceBelow < dropdownHeight && spaceAbove > spaceBelow;
    const leftPos = Math.max(8, Math.min(rect.left, viewportW - dropdownWidth - 8));

    setPos({
      position: 'fixed',
      left: leftPos,
      width: dropdownWidth,
      zIndex: 9999,
      ...(openUpward
        ? { bottom: viewportH - rect.top + 4 }
        : { top: rect.bottom + 4 }),
    });
  }, []);

  React.useEffect(() => {
    if (calendarOpen) {
      calcPosition();
    }
  }, [calendarOpen, calcPosition]);

  React.useEffect(() => {
    if (!calendarOpen) return;

    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (
        triggerRef.current && !triggerRef.current.contains(target) &&
        datepickerRef.current && !datepickerRef.current.contains(target)
      ) {
        setCalendarOpen(false);
      }
    }

    function handlePageScroll(event: Event) {
      const target = event.target as Node;
      if (datepickerRef.current && datepickerRef.current.contains(target)) return;
      setCalendarOpen(false);
    }

    function handleResize() {
      calcPosition();
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setCalendarOpen(false);
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
  }, [calendarOpen, calcPosition]);

  const daysGrid = React.useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 }); // Domingo
    const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });       // Sábado
    
    return eachDayOfInterval({ start: gridStart, end: gridEnd });
  }, [currentMonth]);

  const handlePrevMonth = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentMonth(prev => subMonths(prev, 1));
  };

  const handleNextMonth = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentMonth(prev => addMonths(prev, 1));
  };

  const handleSelectDay = (date: Date) => {
    const formatted = format(date, 'dd/MM');
    setHolidayInput(formatted);
    setCalendarOpen(false);
  };

  const selectedDate = React.useMemo(() => {
    if (!holidayInput) return null;
    const [day, month] = holidayInput.split('/').map(Number);
    if (!day || !month || isNaN(day) || isNaN(month)) return null;
    return new Date(currentMonth.getFullYear(), month - 1, day);
  }, [holidayInput, currentMonth]);

  const weekdays = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

  const handleAddHoliday = () => {
    if (!holidayInput) {
      toast.error('Selecione uma data no calendário.');
      return;
    }
    const currentHolidays = localConfig.businessHours?.holidays || [];
    if (currentHolidays.includes(holidayInput)) {
      toast.warning('Este feriado já está cadastrado.');
      return;
    }
    setLocalConfig(c => ({ 
      ...c, 
      businessHours: { 
        ...c.businessHours, 
        holidays: [...currentHolidays, holidayInput].sort() 
      } 
    }));
    setHolidayInput('');
  };

  React.useEffect(() => {
    setLocalConfig(config);
  }, [config]);

  const updateLevel = (idx: number, field: string, value: any) => {
    const newLevels = [...localConfig.levels];
    if (['label', 'color', 'bgColor'].includes(field)) {
      (newLevels[idx] as any)[field] = value;
    } else {
      (newLevels[idx] as any)[field] = value === '' ? '' : Number(value);
    }
    setLocalConfig(c => ({ ...c, levels: newLevels }));
  };

  const handleSave = async () => {
    setSaving(true);

    // Validate action_deadline fields are at least 1h
    const deadlineFields = ['agent_review', 'auditor_reevaluation', 'manager_support', 'manager_quality'];
    for (const field of deadlineFields) {
      const val = (localConfig.action_deadline as any)?.[field];
      if (typeof val !== 'number' || isNaN(val) || val < 1) {
        toast.error('Os prazos de ação devem ser de no mínimo 1 hora.');
        setSaving(false);
        return;
      }
    }

    // Validate targetScore
    if (typeof localConfig.targetScore !== 'number' || isNaN(localConfig.targetScore) || localConfig.targetScore < 0 || localConfig.targetScore > 100) {
      toast.error('A meta de desempenho deve ser um número válido entre 0 e 100.');
      setSaving(false);
      return;
    }

    // Validate targetReversalRate
    if (typeof localConfig.targetReversalRate !== 'number' || isNaN(localConfig.targetReversalRate) || localConfig.targetReversalRate < 0 || localConfig.targetReversalRate > 100) {
      toast.error('A meta de taxa de reversão deve ser um número válido entre 0 e 100.');
      setSaving(false);
      return;
    }

    // Validate targetVolume
    if (typeof localConfig.targetVolume !== 'number' || isNaN(localConfig.targetVolume) || localConfig.targetVolume < 1) {
      toast.error('A meta de volumetria deve ser um número inteiro positivo maior ou igual a 1.');
      setSaving(false);
      return;
    }

    // Validate levels
    for (const level of localConfig.levels) {
      if (typeof level.minScore !== 'number' || isNaN(level.minScore) || level.minScore < 0 || level.minScore > 100 ||
          typeof level.maxScore !== 'number' || isNaN(level.maxScore) || level.maxScore < 0 || level.maxScore > 100) {
        toast.error('Os limites das faixas de classificação devem ser números válidos entre 0 e 100.');
        setSaving(false);
        return;
      }
      if (level.minScore > level.maxScore) {
        toast.error(`O score mínimo do nível "${level.label}" não pode ser maior que o score máximo.`);
        setSaving(false);
        return;
      }
    }

    const sorted = [...localConfig.levels].sort((a, b) => a.minScore - b.minScore);
    
    if (sorted[0].minScore !== 0) {
      toast.error('A primeira faixa de classificação deve começar em 0%.');
      setSaving(false);
      return;
    }

    if (sorted[sorted.length - 1].maxScore !== 100) {
      toast.error('A última faixa de classificação deve terminar em 100%.');
      setSaving(false);
      return;
    }

    for (let i = 0; i < sorted.length - 1; i++) {
      const currentMax = sorted[i].maxScore;
      const nextMin = sorted[i + 1].minScore;
      
      if (nextMin <= currentMax) {
        toast.error(`Faixas sobrepostas detectadas entre "${sorted[i].label}" e "${sorted[i + 1].label}".`);
        setSaving(false);
        return;
      }
      
      if (nextMin > currentMax + 1) {
        toast.error(`Existe um intervalo ausente (gap) entre as faixas "${sorted[i].label}" (${currentMax}%) e "${sorted[i + 1].label}" (${nextMin}%). Os limites devem ser contínuos (ex: 74% e 75%).`);
        setSaving(false);
        return;
      }
    }
    
    const holidaysChanged = JSON.stringify(oldConfig.businessHours.holidays) !== JSON.stringify(localConfig.businessHours.holidays);
    const daysChanged = JSON.stringify(oldConfig.businessHours.days) !== JSON.stringify(localConfig.businessHours.days);
    const hoursChanged = oldConfig.businessHours.start !== localConfig.businessHours.start || oldConfig.businessHours.end !== localConfig.businessHours.end;
    
    await saveConfig(localConfig);
    
    if (holidaysChanged || daysChanged || hoursChanged) {
      await recalculateActiveActionDeadlines(oldConfig, localConfig);
      toast.success('Prazos recalculados com sucesso!');
    } else {
      toast.success('Configurações de qualidade salvas com sucesso!');
    }
    
    setSaving(false);
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
      {mode === 'operacao' ? (
        <>
          <div>
            <h2 className="text-xl font-black text-brand-primary tracking-tight">Configuração de Operação</h2>
            <p className="text-xs text-brand-muted mt-1 font-medium">
              Gerencie os prazos limite do fluxo de monitoria, horários de expediente, dias úteis e feriados cadastrados.
            </p>
          </div>

          {/* Action Deadline Configuration */}
          <div className="bg-surface-card rounded-2xl border border-surface-border p-6 shadow-premium-sm">
            <h3 className="font-black text-brand-primary text-base mb-1 uppercase tracking-tight">Prazos de Ação</h3>
            <p className="text-xs text-brand-muted mb-4 font-medium">
              Configure o tempo limite (em horas úteis) para cada ação no fluxo da monitoria.
            </p>
            <div className="flex flex-wrap gap-6 items-center justify-start">
              {[
                { label: 'Ciência do Suporte', field: 'agent_review' },
                { label: 'Reanálise Qualidade', field: 'auditor_reevaluation' },
                { label: 'Gestor Suporte', field: 'manager_support' },
                { label: 'Gestor Qualidade', field: 'manager_quality' }
              ].map(deadline => (
                <div key={deadline.field} className="flex flex-col gap-1">
                  <label className="block text-xs uppercase tracking-wider text-slate-500 dark:text-zinc-500 font-semibold mb-1 ml-0.5">{deadline.label}</label>
                  <div className="relative max-w-[120px] w-full">
                    <input
                      type="number"
                      min={1}
                      step={1}
                      onKeyDown={e => {
                        if (['.', ',', '-', '+', 'e', 'E'].includes(e.key)) {
                          e.preventDefault();
                        }
                      }}
                      value={(localConfig.action_deadline as any)?.[deadline.field] ?? ''}
                      onChange={e => {
                        const val = e.target.value === '' ? '' : Math.max(1, Math.floor(Number(e.target.value)));
                        setLocalConfig(c => ({ ...c, action_deadline: { ...c.action_deadline, [deadline.field]: val as any } }));
                      }}
                      className="w-full h-10 bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-50 rounded-lg text-sm font-medium text-center focus:border-slate-400 dark:focus:border-slate-600 focus:outline-none focus:ring-0 pr-6 transition-all shadow-sm"
                    />
                    <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] font-semibold text-slate-400 dark:text-zinc-500 uppercase tracking-widest">h</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Business Hours & Holidays Configuration */}
          <div className="bg-surface-card rounded-2xl border border-surface-border p-6 shadow-premium-sm">
            <h3 className="font-black text-brand-primary text-base mb-1 uppercase tracking-tight">Horário Comercial e Feriados</h3>
            <p className="text-xs text-brand-muted mb-4 font-medium">
              Defina o período de funcionamento para o cálculo preciso do prazo.
            </p>
            
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full">
              {/* COLUNA DA ESQUERDA (Ocupando col-span-7): Horários e Dias Úteis */}
              <div className="lg:col-span-7 flex flex-col gap-6">
                {/* SUB-BLOCO 1: Horários (Início e Fim compactos lado a lado) */}
                <div className="bg-surface-subtle/40 p-4 rounded-xl border border-surface-border/50">
                  <div className="flex items-center gap-4">
                    <div className="w-[140px]">
                      <label className="block text-xs uppercase tracking-wider text-slate-500 dark:text-zinc-500 font-semibold mb-1.5 ml-0.5">
                        Início
                      </label>
                      <input
                        type="time"
                        value={localConfig.businessHours?.start || '08:00'}
                        onChange={e => setLocalConfig(c => ({ ...c, businessHours: { ...c.businessHours, start: e.target.value } }))}
                        className="w-full h-10 bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-50 rounded-lg px-3 text-sm font-medium focus:border-slate-400 dark:focus:border-slate-600 focus:outline-none focus:ring-0 transition-all shadow-sm"
                      />
                    </div>
                    <div className="w-[140px]">
                      <label className="block text-xs uppercase tracking-wider text-slate-500 dark:text-zinc-500 font-semibold mb-1.5 ml-0.5">
                        Fim
                      </label>
                      <input
                        type="time"
                        value={localConfig.businessHours?.end || '17:00'}
                        onChange={e => setLocalConfig(c => ({ ...c, businessHours: { ...c.businessHours, end: e.target.value } }))}
                        className="w-full h-10 bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-50 rounded-lg px-3 text-sm font-medium focus:border-slate-400 dark:focus:border-slate-600 focus:outline-none focus:ring-0 transition-all shadow-sm"
                      />
                    </div>
                  </div>
                </div>

                {/* SUB-BLOCO 2: Dias Úteis da Semana (Única linha horizontal contínua) */}
                <div className="bg-surface-subtle/40 p-4 rounded-xl border border-surface-border/50">
                  <label className="block text-xs uppercase tracking-wider text-slate-500 dark:text-zinc-500 font-semibold mb-3 ml-0.5">
                    Dias Úteis da Semana
                  </label>
                  <div className="flex flex-row gap-2 items-center w-full">
                    {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((day, idx) => {
                      const isSelected = localConfig.businessHours?.days.includes(idx);
                      return (
                        <button
                          key={day}
                          onClick={() => {
                            const currentDays = localConfig.businessHours?.days || [];
                            const newDays = isSelected 
                              ? currentDays.filter(d => d !== idx)
                              : [...currentDays, idx].sort();
                            setLocalConfig(c => ({ ...c, businessHours: { ...c.businessHours, days: newDays } }));
                          }}
                          className={`flex-1 h-10 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all border flex items-center justify-center gap-1 ${
                            isSelected 
                              ? 'bg-brand-primary border-brand-primary text-brand-on-primary shadow-sm shadow-brand-primary/10 hover:opacity-90' 
                              : 'bg-surface-card border-surface-border text-brand-muted hover:border-brand-accent/40 hover:text-brand-primary'
                          }`}
                        >
                          {isSelected && <Check className="w-3 h-3 shrink-0" />}
                          <span>{day}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* COLUNA DA DIREITA (Ocupando col-span-5): Feriados */}
              <div className="lg:col-span-5 bg-surface-subtle/40 rounded-xl p-4 border border-surface-border/50 flex flex-col justify-between">
                <div>
                  <label className="block text-xs uppercase tracking-wider text-slate-500 dark:text-zinc-500 font-semibold mb-1.5 ml-0.5">
                    Feriados (DD/MM)
                  </label>
                  <div className="flex items-center gap-2 w-full">
                    {/* Floating Calendar Trigger */}
                    <div
                      ref={triggerRef}
                      onClick={() => setCalendarOpen(prev => !prev)}
                      className="flex items-center justify-between w-36 h-10 bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 rounded-lg px-3 text-sm font-medium text-slate-900 dark:text-slate-50 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/30 hover:border-slate-300 dark:hover:border-slate-700 transition-all duration-200 shadow-sm select-none shrink-0"
                    >
                      <div className="flex items-center gap-2 truncate">
                        <Calendar className="w-4 h-4 text-brand-muted" />
                        <span className={holidayInput ? "text-slate-900 dark:text-slate-50 font-bold" : "text-slate-400 dark:text-zinc-500 font-bold"}>
                          {holidayInput || 'DD/MM'}
                        </span>
                      </div>
                      {holidayInput && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setHolidayInput('');
                          }}
                          className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:text-zinc-500 dark:hover:text-slate-300 transition-all duration-200"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    <button 
                      onClick={handleAddHoliday}
                      disabled={!holidayInput}
                      className="flex-1 h-10 px-4 bg-brand-primary text-brand-on-primary rounded-lg hover:bg-opacity-90 dark:hover:bg-neutral-200 disabled:opacity-50 transition-all duration-200 shadow-sm flex items-center justify-center gap-1.5 font-semibold text-xs cursor-pointer shrink-0 active:scale-[0.98]"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Adicionar Feriado</span>
                    </button>
                  </div>
                </div>

                <div className="mt-4 flex-1 flex flex-wrap gap-2 max-h-[160px] overflow-y-auto no-scrollbar content-start">
                  {(localConfig.businessHours?.holidays || []).length > 0 ? (
                    localConfig.businessHours?.holidays.map(h => (
                      <div 
                        key={h} 
                        className="group flex items-center gap-2 px-2.5 py-1 bg-slate-900/40 border border-slate-800 rounded-md text-xs font-normal text-slate-300 shadow-sm transition-all"
                      >
                        <span>{h}</span>
                        <button 
                          onClick={() => {
                            const newHolidays = (localConfig.businessHours.holidays as string[]).filter(item => item !== h);
                            setLocalConfig(c => ({ ...c, businessHours: { ...c.businessHours, holidays: newHolidays } }));
                          }}
                          className="text-slate-500 hover:text-red-400 dark:text-zinc-500 dark:hover:text-red-400 transition-all duration-200 hover:scale-110 active:scale-95 cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))
                  ) : (
                    <div className="w-full py-6 text-center border border-dashed border-surface-border/50 rounded-lg flex flex-col justify-center items-center h-full min-h-[100px]">
                      <p className="text-sm font-normal text-slate-500 dark:text-slate-500">Nenhum feriado cadastrado.</p>
                    </div>
                  )}
                </div>
                <p className="mt-3 text-[10px] text-brand-muted/50 font-semibold uppercase tracking-wider">DD/MM para feriados anuais recorrentes.</p>
              </div>
            </div>

            {calendarOpen && createPortal(
              <div
                ref={datepickerRef}
                style={pos}
                onWheel={e => e.stopPropagation()}
                className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-premium-lg overflow-hidden select-none animate-fade-in"
              >
                <AnimatePresence initial={false}>
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: -4 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: -4 }}
                    transition={{ duration: 0.12, ease: 'easeOut' }}
                    className="p-4"
                  >
                    {/* Calendar Header (Month navigation) */}
                    <div className="flex items-center justify-between mb-4">
                      <button
                        type="button"
                        onClick={handlePrevMonth}
                        className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-900 border border-slate-200 dark:border-slate-800/50 text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-slate-200 hover:opacity-80 active:scale-95 transition-all duration-200 flex items-center justify-center cursor-pointer"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      <span className="text-xs font-black text-slate-900 dark:text-slate-200 uppercase tracking-wider hover:text-brand-accent transition-all duration-200 cursor-pointer select-none">
                        {format(currentMonth, 'MMMM', { locale: ptBR })}
                      </span>
                      <button
                        type="button"
                        onClick={handleNextMonth}
                        className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-900 border border-slate-200 dark:border-slate-800/50 text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-slate-200 hover:opacity-80 active:scale-95 transition-all duration-200 flex items-center justify-center cursor-pointer"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Weekdays */}
                    <div className="grid grid-cols-7 gap-1 text-center mb-1">
                      {weekdays.map((day, idx) => (
                        <span
                          key={idx}
                          className="text-[9px] font-black text-slate-400 dark:text-zinc-500 uppercase tracking-widest h-6 flex items-center justify-center"
                        >
                          {day}
                        </span>
                      ))}
                    </div>

                    {/* Days Grid */}
                    <div className="grid grid-cols-7 gap-1 text-center">
                      {daysGrid.map((day, idx) => {
                        const isSelected = selectedDate ? isSameDay(day, selectedDate) : false;
                        const isCurrentMonth = isSameMonth(day, currentMonth);
                        const isToday = isSameDay(day, new Date());
                        
                        return (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => handleSelectDay(day)}
                            className={`text-[10px] h-7 w-7 rounded-xl flex flex-col items-center justify-center relative transition-all duration-200 cursor-pointer ${
                              isSelected 
                                ? 'bg-brand-accent text-brand-on-primary font-black shadow-premium-sm scale-105 hover:opacity-90' 
                                : `${
                                    !isCurrentMonth 
                                      ? 'text-slate-300 dark:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800/50 font-bold' 
                                      : 'text-slate-900 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/50 font-bold'
                                  }`
                            } ${isToday && !isSelected ? 'border border-brand-accent/40 dark:border-brand-accent/40 bg-brand-accent/5 dark:bg-brand-accent/10' : ''}`}
                          >
                            <span className={isToday ? 'relative -top-0.5' : ''}>{format(day, 'd')}</span>
                            {isToday && (
                              <span className={`absolute bottom-0.5 w-1 h-1 rounded-full ${isSelected ? 'bg-white' : 'bg-brand-accent animate-pulse'}`} />
                            )}
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
        </>
      ) : (
        <>
          <div>
            <h2 className="text-xl font-black text-brand-primary tracking-tight">Metas e Indicadores</h2>
            <p className="text-xs text-brand-muted mt-1 font-medium">
              Gerencie as metas de desempenho do suporte, metas operacionais da auditoria e as faixas de classificação.
            </p>
          </div>

          {/* Target Score */}
          <div className="bg-surface-card rounded-2xl border border-surface-border p-6 shadow-premium-sm">
            <h3 className="font-black text-brand-primary text-base mb-1 uppercase tracking-tight">Meta de Desempenho</h3>
            <p className="text-xs text-brand-muted mb-4 font-medium">
              Score mínimo para o suporte ser considerado dentro da meta. Usado nos rankings Top, Medianos e Oportunidades.
            </p>
            <div className="flex flex-col gap-1">
              <label className="block text-xs uppercase tracking-wider text-slate-500 dark:text-zinc-500 font-semibold mb-1 ml-0.5">Score Mínimo</label>
              <div className="relative max-w-[100px] w-full">
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={localConfig.targetScore ?? ''}
                  onChange={e => {
                    const val = e.target.value === '' ? '' : Number(e.target.value);
                    setLocalConfig(c => ({ ...c, targetScore: val as any }));
                  }}
                  className="w-full h-10 bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-50 rounded-lg text-sm font-medium text-center focus:border-slate-400 dark:focus:border-slate-600 focus:outline-none focus:ring-0 pr-6 transition-all shadow-sm"
                />
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] font-semibold text-slate-400 dark:text-zinc-500">%</span>
              </div>
            </div>
          </div>

          {/* Auditor Goal configuration */}
          <div className="bg-surface-card rounded-2xl border border-surface-border p-6 shadow-premium-sm">
            <h3 className="font-black text-brand-primary text-base mb-1 uppercase tracking-tight">Metas da Auditoria</h3>
            <p className="text-xs text-brand-muted mb-4 font-medium">
              Defina as metas operacionais para a equipe de monitoria/qualidade para o período.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl">
              {/* Taxa de Reversão */}
              <div className="space-y-2 flex flex-col max-w-md w-full">
                <div>
                  <label className="block text-xs uppercase tracking-wider text-slate-500 dark:text-zinc-500 font-semibold mb-1 ml-0.5">
                    Taxa de Reversão
                  </label>
                  <div className="relative max-w-[100px] w-full">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={localConfig.targetReversalRate ?? ''}
                      onChange={e => {
                        const val = e.target.value === '' ? '' : Number(e.target.value);
                        setLocalConfig(c => ({ ...c, targetReversalRate: val as any }));
                      }}
                      className="w-full h-10 bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-50 rounded-lg text-sm font-medium text-center focus:border-slate-400 dark:focus:border-slate-600 focus:outline-none focus:ring-0 pr-6 transition-all shadow-sm"
                      placeholder="15"
                    />
                    <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] font-semibold text-slate-400 dark:text-zinc-500">%</span>
                  </div>
                  <p className="text-[11px] text-brand-muted mt-2 font-medium">
                    Percentual máximo tolerável de contestações consideradas procedentes/aceitas.
                  </p>
                </div>
              </div>

              {/* Volumetria */}
              <div className="space-y-2 flex flex-col max-w-md w-full">
                <div>
                  <label className="block text-xs uppercase tracking-wider text-slate-500 dark:text-zinc-500 font-semibold mb-1 ml-0.5">
                    Volumetria
                  </label>
                  <div className="relative max-w-[120px] w-full">
                    <input
                      type="number"
                      min={1}
                      value={localConfig.targetVolume ?? ''}
                      onChange={e => {
                        const val = e.target.value === '' ? '' : Number(e.target.value);
                        setLocalConfig(c => ({ ...c, targetVolume: val as any }));
                      }}
                      className="w-full h-10 bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-50 rounded-lg text-sm font-medium text-center focus:border-slate-400 dark:focus:border-slate-600 focus:outline-none focus:ring-0 pr-10 transition-all shadow-sm"
                      placeholder="30"
                    />
                    <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] font-semibold text-slate-400 dark:text-zinc-500 uppercase">Qtd</span>
                  </div>
                  <p className="text-[11px] text-brand-muted mt-2 font-medium">
                    Quantidade alvo de monitorias que cada auditor deve realizar por período.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Quality Level Bands */}
          <div className="bg-surface-card rounded-2xl border border-surface-border p-6 shadow-premium-sm">
            <h3 className="font-black text-brand-primary text-base mb-1 uppercase tracking-tight">Faixas de Classificação</h3>
            <p className="text-xs text-brand-muted mb-4 font-medium">
              Configure os intervalos de score para cada nível. As faixas não podem se sobrepor.
            </p>
            <div className="space-y-4">
              {/* Header Row for Large Screens */}
              <div className="hidden lg:grid grid-cols-12 gap-4 px-4 mb-2 w-full select-none">
                <div className="col-span-4 text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-zinc-500 pl-0.5">Nome do Nível</div>
                <div className="col-span-2 text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-zinc-500 text-center pl-0.5">Mínimo</div>
                <div className="col-span-2 text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-zinc-500 text-center pl-0.5">Máximo</div>
                <div className="col-span-2 text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-zinc-500 pl-0.5">Cor de Destaque</div>
                <div className="col-span-2 text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-zinc-500 text-right pr-0.5">Preview</div>
              </div>

              {localConfig.levels.map((level, idx) => {
                const activeColor = COLORS.find(c => c.color === level.color) || COLORS[0];
                return (
                  <div key={idx} className="bg-surface-subtle/40 rounded-xl p-4 border border-surface-border group hover:border-brand-accent/40 transition-all">
                    <div className="grid grid-cols-12 gap-4 items-center w-full">
                      {/* Nome do Nível */}
                      <div className="col-span-4">
                        <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-zinc-500 mb-1.5 ml-0.5 lg:hidden">Nome do Nível</label>
                        <input
                          type="text"
                          value={level.label}
                          onChange={e => updateLevel(idx, 'label', e.target.value)}
                          className="w-full h-10 bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-50 rounded-lg px-3 text-sm font-medium focus:border-slate-400 dark:focus:border-slate-600 focus:outline-none focus:ring-0 shadow-sm transition-all"
                        />
                      </div>

                      {/* Score Min */}
                      <div className="col-span-2">
                        <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-zinc-500 mb-1.5 ml-0.5 lg:hidden text-center">Mínimo</label>
                        <div className="relative">
                          <input
                            type="number"
                            min={0}
                            max={100}
                            value={level.minScore ?? ''}
                            onChange={e => updateLevel(idx, 'minScore', e.target.value)}
                            className="w-full h-10 bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-50 rounded-lg text-sm font-medium text-center focus:border-slate-400 dark:focus:border-slate-600 focus:outline-none focus:ring-0 pr-6 transition-all shadow-sm"
                          />
                          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-slate-400 dark:text-zinc-500">%</span>
                        </div>
                      </div>

                      {/* Score Max */}
                      <div className="col-span-2">
                        <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-zinc-500 mb-1.5 ml-0.5 lg:hidden text-center">Máximo</label>
                        <div className="relative">
                          <input
                            type="number"
                            min={0}
                            max={100}
                            value={level.maxScore ?? ''}
                            onChange={e => updateLevel(idx, 'maxScore', e.target.value)}
                            className="w-full h-10 bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-50 rounded-lg text-sm font-medium text-center focus:border-slate-400 dark:focus:border-slate-600 focus:outline-none focus:ring-0 pr-6 transition-all shadow-sm"
                          />
                          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-slate-400 dark:text-zinc-500">%</span>
                        </div>
                      </div>

                      {/* Cor de Destaque */}
                      <div className="col-span-2 relative">
                        <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-zinc-500 mb-1.5 ml-0.5 lg:hidden">Cor de Destaque</label>
                        
                        {/* Custom modern trigger button */}
                        <div
                          onClick={() => setOpenColorPickerIdx(openColorPickerIdx === idx ? null : idx)}
                          className="h-10 w-full bg-white dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 rounded-lg flex items-center justify-between px-3 shadow-sm select-none cursor-pointer hover:border-slate-300 dark:hover:border-slate-700 transition-all"
                        >
                          <div className="flex items-center gap-2 overflow-hidden mr-1 min-w-0">
                            <div 
                              className="w-4 h-4 rounded-full border border-black/10 dark:border-white/10 shrink-0" 
                              style={{ backgroundColor: activeColor.hex }}
                            />
                            <span className="text-xs text-slate-700 dark:text-slate-200 font-medium truncate">
                              {activeColor.label}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {/* Dropdown caret */}
                            <svg className="w-3.5 h-3.5 text-slate-400 dark:text-zinc-500 transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                              <polyline points="6 9 12 15 18 9" />
                            </svg>
                          </div>
                        </div>

                        {/* Color Picker Popover */}
                        {openColorPickerIdx === idx && (
                          <>
                            {/* Fullscreen click-away overlay */}
                            <div 
                              className="fixed inset-0 z-40" 
                              onClick={(e) => {
                                e.stopPropagation();
                                setOpenColorPickerIdx(null);
                              }} 
                            />
                            <div className="absolute left-0 right-0 mt-1 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg shadow-premium py-1 z-50 animate-fade-in w-full max-h-60 overflow-y-auto thin-scrollbar">
                              {COLORS.map(c => {
                                const isSelected = level.color === c.color;
                                return (
                                  <button
                                    key={c.label}
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const newLevels = [...localConfig.levels];
                                      newLevels[idx] = { ...newLevels[idx], color: c.color, bgColor: c.bgColor };
                                      setLocalConfig(prev => ({ ...prev, levels: newLevels }));
                                      setOpenColorPickerIdx(null);
                                    }}
                                    className={`w-full px-3 py-2 flex items-center gap-2 text-left hover:bg-slate-50 dark:hover:bg-slate-900/60 transition-colors ${
                                      isSelected ? 'bg-slate-50/50 dark:bg-slate-900/40 font-semibold' : ''
                                    }`}
                                  >
                                    <div 
                                      className="w-4 h-4 rounded-full border border-black/10 dark:border-white/10 shrink-0" 
                                      style={{ backgroundColor: c.hex }} 
                                    />
                                    <span className="text-xs text-slate-700 dark:text-slate-200 font-medium">
                                      {c.label}
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          </>
                        )}
                      </div>

                      {/* Preview Badge inline */}
                      <div className="col-span-2">
                        <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-zinc-500 mb-1.5 ml-0.5 lg:hidden text-center">Preview</label>
                        <div className="flex items-center h-10 pb-0.5 w-full">
                          <span className={`flex items-center gap-1.5 px-3 h-10 rounded-lg text-[10px] font-bold uppercase tracking-wider ${level.bgColor} ${level.color} border border-current/15 shadow-sm w-full justify-center text-center`}>
                            <div className={`w-1.5 h-1.5 rounded-full ${level.color.replace('text-', 'bg-')}`} />
                            {level.label || 'Nível'}: {level.minScore ?? 0}% - {level.maxScore ?? 0}%
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-6 p-4 bg-surface-subtle rounded-xl border border-surface-border/50">
              <p className="font-black text-brand-primary text-[10px] mb-2 uppercase tracking-widest">Regras de Validação</p>
              <ul className="space-y-1 text-[11px] text-brand-muted font-medium">
                <li className="flex items-center gap-2"><div className="w-1 h-1 rounded-full bg-brand-accent" /> As faixas de score não podem se sobrepor</li>
                <li className="flex items-center gap-2"><div className="w-1 h-1 rounded-full bg-brand-accent" /> Recomenda-se cobrir o intervalo de 0% a 100%</li>
                <li className="flex items-center gap-2"><div className="w-1 h-1 rounded-full bg-brand-accent" /> As alterações são aplicadas imediatamente após salvar</li>
              </ul>
            </div>
          </div>
        </>
      )}

      {/* Save Button */}
      <div className="flex justify-end pt-4 pb-10">
        <button
          onClick={handleSave}
          disabled={saving}
          className="bg-brand-primary text-brand-on-primary h-10 px-8 rounded-lg text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition-all flex items-center gap-2 shadow-sm active:scale-[0.98]"
        >
          {saving ? <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" /> : <Save className="w-4 h-4" />}
          {saving ? 'Salvando...' : 'Salvar Alterações'}
        </button>
      </div>
    </motion.div>
  );
}
