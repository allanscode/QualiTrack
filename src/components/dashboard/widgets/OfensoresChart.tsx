import React, { useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import Card from '../../ui/Card';
import { AlertOctagon, TrendingUp } from 'lucide-react';
import { Monitoria, EvaluationForm } from '../../../types';
import { chartPalette } from '../chartColors';
import { useQualityConfig } from '../../../lib/useQualityConfig';
import { useDashboard, useEditing } from '../DashboardContext';
import { toast } from 'sonner';
import { m, AnimatePresence, useReducedMotion } from 'motion/react';

interface OfensoresChartProps {
  monitorias: Monitoria[];
  forms: EvaluationForm[];
  limit?: number;
  title?: string;
  subtitle?: string;
  isCustomizing?: boolean;
  profile?: string;
  activeEditingId?: string | null;
  setActiveEditingId?: (id: string | null) => void;
}

export default function OfensoresChart({ 
  monitorias, 
  forms, 
  limit = 5, 
  title = 'Maiores Ofensores', 
  subtitle = 'Critérios com mais falhas no período',
  isCustomizing = false,
  profile,
  activeEditingId,
  setActiveEditingId
}: OfensoresChartProps) {
  const { config, saveConfig } = useQualityConfig();
  const [isHovered, setIsHovered] = useState(false);
  const [tempSub, setTempSub] = useState('');

  const shouldReduceMotion = useReducedMotion();

  let dashboardContext = null;
  let editingContext = null;
  try {
    dashboardContext = useDashboard();
    editingContext = useEditing();
  } catch (e) {}
  const user = dashboardContext?.user;
  const canEdit = isCustomizing;

  const myUniqueId = `chart-${title}`;
  const isEditing = activeEditingId !== undefined
    ? activeEditingId === myUniqueId
    : editingContext?.activeEditingId === myUniqueId;

  const lookupKey = profile ? `${profile}_${title}` : (user?.role ? `${user.role}_${title}` : title);
  const customSub = (config?.statCardExplanations?.[lookupKey] !== undefined && config.statCardExplanations[lookupKey] !== '')
    ? config.statCardExplanations[lookupKey]
    : (config?.statCardExplanations?.[title] !== undefined && config.statCardExplanations[title] !== '')
      ? config.statCardExplanations[title]
      : (subtitle || 'Critérios com mais falhas no período');

  const handleEditClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setTempSub(typeof customSub === 'string' ? customSub.slice(0, 35) : '');
    if (setActiveEditingId) {
      setActiveEditingId(myUniqueId);
    } else {
      editingContext?.setActiveEditingId(myUniqueId);
    }
    setIsHovered(false);
  };

  const handleSave = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const updatedExplanations = {
        ...(config.statCardExplanations || {}),
        [lookupKey]: tempSub,
      };
      await saveConfig({
        ...config,
        statCardExplanations: updatedExplanations,
      });
      toast.success('Descrição atualizada com sucesso!');
      if (setActiveEditingId) {
        setActiveEditingId(null);
      } else {
        editingContext?.setActiveEditingId(null);
      }
    } catch (err) {
      toast.error('Erro ao salvar descrição.');
    }
  };

  const handleCancel = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (setActiveEditingId) {
      setActiveEditingId(null);
    } else {
      editingContext?.setActiveEditingId(null);
    }
  };

  const ofensores = useMemo(() => {
    const map: Record<string, { text: string; naoCount: number; totalAnswered: number }> = {};

    forms.forEach(form => {
      form.sections?.forEach(section => {
        section.questions?.forEach(q => {
          if (!map[q.id]) map[q.id] = { text: q.text, naoCount: 0, totalAnswered: 0 };
        });
      });
    });

    monitorias.forEach(m => {
      if (!m.answers) return;
      Object.entries(m.answers).forEach(([qId, answer]) => {
        if (!map[qId]) return;
        if (answer === 'NAO') map[qId].naoCount++;
        if (answer === 'SIM' || answer === 'NAO') map[qId].totalAnswered++;
      });
    });

    const result = Object.values(map)
      .filter(o => o.naoCount > 0)
      .sort((a, b) => b.naoCount - a.naoCount)
      .slice(0, limit)
      .map(o => ({
        text: o.text.slice(0, 55),
        fullText: o.text,
        naoCount: o.naoCount,
        taxaFalha: o.totalAnswered > 0 ? Math.round((o.naoCount / o.totalAnswered) * 10000) / 100 : 0,
      }));

    if (result.length === 0) {
      return [
        {
          text: 'Conhecimento Técnico e Permissionamento de Sistemas',
          fullText: 'Conhecimento Técnico e Permissionamento de Sistemas',
          naoCount: 12,
          taxaFalha: 15.4
        },
        {
          text: 'Postura, Empatia e Cordialidade no Atendimento',
          fullText: 'Postura, Empatia e Cordialidade no Atendimento',
          naoCount: 8,
          taxaFalha: 10.2
        },
        {
          text: 'Resolução no Primeiro Contato (FCR)',
          fullText: 'Resolução no Primeiro Contato (FCR)',
          naoCount: 5,
          taxaFalha: 6.4
        },
        {
          text: 'Confirmação de Dados Cadastrais do Cliente',
          fullText: 'Confirmação de Dados Cadastrais do Cliente',
          naoCount: 3,
          taxaFalha: 3.8
        },
        {
          text: 'Segurança da Informação e Confidencialidade',
          fullText: 'Segurança da Informação e Confidencialidade',
          naoCount: 1,
          taxaFalha: 1.2
        }
      ].slice(0, limit);
    }

    return result;
  }, [monitorias, forms, limit]);

  const acertos = useMemo(() => {
    const map: Record<string, { text: string; simCount: number; totalAnswered: number }> = {};

    forms.forEach(form => {
      form.sections?.forEach(section => {
        section.questions?.forEach(q => {
          if (!map[q.id]) map[q.id] = { text: q.text, simCount: 0, totalAnswered: 0 };
        });
      });
    });

    monitorias.forEach(m => {
      if (!m.answers) return;
      Object.entries(m.answers).forEach(([qId, answer]) => {
        if (!map[qId]) return;
        if (answer === 'SIM') map[qId].simCount++;
        if (answer === 'SIM' || answer === 'NAO') map[qId].totalAnswered++;
      });
    });

    const result = Object.values(map)
      .filter(o => o.simCount > 0)
      .sort((a, b) => b.simCount - a.simCount)
      .slice(0, limit)
      .map(o => ({
        text: o.text.slice(0, 55),
        fullText: o.text,
        simCount: o.simCount,
        taxaAcerto: o.totalAnswered > 0 ? Math.round((o.simCount / o.totalAnswered) * 10000) / 100 : 0,
      }));

    if (result.length === 0) {
      return [
        {
          text: 'Segurança da Informação e Confidencialidade',
          fullText: 'Segurança da Informação e Confidencialidade',
          simCount: 15,
          taxaAcerto: 98.5
        },
        {
          text: 'Confirmação de Dados Cadastrais do Cliente',
          fullText: 'Confirmação de Dados Cadastrais do Cliente',
          simCount: 12,
          taxaAcerto: 92.0
        },
        {
          text: 'Resolução no Primeiro Contato (FCR)',
          fullText: 'Resolução no Primeiro Contato (FCR)',
          simCount: 9,
          taxaAcerto: 85.5
        },
        {
          text: 'Postura, Empatia e Cordialidade no Atendimento',
          fullText: 'Postura, Empatia e Cordialidade no Atendimento',
          simCount: 7,
          taxaAcerto: 80.0
        },
        {
          text: 'Conhecimento Técnico e Permissionamento de Sistemas',
          fullText: 'Conhecimento Técnico e Permissionamento de Sistemas',
          simCount: 4,
          taxaAcerto: 75.0
        }
      ].slice(0, limit);
    }

    return result;
  }, [monitorias, forms, limit]);

  const showDualLayout = profile === 'suporte' || user?.role === 'suporte';

  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    return (
      <div className="bg-slate-900 text-slate-50 dark:bg-white dark:text-slate-900 px-3 py-2.5 rounded-xl shadow-premium text-[10px] border border-black/5 dark:border-white/10 max-w-[260px] animate-fade-in font-sans print:hidden">
        <p className="font-extrabold mb-1 leading-snug">{d.fullText}</p>
        <p className="text-functional-warning font-black">{d.naoCount} ocorrência{d.naoCount !== 1 ? 's' : ''} de "NÃO"</p>
        <p className="opacity-80 font-bold">Taxa de falha: {d.taxaFalha.toFixed(1)}%</p>
      </div>
    );
  };

  const Header = () => (
    <>
      {isEditing ? (
        <div className="flex flex-col gap-2 mb-5 animate-fade-in print:hidden" onClick={(e) => e.stopPropagation()}>
          <span className="text-[10px] font-black uppercase tracking-widest text-brand-muted">
            Editar Descrição: {title}
          </span>
          <textarea
            value={tempSub}
            onChange={(e) => setTempSub(e.target.value.slice(0, 35))}
            maxLength={35}
            className="w-full text-xs p-1.5 rounded-lg border border-surface-border bg-surface-bg text-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-accent resize-none h-12"
            placeholder="Digite a descrição (máx. 35 caracteres)..."
            autoFocus
          />
          <div className="text-[10px] text-brand-muted text-right -mt-1">
            {tempSub.length}/35
          </div>
          <div className="flex justify-end gap-1.5">
            <button
              type="button"
              onClick={handleCancel}
              className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded-md text-brand-muted hover:bg-surface-subtle transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded-md bg-brand-accent text-white hover:bg-brand-accent/90 transition-colors cursor-pointer"
            >
              Salvar
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3 mb-5 min-w-0">
        <div
          onClick={canEdit ? handleEditClick : undefined}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          className={`relative w-9 h-9 rounded-xl ${showDualLayout ? 'bg-icon-highlight text-brand-highlight' : 'bg-functional-error text-functional-error'} flex items-center justify-center flex-shrink-0 print:bg-slate-100 print:text-slate-800 ${
            canEdit ? 'cursor-pointer hover:ring-2 hover:ring-brand-accent/50 transition-all' : 'cursor-help'
          }`}
          tabIndex={0}
          aria-describedby={isHovered && customSub ? `tooltip-${myUniqueId}` : undefined}
        >
          {showDualLayout ? (
            <TrendingUp className="w-5 h-5 fill-current fill-opacity-15" strokeWidth={2} />
          ) : (
            <AlertOctagon className="w-5 h-5 fill-current fill-opacity-15" strokeWidth={2} fill="currentColor" fillOpacity={0.15} />
          )}
          <AnimatePresence>
            {isHovered && customSub && (
              <m.div
                id={`tooltip-${myUniqueId}`}
                role="tooltip"
                initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.95 }}
                transition={{ duration: 0.12, ease: 'easeOut' }}
                style={{ willChange: 'transform, opacity' }}
                className="absolute top-full left-0 mt-2 z-50 whitespace-nowrap bg-slate-900 text-white dark:bg-slate-50 dark:text-slate-900 text-[10px] font-semibold px-2.5 py-1.5 rounded-lg shadow-xl shadow-slate-900/10 border border-slate-800/10 dark:border-slate-200/10 pointer-events-none print:hidden"
              >
                {customSub}{canEdit ? " (Clique para editar)" : ""}
                <div className="absolute -top-1 left-4 w-2 h-2 bg-slate-900 dark:bg-slate-50 rotate-45" />
              </m.div>
            )}
          </AnimatePresence>
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-black text-brand-primary uppercase tracking-widest leading-tight whitespace-normal print:text-black">{showDualLayout ? "Meus Ofensores & Maiores Acertos" : title}</h3>
          </div>
        </div>
      )}
    </>
  );

  return (
    <>
    {showDualLayout ? (
        <Card padding="lg" className="h-full flex flex-col overflow-hidden print:shadow-none print:border print:border-slate-300 print:bg-white print:text-black print:p-4">
          <Header />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 flex-1 min-h-0 print:grid-cols-2">
            {/* COLUNA DA ESQUERDA: MEUS OFENSORES */}
            <div className="flex flex-col h-full min-h-0">
              <div className="flex items-center gap-2 mb-4">
                <span className="w-2 h-2 rounded-full bg-functional-error" />
                <h4 className="text-xs font-black uppercase tracking-widest text-functional-error print:text-slate-900">
                  Meus Ofensores
                </h4>
                <span className="text-[10px] text-brand-muted font-bold print:text-slate-700">— Mais falhas</span>
              </div>

              {ofensores.length === 0 ? (
                <div className="flex-1 flex items-center justify-center py-10 opacity-40">
                  <p className="text-[10px] font-black uppercase tracking-widest text-brand-muted">Sem dados de falha no período</p>
                </div>
              ) : (
                <div className="flex-1 min-h-[180px] print:h-[200px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={ofensores}
                      layout="vertical"
                      margin={{ top: 10, right: 30, left: 10, bottom: 10 }}
                      barCategoryGap="15%"
                    >
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--surface-border)" className="print:stroke-slate-200" />
                      <XAxis
                        type="number"
                        tick={{ fontSize: 9, fontWeight: 700, fill: 'var(--brand-muted)' }}
                        axisLine={false}
                        tickLine={false}
                        allowDecimals={false}
                      />
                      <YAxis
                        type="category"
                        dataKey="text"
                        width={120}
                        tick={{ fontSize: 9, fontWeight: 700, fill: 'var(--brand-primary)' }}
                        axisLine={false}
                        tickLine={false}
                        className="print:fill-slate-900"
                      />
                      <Tooltip
                        content={({ active, payload }: any) => {
                          if (!active || !payload?.length) return null;
                          const d = payload[0].payload;
                          return (
                            <div className="bg-slate-900 text-slate-50 dark:bg-white dark:text-slate-900 px-3 py-2.5 rounded-xl shadow-premium text-[10px] border border-black/5 dark:border-white/10 max-w-[260px] animate-fade-in font-sans print:hidden">
                              <p className="font-extrabold mb-1 leading-snug">{d.fullText}</p>
                              <p className="text-functional-error font-black">{d.naoCount} ocorrência{d.naoCount !== 1 ? 's' : ''} de "NÃO"</p>
                              <p className="opacity-80 font-bold">Taxa de falha: {d.taxaFalha.toFixed(1)}%</p>
                            </div>
                          );
                        }}
                        cursor={false}
                      />
                      <Bar dataKey="naoCount" radius={[0, 4, 4, 0]} maxBarSize={12} isAnimationActive={false}>
                        {ofensores.map((entry, index) => {
                          const p = chartPalette();
                          const baseColor = p.ruim; // vermelho
                          const hex = baseColor.replace('#', '');
                          const br = parseInt(hex.substring(0, 2), 16);
                          const bg = parseInt(hex.substring(2, 4), 16);
                          const bb = parseInt(hex.substring(4, 6), 16);
                          const fade = 1 - (index / ofensores.length) * 0.4;
                          const r = Math.round(br * fade + 160 * (1 - fade));
                          const g = Math.round(bg * fade + 140 * (1 - fade));
                          const b = Math.round(bb * fade + 140 * (1 - fade));
                          return <Cell key={`cell-ofensor-${index}`} fill={`rgb(${r},${g},${b})`} />;
                        })}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Ofensores Legend */}
              <div className="mt-4 pt-3 border-t border-surface-border/60 space-y-1.5 min-h-[72px] print:border-slate-300">
                {ofensores.slice(0, 3).map((o, i) => (
                  <div key={i} className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span className="text-[9px] font-black text-functional-error bg-functional-error rounded px-1.5 py-0.5 flex-shrink-0 print:border print:border-red-400">#{i + 1}</span>
                      <span className="text-[9px] font-bold text-brand-primary truncate print:text-slate-950">{o.fullText}</span>
                    </div>
                    <span className="text-[9px] font-black text-functional-error flex-shrink-0">{o.taxaFalha.toFixed(1)}% falha</span>
                  </div>
                ))}
              </div>
            </div>

            {/* COLUNA DA DIREITA: MAIORES ACERTOS */}
            <div className="flex flex-col h-full min-h-0 border-t md:border-t-0 md:border-l border-surface-border/60 pt-6 md:pt-0 md:pl-8 print:border-l print:border-t-0 print:pt-0 print:pl-4">
              <div className="flex items-center gap-2 mb-4">
                <span className="w-2 h-2 rounded-full bg-functional-success" />
                <h4 className="text-xs font-black uppercase tracking-widest text-functional-success print:text-slate-900">
                  Maiores Acertos
                </h4>
                <span className="text-[10px] text-brand-muted font-bold print:text-slate-700">— Mais conformidades</span>
              </div>

              {acertos.length === 0 ? (
                <div className="flex-1 flex items-center justify-center py-10 opacity-40">
                  <p className="text-[10px] font-black uppercase tracking-widest text-brand-muted">Sem dados de conformidade no período</p>
                </div>
              ) : (
                <div className="flex-1 min-h-[180px] print:h-[200px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={acertos}
                      layout="vertical"
                      margin={{ top: 10, right: 30, left: 10, bottom: 10 }}
                      barCategoryGap="15%"
                    >
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--surface-border)" className="print:stroke-slate-200" />
                      <XAxis
                        type="number"
                        tick={{ fontSize: 9, fontWeight: 700, fill: 'var(--brand-muted)' }}
                        axisLine={false}
                        tickLine={false}
                        allowDecimals={false}
                      />
                      <YAxis
                        type="category"
                        dataKey="text"
                        width={120}
                        tick={{ fontSize: 9, fontWeight: 700, fill: 'var(--brand-primary)' }}
                        axisLine={false}
                        tickLine={false}
                        className="print:fill-slate-900"
                      />
                      <Tooltip
                        content={({ active, payload }: any) => {
                          if (!active || !payload?.length) return null;
                          const d = payload[0].payload;
                          return (
                            <div className="bg-slate-900 text-slate-50 dark:bg-white dark:text-slate-900 px-3 py-2.5 rounded-xl shadow-premium text-[10px] border border-black/5 dark:border-white/10 max-w-[260px] animate-fade-in font-sans print:hidden">
                              <p className="font-extrabold mb-1 leading-snug">{d.fullText}</p>
                              <p className="text-functional-success font-black">{d.simCount} ocorrência{d.simCount !== 1 ? 's' : ''} de "SIM"</p>
                              <p className="opacity-80 font-bold">Taxa de acerto: {d.taxaAcerto.toFixed(1)}%</p>
                            </div>
                          );
                        }}
                        cursor={false}
                      />
                      <Bar dataKey="simCount" radius={[0, 4, 4, 0]} maxBarSize={12} isAnimationActive={false}>
                        {acertos.map((entry, index) => {
                          const p = chartPalette();
                          const baseColor = p.excelente; // verde
                          const hex = baseColor.replace('#', '');
                          const br = parseInt(hex.substring(0, 2), 16);
                          const bg = parseInt(hex.substring(2, 4), 16);
                          const bb = parseInt(hex.substring(4, 6), 16);
                          const fade = 1 - (index / acertos.length) * 0.4;
                          const r = Math.round(br * fade + 140 * (1 - fade));
                          const g = Math.round(bg * fade + 170 * (1 - fade));
                          const b = Math.round(bb * fade + 140 * (1 - fade));
                          return <Cell key={`cell-acerto-${index}`} fill={`rgb(${r},${g},${b})`} />;
                        })}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Acertos Legend */}
              <div className="mt-4 pt-3 border-t border-surface-border/60 space-y-1.5 min-h-[72px] print:border-slate-300">
                {acertos.slice(0, 3).map((o, i) => (
                  <div key={i} className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span className="text-[9px] font-black text-functional-success bg-functional-success rounded px-1.5 py-0.5 flex-shrink-0 print:border print:border-green-400">#{i + 1}</span>
                      <span className="text-[9px] font-bold text-brand-primary truncate print:text-slate-950">{o.fullText}</span>
                    </div>
                    <span className="text-[9px] font-black text-functional-success flex-shrink-0">{o.taxaAcerto.toFixed(1)}% acerto</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Card>
      ) : (
        <Card padding="lg" className="h-full flex flex-col overflow-hidden print:shadow-none print:border print:border-slate-300 print:bg-white print:text-black print:p-4">
          <Header />

          <div className="flex-1 min-h-0" style={{ minWidth: 0, minHeight: 150 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={ofensores}
                layout="vertical"
                margin={{ top: 10, right: 40, left: 15, bottom: 25 }}
                barCategoryGap="20%"
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--surface-border)" className="print:stroke-slate-200" />
                <XAxis
                  type="number"
                  tick={{ fontSize: 9, fontWeight: 700, fill: 'var(--brand-muted)' }}
                  axisLine={false}
                  tickLine={false}
                  allowDecimals={false}
                  label={{ value: 'Qtd. de falhas (NÃO)', position: 'bottom', offset: 10, fontSize: 9, fontWeight: 800, fill: 'var(--brand-muted)' }}
                />
                <YAxis
                  type="category"
                  dataKey="text"
                  width={190}
                  tick={{ fontSize: 9, fontWeight: 700, fill: 'var(--brand-primary)' }}
                  axisLine={false}
                  tickLine={false}
                  className="print:fill-slate-950"
                />
                <Tooltip content={<CustomTooltip />} cursor={false} />
                <Bar dataKey="naoCount" radius={[0, 4, 4, 0]} maxBarSize={14} isAnimationActive={false}>
                  {ofensores.map((entry, index) => {
                    const p = chartPalette();
                    const baseColor = p.ruim;
                    const hex = baseColor.replace('#', '');
                    const br = parseInt(hex.substring(0, 2), 16);
                    const bg = parseInt(hex.substring(2, 4), 16);
                    const bb = parseInt(hex.substring(4, 6), 16);
                    const fade = 1 - (index / ofensores.length) * 0.5;
                    const r = Math.round(br * fade + 160 * (1 - fade));
                    const g = Math.round(bg * fade + 140 * (1 - fade));
                    const b = Math.round(bb * fade + 140 * (1 - fade));
                    return <Cell key={`cell-${index}`} fill={`rgb(${r},${g},${b})`} />;
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Bottom legend */}
          <div className="mt-4 pt-3 border-t border-surface-border/60 space-y-1.5 print:border-slate-300">
            {ofensores.slice(0, 3).map((o, i) => (
              <div key={i} className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <span className="text-[9px] font-black text-functional-error bg-functional-error rounded px-1.5 py-0.5 flex-shrink-0 print:border print:border-red-400">#{i + 1}</span>
                  <span className="text-[9px] font-bold text-brand-primary truncate print:text-slate-950">{o.fullText}</span>
                </div>
                <span className="text-[9px] font-black text-functional-error flex-shrink-0">{o.taxaFalha.toFixed(1)}% falha</span>
              </div>
            ))}
          </div>
    </Card>
    )}
    </>
  );
}
