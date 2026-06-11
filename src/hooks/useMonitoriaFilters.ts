import { useState, useMemo } from 'react';
import { MonitoriaStatus, User } from '../types';

const DEFAULT_START_DATE = () => new Date(Date.now() - 30 * 24 * 3600000).toISOString().split('T')[0];
const DEFAULT_END_DATE = () => new Date().toISOString().split('T')[0];

export function useMonitoriaFilters() {
  const [tab, setTab] = useState<MonitoriaStatus | 'todas' | 'expiradas_prazo'>('todas');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'active' | 'removed'>('active');
  const [teamFilter, setTeamFilter] = useState<string>('');
  const [suporteFilter, setSuporteFilter] = useState<string>('');
  const [auditorFilter, setAuditorFilter] = useState<string>('');
  const [dateType, setDateType] = useState<'analysis' | 'ticket'>('analysis');
  const [startDate, setStartDate] = useState(DEFAULT_START_DATE);
  const [endDate, setEndDate] = useState(DEFAULT_END_DATE);

  const hasActiveFilters = useMemo(() => {
    const isDefaultDate = startDate === DEFAULT_START_DATE() &&
      endDate === DEFAULT_END_DATE();
    return search !== '' || teamFilter !== '' || suporteFilter !== '' || auditorFilter !== '' || !isDefaultDate || statusFilter !== 'active';
  }, [search, teamFilter, suporteFilter, auditorFilter, startDate, endDate, statusFilter]);

  const clearFilters = () => {
    setSearch('');
    setTeamFilter('');
    setSuporteFilter('');
    setAuditorFilter('');
    setStatusFilter('active');
    setStartDate(DEFAULT_START_DATE());
    setEndDate(DEFAULT_END_DATE());
    setTab('todas');
  };

  return {
    tab, setTab,
    search, setSearch,
    statusFilter, setStatusFilter,
    teamFilter, setTeamFilter,
    suporteFilter, setSuporteFilter,
    auditorFilter, setAuditorFilter,
    dateType, setDateType,
    startDate, setStartDate,
    endDate, setEndDate,
    hasActiveFilters,
    clearFilters,
  };
}

export type MonitoriaFilters = ReturnType<typeof useMonitoriaFilters>;
