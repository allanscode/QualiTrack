import React, { useState } from 'react';
import { LayoutGrid } from 'lucide-react';
import AdminDashboardView from './dashboard/roles/AdminDashboardView';
import QualityManagerDashboard from './dashboard/roles/QualityManagerDashboard';
import SupportManagerDashboard from './dashboard/roles/SupportManagerDashboard';
import QualityDashboard from './dashboard/roles/QualityDashboard';
import AgentDashboard from './dashboard/roles/AgentDashboard';
import { DashboardProvider } from './dashboard/DashboardContext';
import { DashboardTileLayout } from './dashboard/DashboardTileLayout';
import DashboardLayoutControls from './dashboard/DashboardLayoutControls';
import { User } from '../types';

export default function CustomDashboardManagement({ user }: { user: User | null }) {
  const [selectedProfile, setSelectedProfile] = useState<'admin' | 'gestor_qualidade' | 'gestor_suporte' | 'qualidade' | 'suporte'>('admin');
  const [activeEditingId, setActiveEditingId] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      {/* Title & Selector Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-surface-card rounded-3xl border border-surface-border p-6 shadow-premium">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <LayoutGrid className="w-5 h-5 text-brand-accent animate-pulse" />
            <h1 className="text-xl font-black text-brand-primary uppercase tracking-widest">
              Customizar Dashboards
            </h1>
          </div>
          <p className="text-xs text-brand-muted font-bold uppercase tracking-wider">
            Defina o que cada cargo vê e organize a posição dos indicadores.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <span className="text-[10px] font-black uppercase tracking-widest text-brand-muted">
            Perfil de Acesso:
          </span>
          <select
            value={selectedProfile}
            onChange={(e) => {
              setSelectedProfile(e.target.value as any);
              setActiveEditingId(null);
            }}
            className="h-10 px-4 rounded-xl border border-surface-border bg-surface-bg text-xs font-bold text-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-accent/50 cursor-pointer"
          >
            <option value="admin">Executivo (Administrador)</option>
            <option value="gestor_qualidade">Gestor de Qualidade</option>
            <option value="gestor_suporte">Gestor de Suporte</option>
            <option value="qualidade">Visão Monitor</option>
            <option value="suporte">Visão Agente</option>
          </select>
        </div>
      </div>

      {/* Guide Banner */}
      <div className="bg-brand-accent/5 border border-brand-accent/20 rounded-2xl p-4 flex items-start gap-3">
        <span className="relative flex h-2 w-2 mt-1.5 shrink-0">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-accent opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-brand-accent"></span>
        </span>
        <div className="space-y-1">
          <h4 className="text-xs font-black uppercase tracking-widest text-brand-primary">
            Instruções de Customização:
          </h4>
          <p className="text-[11px] text-brand-muted font-medium leading-relaxed">
            Remova, adicione ou mova os itens da visão selecionada. A prévia usa dados fictícios. Você também pode clicar no ícone de um card ou gráfico para editar sua explicação; as mudanças são aplicadas aos usuários do cargo escolhido.
          </p>
        </div>
      </div>

      <DashboardLayoutControls role={selectedProfile} />

      {/* Dynamic Dashboard View rendering according to the selected profile */}
      <div className="space-y-6">
        <h2 className="text-sm font-black text-brand-primary">Prévia do dashboard</h2>
        <DashboardProvider user={user} activeTab="custom_dashboard">
          <DashboardTileLayout key={selectedProfile} role={selectedProfile}>
          {selectedProfile === 'admin' && (
            <AdminDashboardView 
              isCustomizing={true}
              activeEditingId={activeEditingId}
              setActiveEditingId={setActiveEditingId}
            />
          )}

          {selectedProfile === 'gestor_qualidade' && (
            <QualityManagerDashboard 
              isCustomizing={true}
              activeEditingId={activeEditingId}
              setActiveEditingId={setActiveEditingId}
            />
          )}

          {selectedProfile === 'gestor_suporte' && (
            <SupportManagerDashboard 
              isCustomizing={true}
              activeEditingId={activeEditingId}
              setActiveEditingId={setActiveEditingId}
            />
          )}

          {selectedProfile === 'qualidade' && (
            <QualityDashboard 
              isCustomizing={true}
              activeEditingId={activeEditingId}
              setActiveEditingId={setActiveEditingId}
            />
          )}

          {selectedProfile === 'suporte' && (
            <AgentDashboard 
              isCustomizing={true}
              activeEditingId={activeEditingId}
              setActiveEditingId={setActiveEditingId}
            />
          )}
          </DashboardTileLayout>
        </DashboardProvider>
      </div>
    </div>
  );
}
