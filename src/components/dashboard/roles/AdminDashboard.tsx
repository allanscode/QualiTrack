import React from 'react';
import { useDashboard } from '../DashboardContext';
import AdminDashboardView from './AdminDashboardView';

export default function AdminDashboard() {
  const { user } = useDashboard();

  if (!user) return null;

  return <AdminDashboardView isCustomizing={false} />;
}

