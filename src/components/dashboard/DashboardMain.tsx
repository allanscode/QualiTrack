import React from 'react';
import { User } from '../../types';
import { DashboardProvider, useDashboard } from './DashboardContext';
import FilterBar from './FilterBar';

// We will import the specific role dashboards here
import AgentDashboard from './roles/AgentDashboard';
import AuditorDashboard from './roles/AuditorDashboard';
import SupportManagerDashboard from './roles/SupportManagerDashboard';
import QualityManagerDashboard from './roles/QualityManagerDashboard';

function DashboardRouter() {
  const { user, loading } = useDashboard();

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1,2,3,4].map(i => <div key={i} className="h-28 bg-white rounded-3xl border border-[#E2E4D8] animate-pulse" />)}
        </div>
        <div className="h-72 bg-white rounded-3xl border border-[#E2E4D8] animate-pulse" />
      </div>
    );
  }

  if (!user) return null;

  // RBAC Routing
  switch (user.role) {
    case 'suporte':
      return <AgentDashboard />;
    case 'qualidade':
      return <AuditorDashboard />;
    case 'gestor_suporte':
      return <SupportManagerDashboard />;
    case 'gestor_qualidade':
    case 'admin':
      return <QualityManagerDashboard />;
    default:
      return (
        <div className="py-20 text-center text-[#7A7D71]">
          Dashboard não disponível para o seu perfil.
        </div>
      );
  }
}

export default function DashboardMain({ user }: { user: User | null }) {
  if (!user) return null;

  return (
    <DashboardProvider user={user}>
      <div className="space-y-4">
        <FilterBar />
        <DashboardRouter />
      </div>
    </DashboardProvider>
  );
}
