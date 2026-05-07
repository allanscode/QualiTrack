import React, { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { TrendingUp, Users, ClipboardCheck, AlertTriangle, Award, Target } from 'lucide-react';
import { User, Monitoria } from '../types';
import { supabase, mockDb } from '../lib/supabase';

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  pendente_revisao:            { label: 'Aguardando Auditado',  color: 'text-amber-700',  bg: 'bg-amber-50' },
  em_contestacao:              { label: 'Em Reanálise',         color: 'text-orange-700', bg: 'bg-orange-50' },
  aguardando_gestor_suporte:   { label: 'Aguardando Gestor',    color: 'text-blue-700',   bg: 'bg-blue-50' },
  aguardando_gestor_qualidade: { label: 'Aguardando Qualidade', color: 'text-purple-700', bg: 'bg-purple-50' },
  concluida:                   { label: 'Finalizada',           color: 'text-emerald-700',bg: 'bg-emerald-50' },
  contestacao_aceita:          { label: 'Contestação Aceita',   color: 'text-emerald-600',bg: 'bg-emerald-50' },
  contestacao_negada:          { label: 'Contestação Negada',   color: 'text-red-600',    bg: 'bg-red-50' },
  finalizada_alterada:         { label: 'Finalizada Alterada',  color: 'text-cyan-600',   bg: 'bg-cyan-50' },
};

