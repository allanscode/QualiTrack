import React, { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import Card from '../../ui/Card';
import { AlertOctagon } from 'lucide-react';
import { Monitoria, EvaluationForm } from '../../../types';

interface OfensoresChartProps {
  monitorias: Monitoria[];
  forms: EvaluationForm[];
  limit?: number;
}

export default function OfensoresChart({ monitorias, forms, limit = 8 }: OfensoresChartProps) {
  // Build a map: questionId -> { text, naoCount, totalCount }
  const ofensores = useMemo(() => {
    const map: Record<string, { text: string; naoCount: number; totalAnswered: number }> = {};

    // Index all questions from all forms
    forms.forEach(form => {
      form.sections?.forEach(section => {
        section.questions?.forEach(q => {
          if (!map[q.id]) map[q.id] = { text: q.text, naoCount: 0, totalAnswered: 0 };
        });
      });
    });

    // Tally NAO answers across all monitorias
    monitorias.forEach(m => {
      if (!m.answers) return;
      Object.entries(m.answers).forEach(([qId, answer]) => {
        if (!map[qId]) return; // question not found in any form
        if (answer === 'NAO') map[qId].naoCount++;
        if (answer === 'SIM' || answer === 'NAO') map[qId].totalAnswered++;
      });
    });

    return Object.values(map)
      .filter(o => o.naoCount > 0)
      .sort((a, b) => b.naoCount - a.naoCount)
      .slice(0, limit)
      .map(o => ({
        text: o.text.length > 30 ? o.text.slice(0, 28) + '…' : o.text,
        fullText: o.text,
        naoCount: o.naoCount,
        taxaFalha: o.totalAnswered > 0 ? Math.round((o.naoCount / o.totalAnswered) * 10000) / 100 : 0,
      }));
  }, [monitorias, forms, limit]);

  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    return (
      <div className="bg-[#2D3A3A] text-white px-4 py-3 rounded-2xl shadow-xl text-xs max-w-[260px]">
        <p className="font-black mb-1">{d.fullText}</p>
        <p className="text-amber-300 font-bold">{d.naoCount} ocorrência{d.naoCount !== 1 ? 's' : ''} de "NÃO"</p>
        <p className="text-gray-300">Taxa de falha: {d.taxaFalha.toFixed(2)}%</p>
      </div>
    );
  };

  if (ofensores.length === 0) {
    return (
      <Card padding="lg" className="h-full flex flex-col">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-2xl bg-red-50 flex items-center justify-center">
            <AlertOctagon className="w-5 h-5 text-error" />
          </div>
          <div>
            <h3 className="font-black text-brand-primary uppercase tracking-tight leading-tight">Maiores Ofensores</h3>
            <p className="text-[10px] font-bold text-brand-muted uppercase tracking-wider">Critérios com mais falhas</p>
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center py-10 opacity-40">
          <p className="text-xs font-bold uppercase tracking-widest text-brand-muted">Sem dados de falha no período</p>
        </div>
      </Card>
    );
  }

  return (
    <Card padding="lg" className="h-full flex flex-col overflow-hidden">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-2xl bg-red-50 flex items-center justify-center">
          <AlertOctagon className="w-5 h-5 text-error" />
        </div>
        <div>
          <h3 className="font-black text-brand-primary uppercase tracking-tight leading-tight">Maiores Ofensores</h3>
          <p className="text-[10px] font-bold text-brand-muted uppercase tracking-wider">Critérios com mais falhas no período</p>
        </div>
      </div>

      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={ofensores}
            layout="vertical"
            margin={{ top: 10, right: 40, left: 0, bottom: 25 }}
            barCategoryGap="20%"
          >
            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#F0F1E8" />
            <XAxis
              type="number"
              tick={{ fontSize: 9, fontWeight: 700, fill: '#7A7D71' }}
              axisLine={false}
              tickLine={false}
              allowDecimals={false}
              label={{ value: 'Qtd. de falhas (NÃO)', position: 'bottom', offset: 10, fontSize: 9, fontWeight: 800, fill: '#7A7D71' }}
            />
            <YAxis
              type="category"
              dataKey="text"
              width={130}
              tick={{ fontSize: 9, fontWeight: 700, fill: '#2D3A3A' }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(239,68,68,0.05)' }} />
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

      {/* Bottom legend — more compact */}
      <div className="mt-4 pt-3 border-t border-surface-subtle space-y-1">
        {ofensores.slice(0, 3).map((o, i) => (
          <div key={i} className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <span className="text-[9px] font-black text-error bg-red-50 rounded px-1 py-0.5 flex-shrink-0">#{i + 1}</span>
              <span className="text-[9px] font-bold text-brand-primary truncate">{o.fullText}</span>
            </div>
            <span className="text-[9px] font-black text-error flex-shrink-0">{o.taxaFalha.toFixed(1)}% falha</span>
          </div>
        ))}
      </div>
    </Card>
  );
}
