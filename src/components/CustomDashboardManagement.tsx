import React, { useState } from 'react';
import { LayoutGrid } from 'lucide-react';
import AdminDashboardView from './dashboard/roles/AdminDashboardView';
import QualityManagerDashboard from './dashboard/roles/QualityManagerDashboard';
import SupportManagerDashboard from './dashboard/roles/SupportManagerDashboard';
import QualityDashboard from './dashboard/roles/QualityDashboard';
import AgentDashboard from './dashboard/roles/AgentDashboard';

export default function CustomDashboardManagement() {
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
            Personalize as descrições explicativas dos blocos e gráficos por perfil de acesso.
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
            O painel abaixo é uma simulação segura em tempo real (dados fictícios de alta fidelidade). Passe o mouse sobre o ícone nativo de qualquer cartão ou gráfico para ver a explicação atual e clique diretamente no ícone para editá-la. O limite máximo é de 35 caracteres. Suas alterações se aplicam instantaneamente a todos os usuários reais daquele perfil de acesso.
          </p>
        </div>
      </div>

      {/* Dynamic Dashboard View rendering according to the selected profile */}
      <div className="space-y-6">
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
      </div>
    </div>
  );
}