export default function Dashboard({ user }: { user: User | null }) {
  const [monitorias, setMonitorias] = useState<Monitoria[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        let docs: Monitoria[] = [];
        let userDocs: User[] = [];
        if (!supabase) {
          const res = await mockDb.get('monitorias');
          const uRes = await mockDb.get('users');
          docs = res.data || [];
          userDocs = uRes.data || [];
        } else {
          const [{ data: m }, { data: u }] = await Promise.all([
            supabase.from('monitorias').select('*').eq('active', true).order('created_at', { ascending: false }),
            supabase.from('users').select('*'),
          ]);
          docs = (m || []) as Monitoria[];
          userDocs = (u || []) as User[];
        }
        if (user?.role === 'suporte') docs = docs.filter(m => m.evaluated_id === user.id);
        else if (user?.role === 'qualidade') docs = docs.filter(m => m.evaluator_id === user.id);
        setMonitorias(docs);
        setAllUsers(userDocs);
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    };
    if (user) fetchData();
  }, [user]);

  const getName = (id: string) => allUsers.find(u => u.id === id)?.name || id;

  const completed = monitorias.filter(m => ['concluida','contestacao_aceita','contestacao_negada','finalizada_alterada'].includes(m.status));
  const count = completed.length;
  const avgScore = count > 0 ? (completed.reduce((a, m) => a + (m.score || 0), 0) / count) : 0;
  const criticalCount = completed.filter(m => (m.score || 0) < 75).length;
  const activeAgents = new Set(completed.map(m => m.evaluated_id)).size;
  const pendingCount = monitorias.filter(m => m.status === 'pendente_revisao').length;

  // Chart — last 7 days
  const chartData: any[] = [];
  const daysMap: Record<string, { total: number; count: number }> = {};
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const key = d.toISOString().split('T')[0];
    const label = d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit' });
    daysMap[key] = { total: 0, count: 0 };
    chartData.push({ name: label, fullDate: key, score: 0 });
  }
  completed.forEach(m => {
    const key = new Date(m.created_at).toISOString().split('T')[0];
    if (daysMap[key]) { daysMap[key].total += m.score || 0; daysMap[key].count++; }
  });
  chartData.forEach(cd => {
    const d = daysMap[cd.fullDate];
    if (d?.count > 0) cd.score = Math.round(d.total / d.count);
  });

  // Top agents
  const agentMap: Record<string, { total: number; count: number }> = {};
  completed.forEach(m => {
    const id = m.evaluated_id;
    if (!agentMap[id]) agentMap[id] = { total: 0, count: 0 };
    agentMap[id].total += m.score || 0;
    agentMap[id].count++;
  });
  const topAgents = Object.entries(agentMap)
    .map(([id, s]) => ({ id, name: getName(id), score: Math.round(s.total / s.count), count: s.count }))
    .sort((a, b) => b.score - a.score).slice(0, 5);

  if (loading) return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[1,2,3,4].map(i => <div key={i} className="h-28 bg-white rounded-3xl border border-[#E2E4D8] animate-pulse" />)}
      </div>
      <div className="h-72 bg-white rounded-3xl border border-[#E2E4D8] animate-pulse" />
    </div>
  );

  const scoreColor = avgScore >= 90 ? 'text-emerald-600' : avgScore >= 75 ? 'text-amber-600' : 'text-red-600';

  return (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Score Médio"
          value={`${avgScore.toFixed(1)}%`}
          sub={avgScore >= 75 ? 'Acima da meta' : 'Abaixo da meta'}
          good={avgScore >= 75}
          icon={<Target className="w-5 h-5" />}
          accent={scoreColor}
        />
        <StatCard
          title="Concluídas"
          value={count.toString()}
          sub="monitorias finalizadas"
          good={count > 0}
          icon={<ClipboardCheck className="w-5 h-5" />}
          accent="text-blue-600"
        />
        <StatCard
          title="Agentes Avaliados"
          value={activeAgents.toString()}
          sub="técnicos únicos"
          good={true}
          icon={<Users className="w-5 h-5" />}
          accent="text-violet-600"
        />
        <StatCard
          title="Alertas Críticos"
          value={criticalCount.toString()}
          sub={criticalCount === 0 ? 'Tudo em ordem' : 'score abaixo de 75%'}
          good={criticalCount === 0}
          icon={<AlertTriangle className="w-5 h-5" />}
          accent={criticalCount > 0 ? 'text-red-600' : 'text-emerald-600'}
        />
      </div>

      {/* Chart + Top Agents */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-3xl border border-[#E2E4D8] p-6 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="font-bold text-[#2D3A3A] text-lg">Score Médio — Últimos 7 dias</h3>
              <p className="text-xs text-[#7A7D71] mt-0.5">Média das monitorias concluídas por dia</p>
            </div>
            <div className="flex items-center gap-4 text-[10px] font-bold uppercase tracking-wider">
              <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-400 inline-block" />≥ 75%</div>
              <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-red-400 inline-block" />&lt; 75%</div>
            </div>
          </div>
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 4, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F0F1E8" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#7A7D71', fontWeight: 600 }} dy={8} />
                <YAxis domain={[0, 100]} axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#7A7D71', fontWeight: 600 }} />
                <Tooltip
                  cursor={{ fill: '#F9F9F6', radius: 8 }}
                  contentStyle={{ backgroundColor: '#2D3A3A', border: 'none', borderRadius: '12px', color: '#fff', fontSize: '12px', fontWeight: 'bold', padding: '8px 14px' }}
                  formatter={(v: any) => [`${v}%`, 'Score']}
                />
                <Bar dataKey="score" radius={[6, 6, 0, 0]} maxBarSize={48}>
                  {chartData.map((entry, i) => (
                    <Cell key={i} fill={entry.score >= 75 ? '#6ee7b7' : entry.score > 0 ? '#fca5a5' : '#E2E4D8'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white rounded-3xl border border-[#E2E4D8] p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-5">
            <Award className="w-5 h-5 text-[#A7C0A5]" />
            <h3 className="font-bold text-[#2D3A3A] text-lg">Top Agentes</h3>
          </div>
          <div className="space-y-3">
            {topAgents.length > 0 ? topAgents.map((agent, idx) => (
              <AgentRow key={agent.id} name={agent.name} score={agent.score} rank={idx + 1} count={agent.count} />
            )) : (
              <div className="text-center text-sm text-[#7A7D71] py-10 flex flex-col items-center gap-2">
                <ClipboardCheck className="w-8 h-8 text-[#E2E4D8]" />
                <p>Nenhum dado suficiente</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="bg-white rounded-3xl border border-[#E2E4D8] shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-[#F0F1E8] flex justify-between items-center">
          <div>
            <h3 className="font-bold text-[#2D3A3A]">Monitorias Recentes</h3>
            <p className="text-xs text-[#7A7D71] mt-0.5">Últimas {Math.min(monitorias.length, 8)} monitorias registradas</p>
          </div>
          {pendingCount > 0 && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-full text-xs font-bold text-amber-700">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
              {pendingCount} pendente{pendingCount > 1 ? 's' : ''}
            </span>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-[#FAFAF8]">
              <tr className="text-[10px] uppercase tracking-widest text-[#7A7D71] font-bold">
                <th className="px-6 py-3">Ticket</th>
                <th className="px-6 py-3">Auditado</th>
                <th className="px-6 py-3">Auditor</th>
                <th className="px-6 py-3">Score</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3">Data</th>
              </tr>
            </thead>
            <tbody>
              {monitorias.slice(0, 8).map((m, i) => {
                const cfg = STATUS_CONFIG[m.status];
                const sc = m.score || 0;
                return (
                  <tr key={m.id} className="border-t border-[#F0F1E8] hover:bg-[#FAFAF8] transition-colors">
                    <td className="px-6 py-3.5 font-mono font-bold text-sm text-[#2D3A3A]">#{m.ticket_id}</td>
                    <td className="px-6 py-3.5 text-sm font-medium text-[#3D4035]">{getName(m.evaluated_id)}</td>
                    <td className="px-6 py-3.5 text-sm text-[#7A7D71]">{getName(m.evaluator_id)}</td>
                    <td className="px-6 py-3.5">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold ${sc === 100 ? 'bg-indigo-50 text-indigo-700' : sc >= 75 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                        {sc}%
                      </span>
                    </td>
                    <td className="px-6 py-3.5">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold border ${cfg?.bg || 'bg-gray-50'} ${cfg?.color || 'text-gray-600'}`}>
                        {cfg?.label || m.status}
                      </span>
                    </td>
                    <td className="px-6 py-3.5 text-xs text-[#7A7D71]">{new Date(m.created_at).toLocaleDateString('pt-BR')}</td>
                  </tr>
                );
              })}
              {monitorias.length === 0 && (
                <tr><td colSpan={6} className="px-6 py-12 text-center text-[#7A7D71] text-sm">Nenhuma monitoria encontrada</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, sub, good, icon, accent }: { title: string; value: string; sub: string; good: boolean; icon: React.ReactNode; accent: string }) {
  return (
    <div className="bg-white p-5 rounded-3xl border border-[#E2E4D8] shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] font-bold uppercase tracking-widest text-[#7A7D71]">{title}</span>
        <div className={`${accent}`}>{icon}</div>
      </div>
      <p className="text-3xl font-black text-[#2D3A3A] leading-none mb-1.5">{value}</p>
      <p className={`text-xs font-semibold ${good ? 'text-[#7A7D71]' : 'text-red-500'}`}>{sub}</p>
    </div>
  );
}

function AgentRow({ name, score, rank, count }: { name: string; score: number; rank: number; count: number }) {
  const isTop = rank === 1;
  const color = score >= 75 ? 'bg-emerald-400' : 'bg-red-400';
  return (
    <div className={`flex items-center gap-3 p-3 rounded-2xl transition-colors hover:bg-[#F9F9F6] ${isTop ? 'bg-[#F9F9F6]' : ''}`}>
      <span className={`text-xs font-black w-5 text-center ${isTop ? 'text-[#A7C0A5]' : 'text-[#C5C7BB]'}`}>#{rank}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-[#2D3A3A] truncate">{name}</p>
        <p className="text-[10px] text-[#7A7D71]">{count} monitoria{count > 1 ? 's' : ''}</p>
      </div>
      <div className="flex items-center gap-2">
        <div className="w-20 h-1.5 bg-[#F0F1E8] rounded-full overflow-hidden">
          <div className={`h-full rounded-full ${color}`} style={{ width: `${score}%` }} />
        </div>
        <span className={`text-xs font-bold w-10 text-right ${score >= 75 ? 'text-emerald-600' : 'text-red-600'}`}>{score}%</span>
      </div>
    </div>
  );
}
