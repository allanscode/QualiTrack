import { useState, useMemo } from 'react';
import { MonitoriaStatus, User } from '../types';

export type MonitoriaSortField = 'created_at' | 'score' | 'action_deadline_at' | 'display_id' | 'ticket_id' | 'evaluated_name' | 'team_name' | 'evaluator_name' | 'status' | 'form_id';
export type MonitoriaSortDirection = 'asc' | 'desc';

const DEFAULT_START_DATE = () => new Date(Date.now() - 30 * 24 * 3600000).toISOString().split('T')[0];
const DEFAULT_END_DATE = () => new Date().toISOString().split('T')[0];

export function useMonitoriaFilters() {
  const [tab, setTab] = useState<MonitoriaStatus | 'todas' | 'expiradas_prazo'>('todas');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'active' | 'removed'>('active');
  const [teamFilter, setTeamFilter] = useState<string>('');
  const [suporteFilter, setSuporteFilter] = useState<string>('');
  const [auditorFilter, setAuditorFilter] = useState<string>('');
  const [ticketKindFilter, setTicketKindFilter] = useState<'all' | 'child' | 'service'>('all');
  const [dateType, setDateType] = useState<'analysis' | 'ticket'>('analysis');
  const [startDate, setStartDate] = useState(DEFAULT_START_DATE);
  const [endDate, setEndDate] = useState(DEFAULT_END_DATE);
  const [createdStartDate, setCreatedStartDate] = useState('');
  const [createdEndDate, setCreatedEndDate] = useState('');
  const [deadlineStartDate, setDeadlineStartDate] = useState('');
  const [deadlineEndDate, setDeadlineEndDate] = useState('');
  const [sortField, setSortField] = useState<MonitoriaSortField>('display_id');
  const [sortDirection, setSortDirection] = useState<MonitoriaSortDirection>('desc');

  const hasActiveFilters = useMemo(() => {
    const isDefaultDate = startDate === DEFAULT_START_DATE() &&
      endDate === DEFAULT_END_DATE();
    return search !== '' || teamFilter !== '' || suporteFilter !== '' || auditorFilter !== '' || ticketKindFilter !== 'all' || !isDefaultDate || statusFilter !== 'active' || !!createdStartDate || !!createdEndDate || !!deadlineStartDate || !!deadlineEndDate;
  }, [search, teamFilter, suporteFilter, auditorFilter, ticketKindFilter, startDate, endDate, statusFilter, createdStartDate, createdEndDate, deadlineStartDate, deadlineEndDate]);

  const clearFilters = () => {
    setSearch('');
    setTeamFilter('');
    setSuporteFilter('');
    setAuditorFilter('');
    setTicketKindFilter('all');
    setStatusFilter('active');
    setStartDate(DEFAULT_START_DATE());
    setEndDate(DEFAULT_END_DATE());
    setCreatedStartDate(''); setCreatedEndDate(''); setDeadlineStartDate(''); setDeadlineEndDate('');
    setTab('todas');
  };

  return {
    tab, setTab,
    search, setSearch,
    statusFilter, setStatusFilter,
    teamFilter, setTeamFilter,
    suporteFilter, setSuporteFilter,
    auditorFilter, setAuditorFilter,
    ticketKindFilter, setTicketKindFilter,
    dateType, setDateType,
    startDate, setStartDate,
    endDate, setEndDate,
    createdStartDate, setCreatedStartDate, createdEndDate, setCreatedEndDate,
    deadlineStartDate, setDeadlineStartDate, deadlineEndDate, setDeadlineEndDate,
    sortField, setSortField,
    sortDirection, setSortDirection,
    hasActiveFilters,
    clearFilters,
  };
}

export type MonitoriaFilters = ReturnType<typeof useMonitoriaFilters>;
