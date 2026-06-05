import React, { useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import Card from '../../ui/Card';
import { AlertOctagon } from 'lucide-react';
import { Monitoria, EvaluationForm } from '../../../types';
import { chartPalette } from '../chartColors';
import { useQualityConfig } from '../../../lib/useQualityConfig';
import { useDashboard } from '../DashboardContext';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';

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

  let dashboardContext = null;
  try {
    dashboardContext = useDashboard();
  } catch (e) {}
  const user = dashboardContext?.user;
  const canEdit = isCustomizing;

  const myUniqueId = `chart-${title}`;
  const isEditing = activeEditingId !== undefined
    ? activeEditingId === myUniqueId
    : dashboardContext?.activeEditingId === myUniqueId;

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
      dashboardContext?.setActiveEditingId(myUniqueId);
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
        dashboardContext?.setActiveEditingId(null);
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
      dashboardContext?.setActiveEditingId(null);
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

    return Object.values(map)
      .filter(o => o.naoCount > 0)
      .sort((a, b) => b.naoCount - a.naoCount)
      .slice(0, limit)
      .map(o => ({
        text: o.text.length > 32 ? o.text.slice(0, 30) + '…' : o.text,
        fullText: o.text,
        naoCount: o.naoCount,
        taxaFalha: o.totalAnswered > 0 ? Math.round((o.naoCount / o.totalAnswered) * 10000) / 100 : 0,
      }));
  }, [monitorias, forms, limit]);

  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    return (
      <div className="bg-brand-primary text-brand-on-primary px-4 py-3 rounded-2xl shadow-xl text-xs max-w-[260px]">
        <p className="font-black mb-1">{d.fullText}</p>
        <p className="text-functional-warning font-bold">{d.naoCount} ocorrência{d.naoCount !== 1 ? 's' : ''} de "NÃO"</p>
        <p className="opacity-80 font-semibold">Taxa de falha: {d.taxaFalha.toFixed(1)}%</p>
      </div>
    );
  };

  const Header = () => (
    <>
      {isEditing ? (
        <div className="flex flex-col gap-2 mb-5 animate-fade-in" onClick={(e) => e.stopPropagation()}>
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
            className={`relative w-9 h-9 rounded-xl bg-functional-error flex items-center justify-center flex-shrink-0 text-functional-error ${
              canEdit ? 'cursor-pointer hover:ring-2 hover:ring-brand-accent/50 transition-all' : 'cursor-help'
            }`}
            title=""
          >
            <AlertOctagon className="w-5 h-5 fill-current fill-opacity-15" strokeWidth={2} fill="currentColor" fillOpacity={0.15} />
            <AnimatePresence>
              {isHovered && customSub && (
                <motion.div
                  initial={{ opacity: 0, y: -8, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -8, scale: 0.95 }}
                  transition={{ duration: 0.12, ease: 'easeOut' }}
                  className="absolute top-full left-0 mt-2 z-50 whitespace-nowrap bg-slate-900 text-white dark:bg-slate-50 dark:text-slate-900 text-[10px] font-semibold px-2.5 py-1.5 rounded-lg shadow-xl shadow-slate-900/10 border border-slate-800/10 dark:border-slate-200/10 pointer-events-none"
                >
                  {customSub}{canEdit ? " (Clique para editar)" : ""}
                  {/* Subtle upward pointing arrow */}
                  <div className="absolute -top-1 left-4 w-2 h-2 bg-slate-900 dark:bg-slate-50 rotate-45" />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-black text-brand-primary uppercase tracking-widest leading-tight truncate" title="">{title}</h3>
          </div>
        </div>
      )}
    </>
  );

  if (ofensores.length === 0) {
    return (
      <Card padding="lg" className="h-full flex flex-col">
        <Header />
        <div className="flex-1 flex items-center justify-center py-10 opacity-40">
          <p className="text-[10px] font-black uppercase tracking-widest text-brand-muted">Sem dados de falha no período</p>
        </div>
      </Card>
    );
  }

  return (
    <Card padding="lg" className="h-full flex flex-col overflow-hidden">
      <Header />

      <div className="flex-1 min-h-0" style={{ minWidth: 0, minHeight: 150 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={ofensores}
            layout="vertical"
            margin={{ top: 10, right: 40, left: 0, bottom: 25 }}
            barCategoryGap="20%"
          >
            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--surface-border)" />
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
              width={130}
              tick={{ fontSize: 9, fontWeight: 700, fill: 'var(--brand-primary)' }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip content={<CustomTooltip />} cursor={false} />
      <Bar dataKey="naoCount" radius={[0, 4, 4, 0]} maxBarSize={14}>
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
      <div className="mt-4 pt-3 border-t border-surface-border/60 space-y-1.5">
        {ofensores.slice(0, 3).map((o, i) => (
          <div key={i} className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0 flex-1">
          <span className="text-[9px] font-black text-functional-error bg-functional-error rounded px-1.5 py-0.5 flex-shrink-0">#{i + 1}</span>
          <span className="text-[9px] font-bold text-brand-primary truncate">{o.fullText}</span>
        </div>
        <span className="text-[9px] font-black text-functional-error flex-shrink-0">{o.taxaFalha.toFixed(1)}% falha</span>
          </div>
        ))}
      </div>
    </Card>
  );
}
