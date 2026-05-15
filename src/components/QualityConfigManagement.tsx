import React from 'react';
import { Save, Plus, Trash2, Calendar, Clock, Check } from 'lucide-react';
import { motion } from 'motion/react';
import { toast } from 'sonner';
import { useQualityConfig } from '../lib/useQualityConfig';

const COLORS = [
  { color: 'text-indigo-700', bgColor: 'bg-indigo-50', label: 'Indigo' },
  { color: 'text-emerald-700', bgColor: 'bg-emerald-50', label: 'Verde' },
  { color: 'text-amber-700', bgColor: 'bg-amber-50', label: 'Ambar' },
  { color: 'text-red-700', bgColor: 'bg-red-50', label: 'Vermelho' },
  { color: 'text-purple-700', bgColor: 'bg-purple-50', label: 'Roxo' },
  { color: 'text-blue-700', bgColor: 'bg-blue-50', label: 'Azul' },
];

export default function QualityConfigManagement() {
  const { config, oldConfig, saveConfig, recalculateActiveDeadlines } = useQualityConfig();
  const [localConfig, setLocalConfig] = React.useState(config);
  const [saving, setSaving] = React.useState(false);

  const updateLevel = (idx: number, field: string, value: any) => {
    const newLevels = [...localConfig.levels];
    (newLevels[idx] as any)[field] = ['label', 'color', 'bgColor'].includes(field) ? value : Number(value);
    setLocalConfig(c => ({ ...c, levels: newLevels }));
  };

  const handleSave = async () => {
    setSaving(true);
    const sorted = [...localConfig.levels].sort((a, b) => a.minScore - b.minScore);
    for (let i = 0; i < sorted.length - 1; i++) {
      if (sorted[i].maxScore >= sorted[i + 1].minScore) {
        toast.error('Faixas sobrepostas. Corrija os limites antes de salvar.');
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
      await recalculateActiveDeadlines(oldConfig, localConfig);
      toast.success('Prazos recalculados com sucesso!');
    } else {
      toast.success('Configurações de qualidade salvas com sucesso!');
    }
    
    setSaving(false);
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
      <div>
        <h2 className="text-2xl font-black text-brand-primary tracking-tight">Configuração de Qualidade</h2>
        <p className="text-sm text-brand-muted mt-1 font-medium">
          Defina as faixas de classificação e a meta de desempenho. Alterações afetam dashboards e rankings imediatamente.
        </p>
      </div>

      {/* Target Score */}
      <div className="bg-surface-card rounded-3xl border border-surface-border p-8 shadow-premium-sm">
        <h3 className="font-black text-brand-primary text-lg mb-2 uppercase tracking-tight">Meta de Desempenho</h3>
        <p className="text-sm text-brand-muted mb-6 font-medium">
          Score mínimo para o suporte ser considerado dentro da meta. Usado nos rankings Top, Medianos e Oportunidades.
        </p>
        <div className="flex items-center gap-6 flex-wrap">
          <div className="flex-1 max-w-xs">
            <label className="block text-[10px] font-black text-brand-muted uppercase tracking-widest mb-2 ml-1">Score mínimo (%)</label>
            <input
              type="number"
              min={0}
              max={100}
              value={localConfig.targetScore}
              onChange={e => setLocalConfig(c => ({ ...c, targetScore: Number(e.target.value) }))}
              className="w-full bg-surface-subtle border border-surface-border rounded-2xl py-3 px-6 text-lg font-black text-brand-primary focus:border-brand-accent focus:outline-none transition-all"
            />
          </div>
          <div className={`px-8 py-5 rounded-2xl border-2 flex flex-col justify-center ${localConfig.targetScore >= 75 ? 'bg-success/5 border-success/20 text-success' : 'bg-warning/5 border-warning/20 text-warning'}`}>
            <p className="text-[10px] font-black uppercase tracking-widest mb-1 opacity-70">Meta atual</p>
            <p className="text-4xl font-black">{localConfig.targetScore}%</p>
          </div>
        </div>
      </div>

      {/* SLA Configuration */}
      <div className="bg-surface-card rounded-3xl border border-surface-border p-8 shadow-premium-sm">
        <h3 className="font-black text-brand-primary text-lg mb-2 uppercase tracking-tight">Prazos de Atendimento (SLA)</h3>
        <p className="text-sm text-brand-muted mb-6 font-medium">
          Configure o tempo limite (em horas úteis) para cada ação no fluxo da monitoria.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[
            { label: 'Ciência do Suporte', field: 'agentReview' },
            { label: 'Reanálise Qualidade', field: 'auditorReevaluation' },
            { label: 'Gestor Suporte', field: 'managerSupport' },
            { label: 'Gestor Qualidade', field: 'managerQuality' }
          ].map(sla => (
            <div key={sla.field}>
              <label className="block text-[10px] font-black text-brand-muted uppercase tracking-widest mb-2 ml-1">{sla.label}</label>
              <div className="relative">
                <input
                  type="number"
                  min={1}
                  value={(localConfig.sla as any)?.[sla.field] || 24}
                  onChange={e => setLocalConfig(c => ({ ...c, sla: { ...c.sla, [sla.field]: Number(e.target.value) } }))}
                  className="w-full bg-surface-subtle border border-surface-border rounded-2xl py-3 px-6 text-lg font-black text-brand-primary focus:border-brand-accent focus:outline-none pr-12 transition-all"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-black text-brand-muted uppercase tracking-widest opacity-50">h</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Business Hours & Holidays Configuration */}
      <div className="bg-surface-card rounded-3xl border border-surface-border p-8 shadow-premium-sm">
        <h3 className="font-black text-brand-primary text-lg mb-2 uppercase tracking-tight">Horário Comercial e Feriados</h3>
        <p className="text-sm text-brand-muted mb-6 font-medium">
          Defina o período de funcionamento para o cálculo preciso do SLA.
        </p>
        
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-7 space-y-8">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className="bg-surface-subtle/40 p-4 rounded-2xl border border-surface-border/50">
                <label className="block text-[10px] font-black text-brand-muted uppercase tracking-widest mb-3 flex items-center gap-2 ml-1">
                  <Clock className="w-3.5 h-3.5" /> Início do Expediente
                </label>
                <input
                  type="time"
                  value={localConfig.businessHours?.start || '08:00'}
                  onChange={e => setLocalConfig(c => ({ ...c, businessHours: { ...c.businessHours, start: e.target.value } }))}
                  className="w-full bg-surface-card border border-surface-border rounded-xl py-3 px-6 text-sm font-black text-brand-primary focus:border-brand-accent focus:outline-none transition-all shadow-sm"
                />
              </div>
              <div className="bg-surface-subtle/40 p-4 rounded-2xl border border-surface-border/50">
                <label className="block text-[10px] font-black text-brand-muted uppercase tracking-widest mb-3 flex items-center gap-2 ml-1">
                  <Clock className="w-3.5 h-3.5" /> Fim do Expediente
                </label>
                <input
                  type="time"
                  value={localConfig.businessHours?.end || '17:00'}
                  onChange={e => setLocalConfig(c => ({ ...c, businessHours: { ...c.businessHours, end: e.target.value } }))}
                  className="w-full bg-surface-card border border-surface-border rounded-xl py-3 px-6 text-sm font-black text-brand-primary focus:border-brand-accent focus:outline-none transition-all shadow-sm"
                />
              </div>
            </div>

            <div className="bg-surface-subtle/40 p-6 rounded-2xl border border-surface-border/50">
              <label className="block text-[10px] font-black text-brand-muted uppercase tracking-widest mb-4 ml-1">Dias Úteis da Semana</label>
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
                      className={`px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border-2 flex items-center gap-2 ${
                        isSelected 
                          ? 'bg-brand-primary border-brand-primary text-brand-on-primary shadow-premium-sm' 
                          : 'bg-surface-card border-surface-border text-brand-muted hover:border-brand-accent/40'
                      }`}
                    >
                      {isSelected && <Check className="w-3 h-3" />}
                      {day}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="lg:col-span-5 bg-surface-subtle/40 rounded-2xl p-6 border border-surface-border/50 flex flex-col">
            <div className="flex items-center justify-between mb-6">
              <label className="text-[10px] font-black text-brand-muted uppercase tracking-widest flex items-center gap-2">
                <Calendar className="w-3.5 h-3.5" /> Feriados (DD/MM)
              </label>
              <div className="flex items-center gap-2">
                <input 
                  type="text" 
                  placeholder="Ex: 25/12"
                  id="new-holiday"
                  className="w-24 bg-surface-card border border-surface-border rounded-xl px-3 py-2 text-xs font-bold text-brand-primary focus:outline-none focus:border-brand-accent shadow-sm"
                  onKeyPress={e => {
                    if (e.key === 'Enter') {
                      const val = (e.target as HTMLInputElement).value;
                      if (/^\d{2}\/\d{2}$/.test(val)) {
                        const currentHolidays = localConfig.businessHours?.holidays || [];
                        if (!currentHolidays.includes(val)) {
                          setLocalConfig(c => ({ ...c, businessHours: { ...c.businessHours, holidays: [...currentHolidays, val].sort() } }));
                          (e.target as HTMLInputElement).value = '';
                        }
                      } else {
                        toast.error('Formato inválido. Use DD/MM (ex: 25/12)');
                      }
                    }
                  }}
                />
                <button 
                  onClick={() => {
                    const el = document.getElementById('new-holiday') as HTMLInputElement;
                    const val = el.value;
                    if (/^\d{2}\/\d{2}$/.test(val)) {
                      const currentHolidays = localConfig.businessHours?.holidays || [];
                      if (!currentHolidays.includes(val)) {
                        setLocalConfig(c => ({ ...c, businessHours: { ...c.businessHours, holidays: [...currentHolidays, val].sort() } }));
                        el.value = '';
                      }
                    } else {
                      toast.error('Formato inválido. Use DD/MM (ex: 25/12)');
                    }
                  }}
                  className="p-2 bg-brand-accent text-brand-on-primary rounded-xl hover:opacity-90 transition-all shadow-sm"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 flex flex-wrap gap-2 max-h-[220px] overflow-y-auto no-scrollbar content-start">
              {(localConfig.businessHours?.holidays || []).length > 0 ? (
                localConfig.businessHours?.holidays.map(h => (
                  <div key={h} className="group bg-surface-card border border-surface-border rounded-xl pl-3 pr-1 py-1.5 flex items-center gap-2 shadow-sm hover:border-error/40 transition-all">
                    <span className="text-[11px] font-black text-brand-primary">{h}</span>
                    <button 
                      onClick={() => {
                        const newHolidays = (localConfig.businessHours.holidays as string[]).filter(item => item !== h);
                        setLocalConfig(c => ({ ...c, businessHours: { ...c.businessHours, holidays: newHolidays } }));
                      }}
                      className="p-1.5 text-brand-muted hover:text-error transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))
              ) : (
                <div className="w-full py-10 text-center border-2 border-dashed border-surface-border/50 rounded-xl">
                  <p className="text-[10px] font-black text-brand-muted uppercase opacity-30 italic tracking-widest">Nenhum feriado cadastrado</p>
                </div>
              )}
            </div>
            <p className="mt-4 text-[9px] text-brand-muted/50 font-bold uppercase tracking-wider">DD/MM para feriados anuais recorrentes.</p>
          </div>
        </div>
      </div>

      {/* Quality Level Bands */}
      <div className="bg-surface-card rounded-3xl border border-surface-border p-8 shadow-premium-sm">
        <h3 className="font-black text-brand-primary text-lg mb-2 uppercase tracking-tight">Faixas de Classificação</h3>
        <p className="text-sm text-brand-muted mb-6 font-medium">
          Configure os intervalos de score para cada nível. As faixas não podem se sobrepor.
        </p>
        <div className="space-y-4">
          {localConfig.levels.map((level, idx) => (
            <div key={idx} className="bg-surface-subtle/40 rounded-2xl p-6 border border-surface-border group hover:border-brand-accent transition-all">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6 items-end">
                <div>
                  <label className="block text-[10px] font-black text-brand-muted uppercase tracking-widest mb-2 ml-1">Nome do Nível</label>
                  <input
                    type="text"
                    value={level.label}
                    onChange={e => updateLevel(idx, 'label', e.target.value)}
                    className="w-full bg-surface-card border border-surface-border rounded-xl py-3 px-4 text-sm font-black text-brand-primary focus:border-brand-accent focus:outline-none shadow-sm transition-all"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-brand-muted uppercase tracking-widest mb-2 ml-1">Score Min (%)</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={level.minScore}
                    onChange={e => updateLevel(idx, 'minScore', e.target.value)}
                    className="w-full bg-surface-card border border-surface-border rounded-xl py-3 px-4 text-sm font-black text-brand-primary focus:border-brand-accent focus:outline-none shadow-sm transition-all"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-brand-muted uppercase tracking-widest mb-2 ml-1">Score Max (%)</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={level.maxScore}
                    onChange={e => updateLevel(idx, 'maxScore', e.target.value)}
                    className="w-full bg-surface-card border border-surface-border rounded-xl py-3 px-4 text-sm font-black text-brand-primary focus:border-brand-accent focus:outline-none shadow-sm transition-all"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-brand-muted uppercase tracking-widest mb-2 ml-1">Cor de Destaque</label>
                  <select
                    value={level.color + '||' + level.bgColor}
                    onChange={e => {
                      const parts = e.target.value.split('||');
                      const color = parts[0];
                      const bgColor = parts[1];
                      const newLevels = [...localConfig.levels];
                      newLevels[idx] = { ...newLevels[idx], color, bgColor };
                      setLocalConfig(c => ({ ...c, levels: newLevels }));
                    }}
                    className="w-full bg-surface-card border border-surface-border rounded-xl py-3 px-4 text-sm font-black text-brand-primary focus:border-brand-accent focus:outline-none shadow-sm transition-all"
                  >
                    {COLORS.map(c => (
                      <option key={c.label} value={c.color + '||' + c.bgColor}>{c.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="mt-4 flex items-center gap-3">
                <span className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest ${level.bgColor} ${level.color}`}>
                  <div className={`w-1.5 h-1.5 rounded-full ${level.color.replace('text', 'bg')}`} />
                  {level.label}: {level.minScore}% - {level.maxScore}%
                </span>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-8 p-6 bg-surface-subtle rounded-3xl border border-surface-border/50">
          <p className="font-black text-brand-primary text-xs mb-2 uppercase tracking-widest">Regras de Validação</p>
          <ul className="space-y-1.5 text-xs text-brand-muted font-medium">
            <li className="flex items-center gap-2"><div className="w-1 h-1 rounded-full bg-brand-accent" /> As faixas de score não podem se sobrepor</li>
            <li className="flex items-center gap-2"><div className="w-1 h-1 rounded-full bg-brand-accent" /> Recomenda-se cobrir o intervalo de 0% a 100%</li>
            <li className="flex items-center gap-2"><div className="w-1 h-1 rounded-full bg-brand-accent" /> As alterações são aplicadas imediatamente após salvar</li>
          </ul>
        </div>
      </div>

      <div className="flex justify-end pt-4 pb-10">
        <button
          onClick={handleSave}
          disabled={saving}
          className="bg-brand-primary text-brand-on-primary px-12 py-4 rounded-2xl font-black uppercase tracking-widest shadow-premium hover:opacity-90 disabled:opacity-50 transition-all flex items-center gap-3 active:scale-[0.98]"
        >
          {saving ? <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" /> : <Save className="w-4 h-4" />}
          {saving ? 'Salvando...' : 'Salvar Alterações'}
        </button>
      </div>
    </motion.div>
  );
}
