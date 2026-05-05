import React, { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';
import { TrendingUp, Users, ClipboardCheck, AlertCircle, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { User, Monitoria } from '../types';
import { collection, query, getDocs, orderBy } from 'firebase/firestore';
import { db } from '../lib/firebase';

export default function Dashboard({ user }: { user: User | null }) {
  const [monitorias, setMonitorias] = useState<Monitoria[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchMonitorias = async () => {
      try {
        const q = query(collection(db, 'monitorias'), orderBy('createdAt', 'desc'));
        const snapshot = await getDocs(q);
        
        let docs = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Monitoria));
        
        // Filter by user role if not admin/gestor
        if (user?.role === 'tecnico' || user?.role === 'assistente') {
          docs = docs.filter(m => m.agentId === user.id);
        } else if (user?.role === 'analista') {
          docs = docs.filter(m => m.auditorId === user.id);
        }

        setMonitorias(docs);
      } catch (error) {
        console.error("Error fetching monitorias:", error);
      } finally {
        setLoading(false);
      }
    };

    if (user) {
      fetchMonitorias();
    }
  }, [user]);

  // Calculations
  const completedMonitorias = monitorias.filter(m => m.status === 'completed');
  const count = completedMonitorias.length;
  
  const avgScore = count > 0 
    ? (completedMonitorias.reduce((acc, m) => acc + m.finalScore, 0) / count).toFixed(1)
    : '0';

  const criticalCount = completedMonitorias.filter(m => m.finalScore < 70).length;
  const activeAgents = new Set(completedMonitorias.map(m => m.agentId)).size;

  // Chart Logic (Scores by Day - grouping last 5 days)
  const chartData = [];
  const daysMap: Record<string, { total: number, count: number }> = {};
  
  // Initialize last 5 days
  for(let i=4; i>=0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dayStr = d.toLocaleDateString('pt-BR', { weekday: 'short' });
    const fullDate = d.toISOString().split('T')[0];
    daysMap[fullDate] = { total: 0, count: 0 };
    chartData.push({ name: dayStr, fullDate, score: 0 });
  }

  completedMonitorias.forEach(m => {
    const d = new Date(m.createdAt).toISOString().split('T')[0];
    if (daysMap[d]) {
      daysMap[d].total += m.finalScore;
      daysMap[d].count++;
    }
  });

  chartData.forEach(cd => {
    const day = daysMap[cd.fullDate];
    if (day && day.count > 0) {
      cd.score = Math.round(day.total / day.count);
    }
  });

  // Top Agents
  const agentScores: Record<string, { total: number, count: number }> = {};
  completedMonitorias.forEach(m => {
    if (!agentScores[m.agentId]) {
      agentScores[m.agentId] = { total: 0, count: 0 };
    }
    agentScores[m.agentId].total += m.finalScore;
    agentScores[m.agentId].count++;
  });

  const topAgents = Object.entries(agentScores)
    .map(([email, stats]) => ({
      name: email, // Since we don't have the user collection fetched here, using email as name
      score: Math.round(stats.total / stats.count)
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-4 border-[#2D3A3A] border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard 
          title="Score Geral" 
          value={`${avgScore}%`} 
          trend="%" 
          trendUp={Number(avgScore) >= 80} 
          icon={<TrendingUp className="w-5 h-5 text-green-600" />} 
        />
        <StatCard 
          title="Monitorias Concluídas" 
          value={count.toString()} 
          trend="" 
          trendUp={true} 
          icon={<ClipboardCheck className="w-5 h-5 text-blue-600" />} 
        />
        <StatCard 
          title="Agentes Avaliados" 
          value={activeAgents.toString()} 
          trend="" 
          trendUp={true} 
          icon={<Users className="w-5 h-5 text-orange-600" />} 
        />
        <StatCard 
          title="Alertas Críticos (<70%)" 
          value={criticalCount.toString()} 
          trend="" 
          trendUp={criticalCount === 0} 
          icon={<AlertCircle className={`w-5 h-5 ${criticalCount > 0 ? 'text-red-600' : 'text-gray-400'}`} />} 
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Chart */}
        <div className="lg:col-span-2 bg-white rounded-[40px] border border-[#E2E4D8] p-8 shadow-sm">
          <div className="flex items-center justify-between mb-8">
            <h3 className="font-bold text-[#2D3A3A] text-xl">Média de Qualidade (Últimos dias)</h3>
            <div className="flex gap-2 items-center">
              <span className="w-2 h-2 bg-[#2D3A3A] rounded-full"></span>
              <span className="text-xs font-bold uppercase text-[#7A7D71] tracking-wider">Score %</span>
            </div>
          </div>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E4D8" />
                <XAxis 
                  dataKey="name" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 12, fill: '#7A7D71', fontWeight: 'bold' }} 
                  dy={10}
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 12, fill: '#7A7D71', fontWeight: 'bold' }} 
                />
                <Tooltip 
                  cursor={{ fill: '#F9F9F6' }}
                  contentStyle={{ 
                    backgroundColor: '#2D3A3A', 
                    border: 'none', 
                    borderRadius: '16px',
                    color: '#fff',
                    fontSize: '12px',
                    fontWeight: 'bold'
                  }}
                />
                <Bar dataKey="score" fill="#A7C0A5" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Top Agents */}
        <div className="bg-white rounded-[32px] border border-[#E2E4D8] p-8 shadow-sm">
          <h3 className="font-bold text-[#2D3A3A] text-xl mb-6">Top Agentes</h3>
          <div className="space-y-4">
            {topAgents.length > 0 ? (
              topAgents.map((agent, idx) => (
                <AgentRow key={agent.name} name={agent.name} score={agent.score} rank={idx + 1} />
              ))
            ) : (
              <div className="text-center text-sm text-[#7A7D71] py-8">Nenhum dado suficiente</div>
            )}
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="bg-white rounded-[40px] border border-[#E2E4D8] shadow-sm flex flex-col overflow-hidden">
        <div className="p-6 border-b border-[#F0F1E8] bg-[#FBFBF9] flex justify-between items-center">
          <h3 className="font-bold text-[#2D3A3A]">Monitorias Recentes</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-[#F9F9F6] text-[11px] uppercase tracking-widest text-[#7A7D71] font-bold">
              <tr>
                <th className="px-8 py-4">Ticket</th>
                <th className="px-8 py-4">Avaliado</th>
                <th className="px-8 py-4">Avaliador</th>
                <th className="px-8 py-4">Score</th>
                <th className="px-8 py-4">Status</th>
                <th className="px-8 py-4">Data</th>
              </tr>
            </thead>
            <tbody className="text-sm text-[#3D4035]">
              {monitorias.slice(0, 5).map(m => (
                <ActivityRow 
                  key={m.id}
                  ticket={`#${m.ticketId}`} 
                  agent={m.agentId} 
                  auditor={m.auditorId} 
                  score={m.finalScore} 
                  status={m.status} 
                  date={new Date(m.createdAt).toLocaleDateString()} 
                />
              ))}
              {monitorias.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-8 py-12 text-center text-[#7A7D71]">Nenhuma monitoria recente</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, trend, trendUp, icon }: { title: string, value: string, trend: string, trendUp: boolean, icon: React.ReactNode }) {
  return (
    <div className="bg-white p-6 rounded-[32px] border border-[#E2E4D8] shadow-sm">
      <div className="flex items-center justify-between mb-4 text-[#7A7D71]">
        <span className="text-xs font-bold uppercase tracking-wider">{title}</span>
        {icon}
      </div>
      <div>
        <span className="text-3xl font-bold text-[#2D3A3A]">{value}</span>
        <div className={`flex items-center text-xs mt-1 font-bold ${trendUp ? 'text-green-600' : 'text-amber-600'}`}>
          {trendUp ? <ArrowUpRight className="w-3 h-3 mr-1" /> : <ArrowDownRight className="w-3 h-3 mr-1" />}
          {trend}
        </div>
      </div>
    </div>
  );
}

function AgentRow({ name, score, rank }: { name: string, score: number, rank: number }) {
  return (
    <div className="flex items-center justify-between group cursor-pointer hover:bg-[#F9F9F6] p-3 -mx-3 rounded-2xl transition-colors">
      <div className="flex items-center gap-3">
        <span className="text-[#7A7D71] text-xs font-bold w-4">{rank}</span>
        <span className="text-sm font-semibold text-[#3D4035]">{name}</span>
      </div>
      <div className="flex items-center gap-3">
        <div className="w-24 h-2 bg-[#F0F1E8] rounded-full overflow-hidden">
          <div className="h-full bg-[#A7C0A5]" style={{ width: `${score}%` }}></div>
        </div>
        <span className="text-xs font-bold text-[#2D3A3A] w-8 text-right">{score}%</span>
      </div>
    </div>
  );
}

function ActivityRow({ ticket, agent, auditor, score, status, date }: { ticket: string, agent: string, auditor: string, score: number, status: string, date: string }) {
  return (
    <tr className="border-b border-[#F0F1E8] hover:bg-[#F9F9F6] transition-colors">
      <td className="px-8 py-4 font-mono font-bold">{ticket}</td>
      <td className="px-8 py-4 font-medium">{agent}</td>
      <td className="px-8 py-4 text-[#7A7D71] text-sm">{auditor}</td>
      <td className="px-8 py-4">
        <span className={`px-3 py-1 rounded-full text-xs font-bold ${score >= 90 ? 'bg-green-100 text-green-800' : score >= 80 ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800'}`}>
          {score} pts
        </span>
      </td>
      <td className="px-8 py-4">
        <span className="flex items-center gap-1.5 text-xs font-bold">
          <div className={`w-2 h-2 rounded-full ${status === 'completed' ? 'bg-green-500' : 'bg-amber-500'}`}></div>
          {status === 'completed' ? 'Concluído' : 'Em Revisão'}
        </span>
      </td>
      <td className="px-8 py-4 text-sm text-[#7A7D71]">{date}</td>
    </tr>
  );
}
