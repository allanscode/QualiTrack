import React from 'react';
import { useDashboard } from '../DashboardContext';
import { useQualityConfig } from '../../../lib/useQualityConfig';
import { Monitoria, User } from '../../../types';

interface RecentAuditsTableProps {
  monitorias: Monitoria[];
  users: User[];
  limit?: number;
  title?: string;
}

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

export default function RecentAuditsTable({ monitorias, users, limit = 8, title = 'Monitorias Recentes' }: RecentAuditsTableProps) {
  const { user: currentUser } = useDashboard();
  const { getLevelForScore } = useQualityConfig();
  
  const getName = (id: string) => {
    const u = users.find(u => u.id === id);
    if (!u) return id;

    // Anonymize auditor for agents and support managers
    const isProtectedRole = ['suporte', 'gestor_suporte'].includes(currentUser?.role || '');
    const isAuditorRole = ['qualidade', 'gestor_qualidade', 'admin'].includes(u.role);
    
    if (isProtectedRole && isAuditorRole) {
      return 'Análise da Qualidade';
    }
    
    return u.name;
  };

  const displayList = monitorias.slice(0, limit);

  return (
    <div className="bg-white rounded-3xl border border-[#E2E4D8] shadow-sm overflow-hidden transition-all duration-500">
      <div className="px-6 py-4 border-b border-[#F0F1E8] flex justify-between items-center bg-[#FAFAF8]">
        <div>
          <h3 className="font-bold text-[#2D3A3A] text-lg">{title}</h3>
          <p className="text-xs text-[#7A7D71] mt-0.5">Mostrando {displayList.length} de {monitorias.length} monitorias</p>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead className="bg-[#FAFAF8]">
            <tr className="text-[10px] uppercase tracking-widest text-[#7A7D71] font-bold">
              <th className="px-6 py-3">Ticket</th>
              <th className="px-6 py-3">Auditor</th>
              <th className="px-6 py-3">Auditado</th>
              <th className="px-6 py-3">Score</th>
              <th className="px-6 py-3">Status</th>
              <th className="px-6 py-3">Data</th>
            </tr>
          </thead>
          <tbody>
            {displayList.map((m) => {
              const cfg = STATUS_CONFIG[m.status] || { label: m.status, color: 'text-gray-600', bg: 'bg-gray-50' };
              const sc = m.score || 0;
              return (
                <tr key={m.id} className="border-t border-[#F0F1E8] hover:bg-[#FAFAF8] transition-colors">
                  <td className="px-6 py-3.5 font-mono font-bold text-sm text-[#2D3A3A]">#{m.ticket_id}</td>
                  <td className="px-6 py-3.5 text-sm font-medium text-[#3D4035]">{getName(m.evaluator_id)}</td>
                  <td className="px-6 py-3.5 text-sm text-[#7A7D71]">{getName(m.evaluated_id)}</td>
                  <td className="px-6 py-3.5">
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold ${getLevelForScore(sc).bgColor} ${getLevelForScore(sc).color}`}>
                      {sc.toFixed(2)}%
                    </span>
                  </td>
                  <td className="px-6 py-3.5">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold border ${cfg.bg} ${cfg.color}`}>
                      {cfg.label}
                    </span>
                  </td>
                  <td className="px-6 py-3.5 text-xs text-[#7A7D71]">{new Date(m.created_at).toLocaleDateString('pt-BR')}</td>
                </tr>
              );
            })}
            {displayList.length === 0 && (
              <tr><td colSpan={6} className="px-6 py-12 text-center text-[#7A7D71] text-sm">Nenhuma monitoria encontrada</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
