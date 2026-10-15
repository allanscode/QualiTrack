import React from 'react';
import { User } from '../../types';
import { DashboardProvider, useDashboard } from './DashboardContext';
import { PageSkeleton } from '../ui/PageSkeleton';
import { userCacheScope } from '../../lib/pageCache';
import FilterBar from './FilterBar';
import { DashboardTileLayout } from './DashboardTileLayout';

const AgentDashboard = React.lazy(() => import('./roles/AgentDashboard'));
const QualityDashboard = React.lazy(() => import('./roles/QualityDashboard'));
const SupportManagerDashboard = React.lazy(() => import('./roles/SupportManagerDashboard'));
const QualityManagerDashboard = React.lazy(() => import('./roles/QualityManagerDashboard'));
const AdminDashboard = React.lazy(() => import('./roles/AdminDashboard'));

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
  return <React.Suspense fallback={<PageSkeleton dashboard />}>
    <div className="space-y-6">
      <FilterBar />
      <DashboardTileLayout role={user!.role}><DashboardRouter /></DashboardTileLayout>
    </div>
  </React.Suspense>;
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
