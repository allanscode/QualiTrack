import React from 'react';
import { User } from '../../types';
import { DashboardProvider, useDashboard } from './DashboardContext';
import FilterBar from './FilterBar';

// We will import the specific role dashboards here
import AgentDashboard from './roles/AgentDashboard';
import QualityDashboard from './roles/QualityDashboard';
import SupportManagerDashboard from './roles/SupportManagerDashboard';
import QualityManagerDashboard from './roles/QualityManagerDashboard';
import AdminDashboard from './roles/AdminDashboard';

function DashboardRouter() {
  const { user, dashboardRole, loading } = useDashboard();

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1,2,3,4].map(i => <div key={i} className="h-28 bg-white rounded-3xl border border-surface-border animate-pulse" />)}
        </div>
        <div className="h-72 bg-white rounded-3xl border border-surface-border animate-pulse" />
      </div>
    );
  }

  if (!user) return null;

  // RBAC Routing based on simulated dashboardRole
  switch (dashboardRole) {
    case 'suporte':
      return <AgentDashboard />;
    case 'qualidade':
      return <QualityDashboard />;
    case 'gestor_suporte':
      return <SupportManagerDashboard />;
    case 'gestor_qualidade':
      return <QualityManagerDashboard />;
    case 'admin':
      return <AdminDashboard />;
    default:
      return (
        <div className="py-20 text-center text-brand-muted text-xs font-bold uppercase tracking-widest">
          Dashboard não disponível para o seu perfil.
        </div>
      );
  }
}

export default function DashboardMain({ 
  user, 
  activeTab
}: { 
  user: User | null; 
  activeTab?: string; 
}) {
  if (!user) return null;

  return (
    <DashboardProvider user={user} activeTab={activeTab}>
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
        <FilterBar />
        <main className="p-6">
          <DashboardRouter />
        </main>
      </div>
    </DashboardProvider>
  );
}
