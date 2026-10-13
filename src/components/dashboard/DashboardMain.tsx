import React from 'react';
import { User } from '../../types';
import { DashboardProvider, useDashboard } from './DashboardContext';
import { PageSkeleton } from '../ui/PageSkeleton';
import { userCacheScope } from '../../lib/pageCache';
import FilterBar from './FilterBar';
import { DashboardTileLayout } from './DashboardTileLayout';

// We will import the specific role dashboards here
import AgentDashboard from './roles/AgentDashboard';
import QualityDashboard from './roles/QualityDashboard';
import SupportManagerDashboard from './roles/SupportManagerDashboard';
import QualityManagerDashboard from './roles/QualityManagerDashboard';
import AdminDashboard from './roles/AdminDashboard';

function DashboardRouter() {
  const { user, dashboardRole } = useDashboard();

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

function DashboardContent() {
  const { user, loading } = useDashboard();
  if (loading) return <PageSkeleton dashboard />;
  return <div className="space-y-6">
    <FilterBar />
    <DashboardTileLayout role={user!.role}><DashboardRouter /></DashboardTileLayout>
  </div>;
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
    <DashboardProvider key={userCacheScope(user)} user={user} activeTab={activeTab}>
      <DashboardContent />
    </DashboardProvider>
  );
}
