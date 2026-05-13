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
      toast.success('Configuracoes de qualidade salvas!');
    }
    
    setSaving(false);
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-[#2D3A3A]">Configuracao de Qualidade</h2>
        <p className="text-sm text-[#7A7D71] mt-1">
          Defina as faixas de classificacao e a meta de desempenho. Alteracoes afetam dashboards e rankings imediatamente.
        </p>
      </div>

      {/* Target Score */}
      <div className="bg-white rounded-3xl border border-[#E2E4D8] p-8 shadow-sm">
        <h3 className="font-bold text-[#2D3A3A] text-lg mb-2">Meta de Desempenho</h3>
        <p className="text-sm text-[#7A7D71] mb-6">
          Score minimo para o suporte ser considerado dentro da meta. Usado nos rankings Top, Medianos e Oportunidades.
        </p>
        <div className="flex items-center gap-6 flex-wrap">
          <div className="flex-1 max-w-xs">
            <label className="block text-xs font-bold text-[#7A7D71] uppercase tracking-wide mb-2">Score minimo (%)</label>
            <input
              type="number"
              min={0}
              max={100}
              value={localConfig.targetScore}
              onChange={e => setLocalConfig(c => ({ ...c, targetScore: Number(e.target.value) }))}
              className="w-full bg-[#F9F9F6] border border-[#E2E4D8] rounded-2xl py-3 px-4 text-lg font-bold focus:border-[#A7C0A5] focus:outline-none"
            />
          </div>
          <div className={`px-6 py-4 rounded-2xl border-2 ${localConfig.targetScore >= 75 ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-amber-50 border-amber-200 text-amber-700'}`}>
            <p className="text-xs font-bold uppercase tracking-wide mb-1">Meta atual</p>
            <p className="text-3xl font-black">{localConfig.targetScore}%</p>
          </div>
        </div>
      </div>

      {/* SLA Configuration */}
      <div className="bg-white rounded-3xl border border-[#E2E4D8] p-8 shadow-sm">
        <h3 className="font-bold text-[#2D3A3A] text-lg mb-2">Prazos de Atendimento (SLA)</h3>
        <p className="text-sm text-[#7A7D71] mb-6">
          Configure o tempo limite (em horas úteis) para cada ação no fluxo da monitoria.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div>
            <label className="block text-xs font-bold text-[#7A7D71] uppercase tracking-wide mb-2">Ciência do Suporte</label>
            <div className="relative">
              <input
                type="number"
                min={1}
                value={localConfig.sla?.agentReview || 48}
                onChange={e => setLocalConfig(c => ({ ...c, sla: { ...c.sla, agentReview: Number(e.target.value) } }))}
                className="w-full bg-[#F9F9F6] border border-[#E2E4D8] rounded-2xl py-3 px-4 text-lg font-bold focus:border-[#A7C0A5] focus:outline-none pr-12"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-black text-brand-muted uppercase tracking-widest">h</span>
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-[#7A7D71] uppercase tracking-wide mb-2">Reanálise Qualidade</label>
            <div className="relative">
              <input
                type="number"
                min={1}
                value={localConfig.sla?.auditorReevaluation || 24}
                onChange={e => setLocalConfig(c => ({ ...c, sla: { ...c.sla, auditorReevaluation: Number(e.target.value) } }))}
                className="w-full bg-[#F9F9F6] border border-[#E2E4D8] rounded-2xl py-3 px-4 text-lg font-bold focus:border-[#A7C0A5] focus:outline-none pr-12"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-black text-brand-muted uppercase tracking-widest">h</span>
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-[#7A7D71] uppercase tracking-wide mb-2">Gestor Suporte</label>
            <div className="relative">
              <input
                type="number"
                min={1}
                value={localConfig.sla?.managerSupport || 24}
                onChange={e => setLocalConfig(c => ({ ...c, sla: { ...c.sla, managerSupport: Number(e.target.value) } }))}
                className="w-full bg-[#F9F9F6] border border-[#E2E4D8] rounded-2xl py-3 px-4 text-lg font-bold focus:border-[#A7C0A5] focus:outline-none pr-12"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-black text-brand-muted uppercase tracking-widest">h</span>
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-[#7A7D71] uppercase tracking-wide mb-2">Gestor Qualidade</label>
            <div className="relative">
              <input
                type="number"
                min={1}
                value={localConfig.sla?.managerQuality || 24}
                onChange={e => setLocalConfig(c => ({ ...c, sla: { ...c.sla, managerQuality: Number(e.target.value) } }))}
                className="w-full bg-[#F9F9F6] border border-[#E2E4D8] rounded-2xl py-3 px-4 text-lg font-bold focus:border-[#A7C0A5] focus:outline-none pr-12"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-black text-brand-muted uppercase tracking-widest">h</span>
            </div>
          </div>
        </div>
      </div>

      {/* Business Hours & Holidays Configuration */}
      <div className="bg-white rounded-3xl border border-[#E2E4D8] p-8 shadow-sm">
        <h3 className="font-bold text-[#2D3A3A] text-lg mb-2">Horário Comercial e Feriados</h3>
        <p className="text-sm text-[#7A7D71] mb-6">
          Defina o período de funcionamento para o cálculo preciso do SLA.
        </p>
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
          {/* Work Hours & Days */}
          <div className="space-y-8">
            <div className="grid grid-cols-2 gap-6">
              <div>
                <label className="block text-[10px] font-black text-brand-muted uppercase tracking-widest mb-2 flex items-center gap-2">
                  <Clock className="w-3 h-3" /> Início do Expediente
                </label>
                <input
                  type="time"
                  value={localConfig.businessHours?.start || '08:00'}
                  onChange={e => setLocalConfig(c => ({ ...c, businessHours: { ...c.businessHours, start: e.target.value } }))}
                  className="w-full bg-[#F9F9F6] border border-[#E2E4D8] rounded-2xl py-3 px-4 text-sm font-bold focus:border-brand-accent focus:outline-none transition-all"
                />
              </div>
              <div>
                <label className="block text-[10px] font-black text-brand-muted uppercase tracking-widest mb-2 flex items-center gap-2">
                  <Clock className="w-3 h-3" /> Fim do Expediente
                </label>
                <input
                  type="time"
                  value={localConfig.businessHours?.end || '17:00'}
                  onChange={e => setLocalConfig(c => ({ ...c, businessHours: { ...c.businessHours, end: e.target.value } }))}
                  className="w-full bg-[#F9F9F6] border border-[#E2E4D8] rounded-2xl py-3 px-4 text-sm font-bold focus:border-brand-accent focus:outline-none transition-all"
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-black text-brand-muted uppercase tracking-widest mb-4">Dias Úteis da Semana</label>
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
                      className={`px-4 py-2 rounded-xl text-xs font-bold transition-all border-2 flex items-center gap-2 ${
                        isSelected 
                          ? 'bg-brand-primary border-brand-primary text-white shadow-md' 
                          : 'bg-white border-surface-border text-brand-muted hover:border-brand-accent/40'
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

          {/* Holidays */}
          <div className="bg-[#F9F9F6] rounded-2xl p-6 border border-surface-border/50">
            <div className="flex items-center justify-between mb-4">
              <label className="text-[10px] font-black text-brand-muted uppercase tracking-widest flex items-center gap-2">
                <Calendar className="w-3 h-3" /> Feriados (DD/MM)
              </label>
              <div className="flex items-center gap-2">
                <input 
                  type="text" 
                  placeholder="Ex: 25/12"
                  id="new-holiday"
                  className="w-20 bg-white border border-surface-border rounded-lg px-2 py-1 text-xs font-bold focus:outline-none focus:border-brand-accent"
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
                  className="p-1.5 bg-brand-accent text-white rounded-lg hover:bg-opacity-90 transition-all"
                >
                  <Plus className="w-3 h-3" />
                </button>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 max-h-[160px] overflow-y-auto no-scrollbar content-start">
              {(localConfig.businessHours?.holidays || []).length > 0 ? (
                localConfig.businessHours?.holidays.map(h => (
                  <div key={h} className="group bg-white border border-surface-border rounded-xl pl-3 pr-1 py-1 flex items-center gap-2 shadow-sm hover:border-error/40 transition-all">
                    <span className="text-[11px] font-black text-brand-primary">{h}</span>
                    <button 
                      onClick={() => {
                        const newHolidays = localConfig.businessHours.holidays.filter((item: string) => item !== h);
                        setLocalConfig(c => ({ ...c, businessHours: { ...c.businessHours, holidays: newHolidays } }));
                      }}
                      className="p-1 text-brand-muted hover:text-error transition-colors"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))
              ) : (
                <div className="w-full py-4 text-center">
                  <p className="text-[10px] font-bold text-brand-muted uppercase opacity-40 italic">Nenhum feriado cadastrado</p>
                </div>
              )}
            </div>
            <p className="mt-4 text-[9px] text-brand-muted/70 font-medium">Use o formato DD/MM para feriados anuais recorrentes.</p>
          </div>
        </div>
      </div>

      {/* Quality Level Bands */}
      <div className="bg-white rounded-3xl border border-[#E2E4D8] p-8 shadow-sm">
        <h3 className="font-bold text-[#2D3A3A] text-lg mb-2">Faixas de Classificacao</h3>
        <p className="text-sm text-[#7A7D71] mb-6">
          Configure os intervalos de score para cada nivel. As faixas nao podem se sobrepor.
        </p>
        <div className="space-y-4">
          {localConfig.levels.map((level, idx) => (
            <div key={idx} className={`${level.bgColor} rounded-2xl p-5 border border-[#E2E4D8]`}>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 items-end">
                <div>
                  <label className="block text-xs font-bold text-[#7A7D71] uppercase tracking-wide mb-1">Nome</label>
                  <input
                    type="text"
                    value={level.label}
                    onChange={e => updateLevel(idx, 'label', e.target.value)}
                    className="w-full bg-white border border-[#E2E4D8] rounded-xl py-2.5 px-3 text-sm font-bold focus:border-[#A7C0A5] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#7A7D71] uppercase tracking-wide mb-1">Score min (%)</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={level.minScore}
                    onChange={e => updateLevel(idx, 'minScore', e.target.value)}
                    className="w-full bg-white border border-[#E2E4D8] rounded-xl py-2.5 px-3 text-sm font-bold focus:border-[#A7C0A5] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#7A7D71] uppercase tracking-wide mb-1">Score max (%)</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={level.maxScore}
                    onChange={e => updateLevel(idx, 'maxScore', e.target.value)}
                    className="w-full bg-white border border-[#E2E4D8] rounded-xl py-2.5 px-3 text-sm font-bold focus:border-[#A7C0A5] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#7A7D71] uppercase tracking-wide mb-1">Cor</label>
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
                    className="w-full bg-white border border-[#E2E4D8] rounded-xl py-2.5 px-3 text-sm font-bold focus:border-[#A7C0A5] focus:outline-none"
                  >
                    {COLORS.map(c => (
                      <option key={c.label} value={c.color + '||' + c.bgColor}>{c.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="mt-3">
                <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${level.bgColor} ${level.color}`}>
                  {level.label}: {level.minScore}% - {level.maxScore}%
                </span>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-6 p-4 bg-[#F9F9F6] rounded-2xl border border-[#E2E4D8]">
          <p className="font-bold text-[#2D3A3A] text-xs mb-1">Regras de validacao</p>
          <ul className="list-disc list-inside space-y-0.5 text-xs text-[#7A7D71]">
            <li>As faixas nao podem se sobrepor</li>
            <li>Recomenda-se cobrir o intervalo de 0% a 100%</li>
            <li>As alteracoes sao aplicadas imediatamente apos salvar</li>
          </ul>
        </div>
      </div>

      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="bg-[#2D3A3A] text-white px-8 py-3.5 rounded-2xl font-bold shadow-lg shadow-[#2D3A3A]/20 hover:bg-opacity-90 disabled:opacity-50 transition-all flex items-center gap-2"
        >
          <Save className="w-4 h-4" /> {saving ? 'Salvando...' : 'Salvar'}
        </button>
      </div>
    </motion.div>
  );
}
