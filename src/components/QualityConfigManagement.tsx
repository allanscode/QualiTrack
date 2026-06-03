import React from 'react';
import { Save, Plus, Trash2, Calendar, Clock, Check } from 'lucide-react';
import { motion } from 'motion/react';
import { toast } from 'sonner';
import { useQualityConfig } from '../lib/useQualityConfig';
import CustomSelect from './ui/CustomSelect';

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

  const handleHolidayInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value.replace(/\D/g, ''); // keep only digits
    if (val.length > 4) {
      val = val.slice(0, 4);
    }
    if (val.length > 2) {
      val = `${val.slice(0, 2)}/${val.slice(2)}`;
    }
    setHolidayInput(val);
  };

  const isHolidayInvalid = React.useMemo(() => {
    if (!holidayInput) return false;
    const parts = holidayInput.split('/');
    if (parts[0] && parts[0].length === 2) {
      const day = Number(parts[0]);
      if (isNaN(day) || day < 1 || day > 31) return true;
    }
    if (parts[1] && parts[1].length === 2) {
      const month = Number(parts[1]);
      if (isNaN(month) || month < 1 || month > 12) return true;
    }
    return false;
  }, [holidayInput]);

  const handleHolidayKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      const val = (e.target as HTMLInputElement).value;
      if (val.endsWith('/')) {
        e.preventDefault();
        setHolidayInput(val.slice(0, -2));
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      handleAddHoliday();
    }
  };

  const handleAddHoliday = () => {
    const val = holidayInput;
    if (val.length < 5) {
      toast.error('Formato incompleto. Use DD/MM (ex: 25/12)');
      return;
    }
    if (isHolidayInvalid) {
      toast.error('Data de feriado inválida. Verifique os valores.');
      return;
    }
    const currentHolidays = localConfig.businessHours?.holidays || [];
    if (currentHolidays.includes(val)) {
      toast.warning('Este feriado já está cadastrado.');
      return;
    }
    setLocalConfig(c => ({ 
      ...c, 
      businessHours: { 
        ...c.businessHours, 
        holidays: [...currentHolidays, val].sort() 
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
      toast.info('Recalculando prazos ativos por alteração no calendário...', { duration: 4000 });
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
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {[
                { label: 'Ciência do Suporte', field: 'agent_review' },
                { label: 'Reanálise Qualidade', field: 'auditor_reevaluation' },
                { label: 'Gestor Suporte', field: 'manager_support' },
                { label: 'Gestor Qualidade', field: 'manager_quality' }
              ].map(deadline => (
                <div key={deadline.field}>
                  <label className="block text-xs uppercase tracking-wider text-slate-500 dark:text-zinc-500 font-semibold mb-1 ml-0.5">{deadline.label}</label>
                  <div className="relative max-w-[100px] w-full">
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
            
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              <div className="lg:col-span-7 space-y-8">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div className="bg-surface-subtle/40 p-4 rounded-xl border border-surface-border/50 max-w-32 w-full">
                    <label className="block text-xs uppercase tracking-wider text-slate-500 dark:text-zinc-500 font-semibold mb-1 ml-0.5">
                      Início
                    </label>
                    <input
                      type="time"
                      value={localConfig.businessHours?.start || '08:00'}
                      onChange={e => setLocalConfig(c => ({ ...c, businessHours: { ...c.businessHours, start: e.target.value } }))}
                      className="w-full h-10 bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-50 rounded-lg px-3 text-sm font-medium focus:border-slate-400 dark:focus:border-slate-600 focus:outline-none focus:ring-0 transition-all shadow-sm"
                    />
                  </div>
                  <div className="bg-surface-subtle/40 p-4 rounded-xl border border-surface-border/50 max-w-32 w-full">
                    <label className="block text-xs uppercase tracking-wider text-slate-500 dark:text-zinc-500 font-semibold mb-1 ml-0.5">
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

                <div className="bg-surface-subtle/40 p-4 rounded-xl border border-surface-border/50">
                  <label className="block text-xs uppercase tracking-wider text-slate-500 dark:text-zinc-500 font-semibold mb-3 ml-0.5">Dias Úteis da Semana</label>
                  <div className="flex flex-wrap gap-2">
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
                          className={`px-3 h-10 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all border flex items-center gap-1.5 ${
                            isSelected 
                              ? 'bg-brand-primary border-brand-primary text-brand-on-primary shadow-sm' 
                              : 'bg-surface-card border-surface-border text-brand-muted hover:border-brand-accent/40'
                          }`}
                        >
                          {isSelected && <Check className="w-3.5 h-3.5" />}
                          {day}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="lg:col-span-5 bg-surface-subtle/40 rounded-xl p-4 border border-surface-border/50 flex flex-col">
                <div className="mb-4">
                  <label className="block text-xs uppercase tracking-wider text-slate-500 dark:text-zinc-500 font-semibold mb-1.5 ml-0.5">
                    Feriados (DD/MM)
                  </label>
                  <div className="flex items-center gap-2">
                    <input 
                      type="text" 
                      placeholder="Ex: 25/12"
                      value={holidayInput}
                      onChange={handleHolidayInputChange}
                      onKeyDown={handleHolidayKeyDown}
                      className={`w-24 h-10 bg-white dark:bg-slate-900/40 border text-slate-900 dark:text-slate-50 rounded-lg px-3 text-sm font-medium text-center focus:outline-none focus:ring-0 shadow-sm transition-all ${
                        isHolidayInvalid 
                          ? 'border-red-400 dark:border-red-500 focus:border-red-400 dark:focus:border-red-500' 
                          : 'border-slate-200 dark:border-slate-800 focus:border-slate-400 dark:focus:border-slate-600'
                      }`}
                    />
                    <button 
                      onClick={handleAddHoliday}
                      disabled={isHolidayInvalid || !holidayInput}
                      className="h-10 w-10 bg-brand-accent text-brand-on-primary rounded-lg hover:opacity-90 disabled:opacity-50 transition-all shadow-sm flex items-center justify-center shrink-0"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="flex-1 flex flex-wrap gap-2 max-h-[220px] overflow-y-auto no-scrollbar content-start">
                  {(localConfig.businessHours?.holidays || []).length > 0 ? (
                    localConfig.businessHours?.holidays.map(h => (
                      <div key={h} className="group bg-surface-card border border-surface-border rounded-lg pl-3 pr-1 h-8 flex items-center gap-1.5 shadow-sm hover:border-error/40 transition-all">
                        <span className="text-[11px] font-bold text-brand-primary">{h}</span>
                        <button 
                          onClick={() => {
                            const newHolidays = (localConfig.businessHours.holidays as string[]).filter(item => item !== h);
                            setLocalConfig(c => ({ ...c, businessHours: { ...c.businessHours, holidays: newHolidays } }));
                          }}
                          className="p-1 text-brand-muted hover:text-error transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))
                  ) : (
                    <div className="w-full py-10 text-center border border-dashed border-surface-border/50 rounded-lg">
                      <p className="text-sm font-normal text-slate-500 dark:text-slate-500">Nenhum feriado cadastrado.</p>
                    </div>
                  )}
                </div>
                <p className="mt-3 text-[10px] text-brand-muted/50 font-semibold uppercase tracking-wider">DD/MM para feriados anuais recorrentes.</p>
              </div>
            </div>
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
