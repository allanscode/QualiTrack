import React, { useState, useEffect } from 'react';
import { collection, query, orderBy, onSnapshot, where } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { Monitoria, User } from '../types';
import { Filter, Search, MoreHorizontal, Eye, FileEdit, Trash2, Calendar, User as UserIcon, Ticket as TicketIcon } from 'lucide-react';
import { motion } from 'motion/react';

export default function MonitoriaList({ user }: { user: User | null }) {
  const [monitorias, setMonitorias] = useState<Monitoria[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    const path = 'monitorias';
    let q = query(collection(db, path), orderBy('createdAt', 'desc'));

    if (user.role === 'tecnico' || user.role === 'assistente') {
      q = query(collection(db, path), where('agentId', '==', user.id), orderBy('createdAt', 'desc'));
    } else if (user.role === 'analista') {
      q = query(collection(db, path), where('auditorId', '==', user.id), orderBy('createdAt', 'desc'));
    }

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Monitoria));
      setMonitorias(data);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    });

    return unsubscribe;
  }, [user]);

  if (loading) {
    return (
      <div className="flex flex-col gap-4">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-20 bg-white rounded-3xl border border-[#E2E4D8] opacity-50 animate-pulse shadow-sm" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Filters Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 bg-white rounded-3xl border border-[#E2E4D8] shadow-sm">
        <div className="flex items-center gap-4 w-full md:w-auto">
          <div className="relative flex-1 md:flex-none">
            <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-[#7A7D71]" />
            <input 
              type="text" 
              placeholder="Pesquisar por ticket ou agente..." 
              className="bg-[#F9F9F6] border border-[#E2E4D8] rounded-2xl py-2 pl-10 pr-4 text-sm focus:border-[#A7C0A5] focus:ring-1 focus:ring-[#A7C0A5] focus:outline-none w-full md:w-80 transition-shadow"
            />
          </div>
          <button className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-[#2D3A3A] bg-[#F9F9F6] border border-[#E2E4D8] rounded-2xl hover:bg-[#E2E4D8] transition-colors">
            <Filter className="w-4 h-4" /> Filtros
          </button>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold tracking-widest text-[#7A7D71] uppercase">Mostrando: {monitorias.length} monitorias</span>
        </div>
      </div>

      {monitorias.length === 0 ? (
        <div className="p-16 text-center bg-white rounded-[40px] border border-[#E2E4D8] shadow-sm">
          <ClipboardList className="w-12 h-12 mx-auto mb-4 text-[#A7C0A5]" />
          <h3 className="font-bold text-[#2D3A3A] text-xl mb-2">Nenhuma monitoria encontrada</h3>
          <p className="text-sm text-[#7A7D71]">Inicie uma nova auditoria para visualizar aqui.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {monitorias.map((m, i) => (
            <motion.div 
              key={m.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
              className="group bg-white rounded-[32px] border border-[#E2E4D8] shadow-sm hover:shadow-md transition-shadow cursor-pointer overflow-hidden"
            >
              <div className="flex items-stretch">
                <div className={`w-3 ${m.finalScore >= 90 ? 'bg-[#A7C0A5]' : m.finalScore >= 75 ? 'bg-amber-400' : 'bg-[#D4A373]'}`}></div>
                <div className="flex-1 p-6 grid grid-cols-1 md:grid-cols-4 lg:grid-cols-6 gap-6 items-center">
                  
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-1.5 text-[10px] font-bold tracking-widest text-[#7A7D71] uppercase">
                      <TicketIcon className="w-3 h-3" /> Ticket
                    </div>
                    <span className="font-mono text-sm font-bold text-[#2D3A3A]">#{m.ticketId}</span>
                  </div>

                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-1.5 text-[10px] font-bold tracking-widest text-[#7A7D71] uppercase">
                      <UserIcon className="w-3 h-3" /> Agente
                    </div>
                    <span className="text-sm font-semibold text-[#3D4035]">{m.agentId}</span>
                  </div>

                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-1.5 text-[10px] font-bold tracking-widest text-[#7A7D71] uppercase">
                      <Calendar className="w-3 h-3" /> Data
                    </div>
                    <span className="text-sm text-[#7A7D71]">{new Date(m.createdAt).toLocaleDateString()}</span>
                  </div>

                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-1.5 text-[10px] font-bold tracking-widest text-[#7A7D71] uppercase">
                      Score
                    </div>
                    <span className={`text-xl font-bold font-mono ${m.finalScore >= 90 ? 'text-[#2D3A3A]' : m.finalScore >= 75 ? 'text-amber-600' : 'text-[#D4A373]'}`}>
                      {m.finalScore}%
                    </span>
                  </div>

                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-1.5 text-[10px] font-bold tracking-widest text-[#7A7D71] uppercase">
                      Status
                    </div>
                    <div className="flex">
                      <span className={`text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1.5 ${m.status === 'completed' ? 'bg-[#E2E4D8] text-[#2D3A3A]' : 'bg-[#F0F1E8] text-[#7A7D71]'}`}>
                        <div className={`w-2 h-2 rounded-full ${m.status === 'completed' ? 'bg-[#A7C0A5]' : 'bg-amber-400'}`}></div>
                        {m.status === 'completed' ? 'Concluído' : 'Rascunho'}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2">
                    <button className="p-2.5 rounded-xl hover:bg-[#F9F9F6] text-[#7A7D71] hover:text-[#2D3A3A] transition-colors">
                      <Eye className="w-5 h-5" />
                    </button>
                    <button className="p-2.5 rounded-xl hover:bg-[#F9F9F6] text-[#7A7D71] hover:text-[#2D3A3A] transition-colors">
                      <FileEdit className="w-5 h-5" />
                    </button>
                  </div>

                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}

function ClipboardList({ className }: { className: string }) {
  return (
    <div className={className}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
        <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
        <path d="M12 11h4" />
        <path d="M12 16h4" />
        <path d="M8 11h.01" />
        <path d="M8 16h.01" />
      </svg>
    </div>
  );
}
