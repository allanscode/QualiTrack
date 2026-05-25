import React, { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import Card from '../../ui/Card';
import { AlertOctagon } from 'lucide-react';
import { Monitoria, EvaluationForm } from '../../../types';

interface OfensoresChartProps {
  monitorias: Monitoria[];
  forms: EvaluationForm[];
  limit?: number;
  title?: string;
  subtitle?: string;
}

export default function OfensoresChart({ monitorias, forms, limit = 8, title = 'Maiores Ofensores', subtitle = 'Critérios com mais falhas no período' }: OfensoresChartProps) {
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
        <p className="text-warning font-bold">{d.naoCount} ocorrência{d.naoCount !== 1 ? 's' : ''} de "NÃO"</p>
        <p className="opacity-80 font-semibold">Taxa de falha: {d.taxaFalha.toFixed(1)}%</p>
      </div>
    );
  };

  const Header = () => (
    <div className="flex items-center gap-3 mb-5">
      <div className="w-9 h-9 rounded-xl bg-error/10 flex items-center justify-center flex-shrink-0">
        <AlertOctagon className="w-4 h-4 text-error" />
      </div>
      <div>
        <h3 className="text-sm font-black text-brand-primary uppercase tracking-widest leading-tight">{title}</h3>
        <p className="text-[10px] font-bold text-brand-muted uppercase tracking-wider mt-0.5">{subtitle}</p>
      </div>
    </div>
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
                const intensity = 1 - index / ofensores.length;
                const r = Math.round(239 * intensity + 180 * (1 - intensity));
                const g = Math.round(68 * intensity + 30 * (1 - intensity));
                const b = Math.round(68 * intensity + 30 * (1 - intensity));
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
              <span className="text-[9px] font-black text-error bg-error/10 rounded px-1.5 py-0.5 flex-shrink-0">#{i + 1}</span>
              <span className="text-[9px] font-bold text-brand-primary truncate">{o.fullText}</span>
            </div>
            <span className="text-[9px] font-black text-error flex-shrink-0">{o.taxaFalha.toFixed(1)}% falha</span>
          </div>
        ))}
      </div>
    </Card>
  );
}
