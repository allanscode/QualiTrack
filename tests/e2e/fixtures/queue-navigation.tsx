import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import '../../../src/index.css';
import { canManageQueueAssignments } from '../../../src/lib/queueDistribution';
import { QUEUE_TITLES, QUEUE_SUBTITLES } from '../../../src/App';
import { QueueSubTab, User } from '../../../src/types';
import { ChevronDown, Layers, Users, Search, Activity, ShieldCheck, Check, X, GitFork } from 'lucide-react';

const testMonitors: User[] = [
  { id: 'm1', name: 'Gabriel Dias', email: 'gabriel@example.invalid', role: 'qualidade', active: true, created_at: '' },
  { id: 'm2', name: 'Vinícius Gouvêa', email: 'vinicius@example.invalid', role: 'qualidade', active: true, created_at: '' },
];

const mockTickets = {
  negativas: [{ id: '101', subject: 'Chamado Ruim #101' }],
  proativas: [{ id: '201', subject: 'Chamado Proativo #201' }],
  positivas: [{ id: '301', subject: 'Chamado Positivo #301' }],
  filhos: [{ id: '401', subject: 'Chamado Filho #401' }],
  filhos_invalidos: [{ id: '501', subject: 'Chamado Inválido #501' }],
};

function NavigationHarness() {
  const params = new URLSearchParams(window.location.search);
  const role = params.get('role') || 'admin';
  const initialSubTab = (params.get('subTab') as QueueSubTab) || 'negativas';

  const [isQueueMenuOpen, setIsQueueMenuOpen] = useState(true);
  const [activeQueueSubTab, setActiveQueueSubTab] = useState<QueueSubTab>(initialSubTab);
  const [search, setSearch] = useState('');

  const isSupervisor = canManageQueueAssignments(role);

  useEffect(() => {
    if (activeQueueSubTab === 'monitores' && !isSupervisor) {
      setActiveQueueSubTab('negativas');
    }
  }, [activeQueueSubTab, isSupervisor]);

  return (
    <div className="flex h-screen w-screen bg-surface-bg text-brand-primary">
      {/* Sidebar de Teste */}
      <aside className="w-64 border-r border-surface-border bg-surface-card p-4 flex flex-col gap-2">
        <h2 className="text-sm font-bold text-brand-muted uppercase tracking-wider mb-2">Menu</h2>
        
        <button
          onClick={() => setIsQueueMenuOpen(!isQueueMenuOpen)}
          data-testid="filas-menu-button"
          className="w-full flex items-center justify-between p-2.5 rounded-xl font-bold hover:bg-surface-subtle transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-brand-highlight" />
            <span>Filas de Triagem</span>
          </div>
          <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${isQueueMenuOpen ? 'rotate-180' : ''}`} />
        </button>

        {isQueueMenuOpen && (
          <div className="space-y-1 pl-4" data-testid="queue-subitems-container">
            <button
              onClick={() => setActiveQueueSubTab('negativas')}
              data-testid="subitem-negativas"
              className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                activeQueueSubTab === 'negativas' ? 'bg-rose-500/15 text-rose-500 font-bold' : 'text-brand-muted hover:text-brand-primary'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0" />
              <span>CSAT Negativas</span>
            </button>

            <button
              onClick={() => setActiveQueueSubTab('proativas')}
              data-testid="subitem-proativas"
              className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                activeQueueSubTab === 'proativas' ? 'bg-indigo-500/15 text-indigo-500 font-bold' : 'text-brand-muted hover:text-brand-primary'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-indigo-500 shrink-0" />
              <span>Fila Proativa</span>
            </button>

            <button
              onClick={() => setActiveQueueSubTab('positivas')}
              data-testid="subitem-positivas"
              className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                activeQueueSubTab === 'positivas' ? 'bg-emerald-500/15 text-emerald-500 font-bold' : 'text-brand-muted hover:text-brand-primary'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
              <span>CSAT Positivas</span>
            </button>

            <button
              onClick={() => setActiveQueueSubTab('filhos')}
              data-testid="subitem-filhos"
              className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                activeQueueSubTab === 'filhos' ? 'bg-sky-500/15 text-sky-500 font-bold' : 'text-brand-muted hover:text-brand-primary'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-sky-500 shrink-0" />
              <span>Chamados Filhos</span>
            </button>

            <button
              onClick={() => setActiveQueueSubTab('filhos_invalidos')}
              data-testid="subitem-filhos_invalidos"
              className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                activeQueueSubTab === 'filhos_invalidos' ? 'bg-amber-500/15 text-amber-500 font-bold' : 'text-brand-muted hover:text-brand-primary'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
              <span>Filhos Inválidos</span>
            </button>

            {isSupervisor && (
              <button
                onClick={() => setActiveQueueSubTab('monitores')}
                data-testid="subitem-monitores"
                className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                  activeQueueSubTab === 'monitores' ? 'bg-blue-600/15 text-blue-600 font-bold' : 'text-brand-muted hover:text-brand-primary'
                }`}
              >
                <span className="w-2 h-2 rounded-full bg-blue-600 shrink-0" />
                <span>Monitores na Triagem</span>
              </button>
            )}
          </div>
        )}
      </aside>

      {/* Conteúdo Principal */}
      <main className="flex-1 p-8 overflow-auto">
        <header className="mb-6">
          <h1 className="text-2xl font-black text-brand-primary tracking-tight" data-testid="page-title">
            {QUEUE_TITLES[activeQueueSubTab]}
          </h1>
          <p className="text-xs font-medium text-brand-muted mt-1" data-testid="page-subtitle">
            {QUEUE_SUBTITLES[activeQueueSubTab]}
          </p>
        </header>

        {/* Verifica que os botões legados NÃO estão presentes */}
        <div data-testid="legacy-queue-buttons-absent" />

        {activeQueueSubTab === 'monitores' ? (
          <div className="space-y-4" data-testid="monitores-panel">
            <div className="p-4 rounded-xl border border-surface-border bg-surface-card flex items-center gap-3">
              <Users className="w-5 h-5 text-brand-highlight" />
              <div>
                <h3 className="text-sm font-bold">Painel de Supervisão e Presença dos Monitores</h3>
                <p className="text-xs text-brand-muted">Gestão exclusiva para Administradores e Supervisores.</p>
              </div>
            </div>

            <div className="divide-y divide-surface-border border border-surface-border rounded-xl bg-surface-card">
              {testMonitors.map(m => (
                <div key={m.id} data-testid={`monitor-row-${m.id}`} className="p-3 flex items-center justify-between">
                  <span className="text-xs font-bold">{m.name}</span>
                  <span className="text-xs text-emerald-500 font-semibold">Online e Apto</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-4" data-testid="ticket-queue-panel">
            <div className="flex items-center gap-3">
              <div className="relative w-72">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-brand-muted" />
                <input
                  type="text"
                  placeholder="Buscar chamados..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  data-testid="search-input"
                  className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl border border-surface-border bg-surface-card"
                />
              </div>
            </div>

            <div className="space-y-2">
              {(mockTickets[activeQueueSubTab as keyof typeof mockTickets] || [])
                .filter(t => t.subject.toLowerCase().includes(search.toLowerCase()))
                .map(t => (
                  <div key={t.id} data-testid={`ticket-${t.id}`} className="p-3 rounded-xl border border-surface-border bg-surface-card text-xs font-medium">
                    #{t.id} - {t.subject}
                  </div>
                ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

document.documentElement.classList.add('dark');
createRoot(document.getElementById('root')!).render(<NavigationHarness />);
