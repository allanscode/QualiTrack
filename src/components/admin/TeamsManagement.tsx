import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { supabase, mockDb, requireAccessToken } from '../../lib/supabase';
import { User, Team, TeamGroup } from '../../types';
import { 
  Shield, 
  Plus, 
  Trash2, 
  Edit2, 
  Users, 
  Save, 
  X, 
  Search,
  ChevronDown,
  Headset,
  MessageSquare,
  Mail,
  Phone,
  Zap,
  Target,
  Rocket,
  Cpu,
  Globe,
  Award,
  Star,
  Heart,
  Smile,
  Flame,
  Layers,
  Layout,
  Package,
  Box,
  Activity,
  TrendingUp,
  BarChart,
  PieChart,
  Bell,
  Calendar,
  Camera,
  Cloud,
  Coffee,
  Compass,
  Database,
  Eye,
  Flag,
  Flashlight,
  Folder,
  Gift,
  Hammer,
  HelpCircle,
  Home,
  RefreshCw,
  Download,
  Image,
  Inbox,
  Info,
  Laptop,
  Lightbulb,
  Lock,
  Map,
  Mic,
  Monitor,
  Music,
  Navigation,
  Printer,
  Radio,
  Send,
  Settings,
  Smartphone,
  Speaker,
  Sun,
  Terminal,
  ThumbsUp,
  Wrench,
  Video,
  Wifi,
  Wind
} from 'lucide-react';
import { m, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import { matchesSearch } from '../../utils/search';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import CustomSelect from '../ui/CustomSelect';

const getInitials = (name: string) => {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0 || !parts[0]) return '';
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

interface TeamsManagementProps {
  teams: Team[];
  groups: Team[];
  teamGroups: TeamGroup[];
  users: User[];
  loadData: () => void;
  currentUser?: User | null;
}

interface ZendeskDivisionPreview {
  checked_at: string;
  scanned_memberships: number;
  rows: Array<{
    user_id: string;
    name: string;
    current_team: string;
    zendesk_groups: string[];
    zendesk_team_field: string | null;
    suggested_team: 'Cliente Final' | 'Revenda' | 'Escala' | 'Mais Pagamentos'
      | 'PJ Bruno' | 'PJ Duarte' | 'PJ SumWise' | 'PJ Trindade' | null;
    status: 'sugerido' | 'revisar' | 'pj_preservado' | 'atribuido';
    reason: string;
  }>;
}

export default function TeamsManagement({ teams, groups, teamGroups, users, loadData, currentUser }: TeamsManagementProps) {
  const isReadOnly = currentUser?.role === 'gestor_suporte';
  const canConfigurePj = currentUser?.role === 'admin' || currentUser?.role === 'gestor_qualidade';
  const [view, setView] = useState<'teams' | 'groups'>('teams');

  const userAllowedTeamIds = useMemo(() => {
    if (currentUser?.role !== 'gestor_suporte') return null;
    const ids = new Set<string>();
    if (currentUser.team_ids && Array.isArray(currentUser.team_ids)) {
      currentUser.team_ids.forEach(id => ids.add(id));
    }
    if (currentUser.primary_team_id) {
      ids.add(currentUser.primary_team_id);
    }
    return ids;
  }, [currentUser]);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTeam, setEditingTeam] = useState<Partial<Team>>({ name: '', sigla: '', description: '', icon: '' });
  const [saving, setSaving] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'active' | 'inactive'>('active');
  const [groupAssignmentFilter, setGroupAssignmentFilter] = useState<'all' | 'assigned' | 'unassigned'>('all');
  const [pjReviewerId, setPjReviewerId] = useState('');
  const [savedPjReviewerId, setSavedPjReviewerId] = useState('');
  const [savingPjReviewer, setSavingPjReviewer] = useState(false);
  const [savingApprovalManager, setSavingApprovalManager] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const [hoveredTeamId, setHoveredTeamId] = useState<string | null>(null);
  const [selectedDrawerTeam, setSelectedDrawerTeam] = useState<Team | null>(null);
  const [selectedUserToAdd, setSelectedUserToAdd] = useState<string>('');
  const [selectedGroupToAdd, setSelectedGroupToAdd] = useState<string>('');
  const [operationLoading, setOperationLoading] = useState(false);
  const [syncingZendesk, setSyncingZendesk] = useState(false);
  const [checkingZendeskMembers, setCheckingZendeskMembers] = useState(false);
  const [zendeskDivisionPreview, setZendeskDivisionPreview] = useState<ZendeskDivisionPreview | null>(null);
  const [divisionFilter, setDivisionFilter] = useState<'all' | ZendeskDivisionPreview['rows'][number]['status']>('revisar');
  const [groupSavingId, setGroupSavingId] = useState<string | null>(null);
  const [conversionTargets, setConversionTargets] = useState<Record<string, string>>({});
  const [isIconDropdownOpen, setIsIconDropdownOpen] = useState(false);

  useEffect(() => {
    const hasModal = isModalOpen || !!selectedDrawerTeam;
    window.dispatchEvent(new CustomEvent('qualitrack:modal', { detail: { open: hasModal } }));
    return () => {
      if (hasModal) {
        window.dispatchEvent(new CustomEvent('qualitrack:modal', { detail: { open: false } }));
      }
    };
  }, [isModalOpen, selectedDrawerTeam]);

  useEffect(() => {
    if (!canConfigurePj) return;
    let cancelled = false;
    const loadPjReviewer = async () => {
      const result = supabase
        ? await supabase.from('pj_review_settings').select('reviewer_id').eq('id', true).maybeSingle()
        : { data: (await mockDb.get('pj_review_settings')).data?.[0] || null, error: null };
      if (result.error) {
        toast.error('Não foi possível carregar o revisor PJ.');
        return;
      }
      if (!cancelled) {
        const id = result.data?.reviewer_id || '';
        setPjReviewerId(id);
        setSavedPjReviewerId(id);
      }
    };
    void loadPjReviewer();
    return () => { cancelled = true; };
  }, [canConfigurePj]);

  const savePjReviewer = async () => {
    if (!pjReviewerId) return toast.error('Selecione um revisor PJ ativo.');
    setSavingPjReviewer(true);
    try {
      if (supabase) {
        const { error } = await supabase.from('pj_review_settings')
          .upsert({ id: true, reviewer_id: pjReviewerId });
        if (error) throw error;
      } else {
        const { error } = await mockDb.upsert('pj_review_settings', { id: 'pj', reviewer_id: pjReviewerId });
        if (error) throw error;
      }
      setSavedPjReviewerId(pjReviewerId);
      toast.success('Revisor PJ atualizado para os próximos encaminhamentos.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível atualizar o revisor PJ.');
    } finally {
      setSavingPjReviewer(false);
    }
  };

  const TEAM_ICONS_LIST = [
    { id: 'Shield', icon: Shield },
    { id: 'Headset', icon: Headset },
    { id: 'MessageSquare', icon: MessageSquare },
    { id: 'Mail', icon: Mail },
    { id: 'Phone', icon: Phone },
    { id: 'Zap', icon: Zap },
    { id: 'Target', icon: Target },
    { id: 'Rocket', icon: Rocket },
    { id: 'Cpu', icon: Cpu },
    { id: 'Globe', icon: Globe },
    { id: 'Award', icon: Award },
    { id: 'Star', icon: Star },
    { id: 'Heart', icon: Heart },
    { id: 'Smile', icon: Smile },
    { id: 'Flame', icon: Flame },
    { id: 'Layers', icon: Layers },
    { id: 'Layout', icon: Layout },
    { id: 'Package', icon: Package },
    { id: 'Box', icon: Box },
    { id: 'Activity', icon: Activity },
    { id: 'TrendingUp', icon: TrendingUp },
    { id: 'BarChart', icon: BarChart },
    { id: 'PieChart', icon: PieChart },
    { id: 'Bell', icon: Bell },
    { id: 'Calendar', icon: Calendar },
    { id: 'Camera', icon: Camera },
    { id: 'Cloud', icon: Cloud },
    { id: 'Coffee', icon: Coffee },
    { id: 'Compass', icon: Compass },
    { id: 'Database', icon: Database },
    { id: 'Eye', icon: Eye },
    { id: 'Flag', icon: Flag },
    { id: 'Flashlight', icon: Flashlight },
    { id: 'Folder', icon: Folder },
    { id: 'Gift', icon: Gift },
    { id: 'Hammer', icon: Hammer },
    { id: 'HelpCircle', icon: HelpCircle },
    { id: 'Home', icon: Home },
    { id: 'Image', icon: Image },
    { id: 'Inbox', icon: Inbox },
    { id: 'Info', icon: Info },
    { id: 'Laptop', icon: Laptop },
    { id: 'Lightbulb', icon: Lightbulb },
    { id: 'Lock', icon: Lock },
    { id: 'Map', icon: Map },
    { id: 'Mic', icon: Mic },
    { id: 'Monitor', icon: Monitor },
    { id: 'Music', icon: Music },
    { id: 'Navigation', icon: Navigation },
    { id: 'Printer', icon: Printer },
    { id: 'Radio', icon: Radio },
    { id: 'Send', icon: Send },
    { id: 'Settings', icon: Settings },
    { id: 'Smartphone', icon: Smartphone },
    { id: 'Speaker', icon: Speaker },
    { id: 'Sun', icon: Sun },
    { id: 'Terminal', icon: Terminal },
    { id: 'ThumbsUp', icon: ThumbsUp },
    { id: 'Wrench', icon: Wrench },
    { id: 'Video', icon: Video },
    { id: 'Wifi', icon: Wifi },
    { id: 'Wind', icon: Wind },
  ];

  const getTeamIcon = (iconName?: string) => {
    const item = TEAM_ICONS_LIST.find(i => i.id === iconName);
    return item ? item.icon : Shield;
  };

  const getTeamPath = (team: Team): string => {
    const parent = teams.find(candidate => candidate.id === team.parent_team_id);
    return parent ? `${parent.name} / ${team.name}` : team.name;
  };

  const filteredTeams = useMemo(() => {
    return teams
      .filter(t => userAllowedTeamIds ? userAllowedTeamIds.has(t.id) : true)
      .filter(t => statusFilter === 'active' ? t.active !== false : t.active === false)
      .filter(t => matchesSearch(t.name, searchTerm))
      .sort((a, b) => {
        const aRoot = teams.find(team => team.id === a.parent_team_id) || a;
        const bRoot = teams.find(team => team.id === b.parent_team_id) || b;
        const aHasSubteams = teams.some(team => team.parent_team_id === aRoot.id);
        const bHasSubteams = teams.some(team => team.parent_team_id === bRoot.id);
        return Number(bHasSubteams) - Number(aHasSubteams) || aRoot.name.localeCompare(bRoot.name)
          || Number(Boolean(a.parent_team_id)) - Number(Boolean(b.parent_team_id))
          || a.name.localeCompare(b.name);
      });
  }, [teams, userAllowedTeamIds, statusFilter, searchTerm]);

  const visibleGroups = useMemo(() => groups
    .filter(group => !userAllowedTeamIds || teamGroups.some(link => link.group_id === group.id && userAllowedTeamIds.has(link.team_id)))
    .filter(group => statusFilter === 'active' ? group.active !== false : group.active === false)
    .filter(group => groupAssignmentFilter === 'all' || (groupAssignmentFilter === 'assigned') === teamGroups.some(link => link.group_id === group.id))
    .filter(group => !searchTerm || matchesSearch(group.name, searchTerm)
      || teamGroups.some(link => link.group_id === group.id && teams.some(team => team.id === link.team_id && matchesSearch(team.name, searchTerm))))
    .sort((a, b) => a.name.localeCompare(b.name)),
  [groups, teams, teamGroups, userAllowedTeamIds, statusFilter, groupAssignmentFilter, searchTerm]);

  const legacyZendeskTeams = useMemo(() => teams
    .filter(team => team.zendesk_group_id != null)
    .sort((a, b) => a.name.localeCompare(b.name)), [teams]);

  const groupsWithoutZendeskId = useMemo(() => groups.filter(group => group.active !== false && group.zendesk_group_id == null).length, [groups]);
  const groupsWithoutTeam = useMemo(() => groups.filter(group => group.active !== false && !teamGroups.some(link => link.group_id === group.id)).length, [groups, teamGroups]);
  const webPostoRoot = useMemo(() => teams.find(team => team.kind !== 'group' && team.name === 'WebPosto' && !team.parent_team_id), [teams]);
  const unassignedWebAgents = useMemo(() => webPostoRoot
    ? users.filter(user => user.active !== false && user.role === 'suporte' && user.primary_team_id === webPostoRoot.id).length
    : 0, [users, webPostoRoot]);

  const isSiglaDuplicate = useMemo(() => {
    if (!editingTeam.sigla?.trim()) return false;
    return teams.some(t => t.id !== editingTeam.id && t.sigla?.toUpperCase() === editingTeam.sigla?.toUpperCase().trim());
  }, [editingTeam.sigla, editingTeam.id, teams]);

  const activeDrawerTeam = useMemo(() => {
    if (!selectedDrawerTeam) return null;
    return teams.find(t => t.id === selectedDrawerTeam.id) || selectedDrawerTeam;
  }, [selectedDrawerTeam, teams]);

  const drawerGroups = useMemo(() => activeDrawerTeam
    ? groups.filter(group => group.active !== false && teamGroups.some(link => link.team_id === activeDrawerTeam.id && link.group_id === group.id))
      .sort((a, b) => a.name.localeCompare(b.name))
    : [], [activeDrawerTeam, groups, teamGroups]);
  const availableDrawerGroups = useMemo(() => groups
    .filter(group => group.active !== false && !drawerGroups.some(linked => linked.id === group.id))
    .sort((a, b) => a.name.localeCompare(b.name)), [groups, drawerGroups]);

  const [drawerMemberIds, setDrawerMemberIds] = useState<string[]>([]);

  React.useEffect(() => {
    if (activeDrawerTeam) {
      const initialIds = users
        .filter(u => u.active !== false && u.team_ids?.includes(activeDrawerTeam.id!))
        .map(u => u.id);
      setDrawerMemberIds(initialIds);
    } else {
      setDrawerMemberIds([]);
    }
  }, [activeDrawerTeam, users]);

  const drawerTeamAgents = useMemo(() => {
    if (!activeDrawerTeam) return [];
    return users.filter(u => u.active !== false && u.role !== 'gestor_suporte' && drawerMemberIds.includes(u.id));
  }, [drawerMemberIds, users, activeDrawerTeam]);

  const availableManagers = useMemo(() => users
    .filter(user => user.active !== false && user.role === 'gestor_suporte')
    .sort((a, b) => a.name.localeCompare(b.name)), [users]);

  const drawerManagers = useMemo(() => availableManagers.filter(manager => drawerMemberIds.includes(manager.id)),
    [availableManagers, drawerMemberIds]);

  const saveApprovalManager = async (managerId: string) => {
    if (!activeDrawerTeam || isReadOnly) return;
    setSavingApprovalManager(true);
    try {
      if (supabase) {
        const { error } = await supabase.from('teams').update({ approval_manager_id: managerId || null }).eq('id', activeDrawerTeam.id);
        if (error) throw error;
      } else {
        const result = await mockDb.update('teams', activeDrawerTeam.id, { approval_manager_id: managerId || null });
        if (result.error) throw result.error;
      }
      toast.success('Gestor aprovador atualizado.');
      loadData();
    } catch (error) {
      console.error('Erro ao atualizar gestor aprovador:', error);
      toast.error('Salve primeiro o vínculo do gestor com a equipe e tente novamente.');
    } finally {
      setSavingApprovalManager(false);
    }
  };

  const availableUsersToLink = useMemo(() => {
    if (!activeDrawerTeam) return [];
    return users.filter(u => u.active !== false && u.role !== 'gestor_suporte' && !drawerMemberIds.includes(u.id));
  }, [drawerMemberIds, users, activeDrawerTeam]);

  const handleSaveTeam = async () => {
    if (!editingTeam.name) return toast.error('Por favor, informe o nome da equipe.');
    setSaving(true);
    const executeWithRetry = async (retryCount = 0): Promise<void> => {
      try {
        if (!supabase) {
          const payload = { name: editingTeam.name, sigla: editingTeam.sigla?.toUpperCase(), description: editingTeam.description || '', icon: editingTeam.icon || 'Shield', active: true, kind: 'team' as const, parent_team_id: editingTeam.parent_team_id || null, requires_pj_review: editingTeam.requires_pj_review === true };
          if (editingTeam.id) await mockDb.update('teams', editingTeam.id, payload);
          else await mockDb.insert('teams', payload);
          return;
        }

        await supabase.auth.getSession();
        const payload = { name: editingTeam.name, sigla: editingTeam.sigla?.toUpperCase(), description: editingTeam.description || '', icon: editingTeam.icon || 'Shield', active: true, kind: 'team' as const, parent_team_id: editingTeam.parent_team_id || null, requires_pj_review: editingTeam.requires_pj_review === true };

        const operation = (async () => {
          const { error } = await supabase.from('teams').upsert([{ ...(editingTeam.id ? { id: editingTeam.id } : {}), ...payload }]);
          if (error) throw error;
        })();

        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 15000));
        await Promise.race([operation, timeoutPromise]);
      } catch (err: any) {
        if (err.message === 'timeout' && retryCount < 2) {
          await new Promise(res => setTimeout(res, 1000 * (retryCount + 1)));
          return executeWithRetry(retryCount + 1);
        }
        throw err;
      }
    };

    try {
      await executeWithRetry();
      toast.success('Equipe salva com sucesso!');
      setIsModalOpen(false);
      loadData();
    } catch (e: any) {
      console.error('Erro definitivo ao salvar equipe:', e);
      toast.error(e.message === 'timeout' ? 'O servidor não respondeu. Verifique sua conexão.' : 'Não foi possível salvar a equipe.');
    } finally {
      setSaving(false);
    }
  };

  // A sincronização associa os IDs do Zendesk aos grupos já importados.
  const handleSyncZendeskGroups = async () => {
    if (!supabase) {
      toast.error('Sincronização com Zendesk indisponível em modo mock/offline.');
      return;
    }
    setSyncingZendesk(true);
    try {
      const accessToken = await requireAccessToken();
      const { data, error } = await supabase.functions.invoke('helpdesk-queue', {
        headers: { Authorization: `Bearer ${accessToken}` },
        body: { action: 'sync_zendesk_groups' }
      });
      if (error || data?.success === false) {
        throw new Error(data?.error || error?.message || 'Falha ao sincronizar grupos do Zendesk');
      }
      const created: string[] = data?.created || [];
      toast.success(created.length > 0
        ? `${created.length} novo(s) grupo(s) importado(s). IDs do Zendesk atualizados.`
        : 'Grupos e IDs do Zendesk sincronizados.');
      loadData();
    } catch (e: any) {
      console.error('Erro ao sincronizar grupos do Zendesk:', e);
      toast.error(e?.message || 'Não foi possível sincronizar os grupos do Zendesk.');
    } finally {
      setSyncingZendesk(false);
    }
  };

  const handleCheckZendeskMembers = async () => {
    if (!supabase) return toast.error('Consulta ao Zendesk indisponível em modo offline.');
    setCheckingZendeskMembers(true);
    try {
      const accessToken = await requireAccessToken();
      const { data, error } = await supabase.functions.invoke('helpdesk-queue', {
        headers: { Authorization: `Bearer ${accessToken}` },
        body: { action: 'preview_webposto_memberships' },
      });
      if (error || data?.success === false || !Array.isArray(data?.rows)) {
        throw new Error(data?.error || error?.message || 'Falha ao consultar vínculos no Zendesk.');
      }
      setZendeskDivisionPreview(data as ZendeskDivisionPreview);
      setDivisionFilter('revisar');
      toast.success('Vínculos de agentes conferidos no Zendesk.');
    } catch (error) {
      console.error('Erro ao conferir vínculos do Zendesk:', error);
      toast.error(error instanceof Error ? error.message : 'Não foi possível conferir os agentes.');
    } finally {
      setCheckingZendeskMembers(false);
    }
  };

  const handleAddGroupTeam = async (groupId: string, teamId: string) => {
    if (!teamId) return;
    setGroupSavingId(groupId);
    try {
      if (!supabase) {
        const result = await mockDb.insert('team_groups', { group_id: groupId, team_id: teamId });
        if (result.error) throw result.error;
      } else {
        const { error } = await supabase.from('team_groups')
          .insert({ group_id: groupId, team_id: teamId });
        if (error) throw error;
      }
      toast.success('Equipe autorizada a atender este grupo.');
      setSelectedGroupToAdd('');
      loadData();
    } catch (error) {
      console.error('Erro ao vincular grupo:', error);
      toast.error('Não foi possível vincular a equipe ao grupo.');
    } finally {
      setGroupSavingId(null);
    }
  };

  const handleRemoveGroupTeam = async (groupId: string, teamId: string) => {
    setGroupSavingId(groupId);
    try {
      if (!supabase) {
        const link = (await mockDb.get('team_groups')).data?.find(item => item.group_id === groupId && item.team_id === teamId);
        if (link?.id) await mockDb.delete('team_groups', link.id);
      } else {
        const { error } = await supabase.from('team_groups').delete()
          .eq('group_id', groupId).eq('team_id', teamId);
        if (error) throw error;
      }
      toast.success('Vínculo removido.');
      loadData();
    } catch (error) {
      console.error('Erro ao remover vínculo:', error);
      toast.error('Não foi possível remover o vínculo.');
    } finally {
      setGroupSavingId(null);
    }
  };

  const handleConvertTeamToGroup = async (team: Team) => {
    const destinationTeamId = conversionTargets[team.id];
    if (!destinationTeamId || destinationTeamId === team.id) return;
    const peopleToReassign = users.filter(user => user.primary_team_id === team.id
      || (user.active !== false && ['suporte', 'gestor_suporte'].includes(user.role)
        && user.team_ids?.includes(team.id)
        && !user.team_ids?.some(id => id !== team.id && teams.some(candidate => candidate.id === id))));
    if (peopleToReassign.length > 0) {
      toast.error('Defina a equipe principal e o vínculo dos agentes e gestores antes de converter.');
      return;
    }
    setGroupSavingId(team.id);
    try {
      if (!supabase) {
        const oldLinks = (await mockDb.get('user_teams')).data || [];
        for (const link of oldLinks.filter(link => link.team_id === team.id)) {
          await mockDb.delete('user_teams', link.id);
        }
        for (const user of users.filter(user => user.team_ids?.includes(team.id))) {
          await mockDb.update('users', user.id, {
            team_ids: user.team_ids?.filter(id => id !== team.id),
          });
        }
        const monitorias = (await mockDb.get('monitorias')).data || [];
        for (const monitoria of monitorias.filter(m => m.team_id === team.id)) {
          const ownerId = users.find(user => user.id === monitoria.evaluated_id)?.primary_team_id;
          if (!ownerId || ownerId === team.id) throw new Error('Monitoria sem equipe principal do agente.');
          await mockDb.update('monitorias', monitoria.id, {
            team_id: ownerId, team_name: teams.find(t => t.id === ownerId)?.name,
          });
        }
        const forms = (await mockDb.get('forms')).data || [];
        for (const form of forms.filter(form => form.team_id === team.id)) {
          await mockDb.update('forms', form.id, { team_id: destinationTeamId });
        }
        const feedbacks = (await mockDb.get('agent_feedbacks')).data || [];
        for (const feedback of feedbacks.filter(feedback => feedback.team_id === team.id)) {
          const ownerId = users.find(user => user.id === feedback.agent_id)?.primary_team_id;
          if (!ownerId || ownerId === team.id) throw new Error('Feedback sem equipe principal do agente.');
          await mockDb.update('agent_feedbacks', feedback.id, { team_id: ownerId });
        }
        const result = await mockDb.update('teams', team.id, { kind: 'group' });
        if (result.error) throw result.error;
        await mockDb.insert('team_groups', { group_id: team.id, team_id: destinationTeamId });
      } else {
        const { error } = await supabase.rpc('convert_team_to_group', {
          p_group_id: team.id, p_destination_team_id: destinationTeamId,
        });
        if (error) throw error;
      }
      toast.success(`${team.name} convertido em grupo. As monitorias seguem a equipe principal de cada agente.`);
      setConversionTargets(prev => { const next = { ...prev }; delete next[team.id]; return next; });
      loadData();
    } catch (error) {
      console.error('Erro ao converter equipe:', error);
      toast.error('Não foi possível converter este cadastro em grupo.');
    } finally {
      setGroupSavingId(null);
    }
  };

  const handleToggleStatus = async (id: string, active: boolean) => {
    if (!active) {
      const linkedUsers = users.filter(u => u.active !== false && u.team_ids?.includes(id));
      if (linkedUsers.length > 0) {
        return toast.error(`Não é possível desativar: ${linkedUsers.length} usuário(s) ativo(s) vinculado(s) a esta equipe. Desvincule-os primeiro.`);
      }
      if (teamGroups.some(link => link.team_id === id)) {
        return toast.error('Remova os grupos de tickets vinculados antes de desativar esta equipe.');
      }
    }

    try {
      if (!supabase) await mockDb.update('teams', id, { active });
      else {
        const { error } = await supabase.from('teams').update({ active }).eq('id', id);
        if (error) throw error;
      }
      toast.success(active ? 'Equipe ativada!' : 'Equipe desativada!');
      setDeleteConfirmId(null);
      loadData();
    } catch (e) { toast.error('Não foi possível alterar o status da equipe.'); }
  };

  const handleAddUserToTeamLocal = () => {
    if (!selectedUserToAdd) return;
    if (!drawerMemberIds.includes(selectedUserToAdd)) {
      setDrawerMemberIds(prev => [...prev, selectedUserToAdd]);
    }
    setSelectedUserToAdd('');
  };

  const handleRemoveUserFromTeamLocal = (userId: string) => {
    setDrawerMemberIds(prev => prev.filter(id => id !== userId));
  };

  const syncTeamUsers = async (teamId: string, userIds: string[]) => {
    let existing: any[] = [];
    if (supabase) {
      const { data } = await supabase.from('user_teams').select('*').eq('team_id', teamId);
      existing = data || [];
    } else {
      const { data } = await mockDb.get('user_teams');
      existing = (data || []).filter((ut: any) => ut.team_id === teamId);
    }
    const existingUserIds = existing.map((ut: any) => ut.user_id);
    const toAdd = userIds.filter(id => !existingUserIds.includes(id));
    const toRemove = existing.filter((ut: any) => !userIds.includes(ut.user_id));

    if (toRemove.length > 0) {
      const removeIds = toRemove.map((ut: any) => ut.id);
      if (supabase) {
        const { error } = await supabase.from('user_teams').delete().in('id', removeIds);
        if (error) throw error;
      } else {
        for (const rid of removeIds) await mockDb.delete('user_teams', rid);
      }
    }
    if (toAdd.length > 0) {
      const inserts = toAdd.map(user_id => ({ user_id, team_id: teamId }));
      if (supabase) {
        const { error } = await supabase.from('user_teams').insert(inserts);
        if (error) throw error;
      } else {
        for (const ins of inserts) await mockDb.insert('user_teams', ins);
      }
    }
  };

  const handleSaveTeamUsers = async () => {
    if (!activeDrawerTeam) return;
    setOperationLoading(true);
    try {
      await syncTeamUsers(activeDrawerTeam.id!, drawerMemberIds);
      toast.success('Alterações salvas com sucesso!');
      setSelectedDrawerTeam(null);
      loadData();
    } catch (e: any) {
      console.error(e);
      toast.error('Não foi possível salvar as alterações dos membros.');
    } finally {
      setOperationLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-lg font-bold text-brand-primary">Equipes e grupos</h2>
        <p className="text-sm text-brand-muted">{view === 'teams'
          ? 'Cada equipe define seus gestores, agentes e a visibilidade das monitorias.'
          : 'Os grupos vêm do Zendesk e podem ser atendidos por várias equipes.'}</p>
      </div>

      {view === 'teams' && canConfigurePj && teams.some(team => team.requires_pj_review) && (
        <section className="rounded-2xl border border-surface-border bg-surface-card px-4 py-4 sm:px-5" aria-labelledby="pj-review-settings-title">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div className="max-w-xl space-y-1">
              <h3 id="pj-review-settings-title" className="text-sm font-bold text-brand-primary">Fluxo das equipes PJ</h3>
              <p className="text-xs leading-relaxed text-brand-muted">Notas abaixo de 75%: a aprovação ou contestação do gestor PJ segue para Victor, que aprova ou reprova o parecer antes da Gestão da Qualidade. Notas a partir de 75% são concluídas diretamente.</p>
              <p className="text-xs text-brand-muted">A troca de revisor vale para os próximos casos. Os já encaminhados permanecem com o responsável registrado.</p>
            </div>
            <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-end md:w-auto">
              <CustomSelect
                label="Revisor PJ"
                value={pjReviewerId}
                onChange={setPjReviewerId}
                options={users.filter(user => user.active !== false && ['suporte', 'gestor_suporte'].includes(user.role))
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map(user => ({ value: user.id, label: user.name }))}
                placeholder="Selecione um agente"
                className="w-full sm:w-64"
              />
              <Button onClick={savePjReviewer}
                disabled={savingPjReviewer || !pjReviewerId || pjReviewerId === savedPjReviewerId}>
                {savingPjReviewer ? 'Salvando...' : 'Salvar revisor'}
              </Button>
            </div>
          </div>
        </section>
      )}
      <div className="flex gap-1 border-b border-surface-border" role="tablist" aria-label="Organização do atendimento">
        <button type="button" role="tab" aria-selected={view === 'teams'} onClick={() => setView('teams')}
          className={`px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors ${view === 'teams' ? 'border-brand-primary text-brand-primary' : 'border-transparent text-brand-muted hover:text-brand-primary'}`}>
          Equipes <span className="ml-1 text-xs opacity-70">{filteredTeams.length}</span>
        </button>
        <button type="button" role="tab" aria-selected={view === 'groups'} onClick={() => setView('groups')}
          className={`px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors ${view === 'groups' ? 'border-brand-primary text-brand-primary' : 'border-transparent text-brand-muted hover:text-brand-primary'}`}>
          Grupos do Zendesk <span className="ml-1 text-xs opacity-70">{visibleGroups.length}</span>
        </button>
      </div>
      {view === 'teams' && !isReadOnly && unassignedWebAgents > 0 && (
        <div className="rounded-xl border border-brand-accent/40 bg-brand-accent/5 px-4 py-3 text-sm text-brand-primary" role="status">
          <strong>{unassignedWebAgents} agente{unassignedWebAgents === 1 ? '' : 's'} CLT ainda na WebPosto principal.</strong>{' '}
          Defina a equipe principal de cada um em Usuários: Cliente Final, Revenda ou outra subequipe. O grupo do ticket não determina essa divisão.
        </div>
      )}
      {view === 'teams' && currentUser?.role === 'admin' && webPostoRoot && (
        <section className="rounded-xl border border-surface-border bg-surface-card p-4" aria-label="Conferência dos agentes no Zendesk">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-brand-primary">Conferir divisão CLT e PJ</h3>
              <p className="text-xs text-brand-muted">Consulta os grupos e o campo “Vinculado à equipe” no Zendesk para identificar CLT, Escala e PJ.</p>
            </div>
            <Button type="button" variant="outline" onClick={handleCheckZendeskMembers} disabled={checkingZendeskMembers}>
              {checkingZendeskMembers ? 'Conferindo...' : 'Conferir no Zendesk'}
            </Button>
          </div>
          {zendeskDivisionPreview && (
            <div className="mt-4 space-y-3">
              <p className="text-xs text-brand-muted">{zendeskDivisionPreview.scanned_memberships} vínculos consultados. Filtre os casos que precisam de decisão.</p>
              <div className="flex flex-wrap gap-2" aria-label="Filtrar conferência Zendesk">
                {([
                  ['revisar', 'Revisar'],
                  ['sugerido', 'Sugestões'],
                  ['pj_preservado', 'PJ / campo'],
                  ['atribuido', 'Já atribuídos'],
                  ['all', 'Todos'],
                ] as const).map(([value, label]) => {
                  const count = value === 'all' ? zendeskDivisionPreview.rows.length
                    : zendeskDivisionPreview.rows.filter(row => row.status === value).length;
                  return <button key={value} type="button" aria-pressed={divisionFilter === value}
                    onClick={() => setDivisionFilter(value)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${divisionFilter === value
                      ? 'border-brand-primary bg-brand-primary text-brand-on-primary'
                      : 'border-surface-border bg-surface-card text-brand-muted hover:text-brand-primary'}`}>
                    {label} {count}
                  </button>;
                })}
              </div>
              <div className="max-h-96 space-y-2 overflow-y-auto pr-1">
                {!zendeskDivisionPreview.rows.some(row => divisionFilter === 'all' || row.status === divisionFilter) && (
                  <p className="rounded-lg border border-dashed border-surface-border p-4 text-xs text-brand-muted">Nenhum agente nesta categoria.</p>
                )}
                {zendeskDivisionPreview.rows.filter(row => divisionFilter === 'all' || row.status === divisionFilter).map(row => (
                  <div key={row.user_id} className="rounded-lg border border-surface-border bg-surface-subtle/40 p-3 sm:grid sm:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)_minmax(0,1fr)] sm:gap-3">
                    <div className="min-w-0"><strong className="block truncate text-xs text-brand-primary" title={row.name}>{row.name}</strong><span className="text-[11px] text-brand-muted">Atual: {row.current_team}</span></div>
                    <p className="mt-1 break-words text-[11px] text-brand-muted sm:mt-0">{row.zendesk_groups.join(' · ') || 'Sem grupos correspondentes'}{row.zendesk_team_field && <span className="block mt-1 font-semibold text-brand-primary">Campo equipe: {row.zendesk_team_field}</span>}</p>
                    <div className="mt-1 text-[11px] sm:mt-0"><strong className="text-brand-primary">{row.status === 'pj_preservado' ? 'PJ / campo' : row.status === 'atribuido' ? 'Equipe definida' : row.suggested_team || 'Revisar'}</strong><p className="text-brand-muted">{row.reason}</p></div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-brand-muted">Confirme as sugestões na equipe principal em Usuários. A regra de PJ usa o campo “Vinculado à equipe”, independentemente dos grupos de tickets.</p>
            </div>
          )}
        </section>
      )}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="relative w-64 h-10">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder={view === 'teams' ? 'Buscar equipe...' : 'Buscar grupo ou equipe...'}
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full h-full bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 rounded-lg pl-9 pr-4 text-sm font-normal text-slate-900 dark:text-slate-50 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-slate-400 dark:focus:border-slate-600 focus:outline-none focus:ring-0 transition-all shadow-sm"
            />
          </div>
          <div className="flex items-center animate-in fade-in duration-200">
            <CustomSelect 
              value={statusFilter}
              onChange={val => setStatusFilter(val as any)}
              options={[{ value: 'active', label: 'Ativas' }, { value: 'inactive', label: 'Desativadas' }]}
              className="w-44"
            />
          </div>
          {view === 'groups' && (
            <CustomSelect
              value={groupAssignmentFilter}
              onChange={value => setGroupAssignmentFilter(value as 'all' | 'assigned' | 'unassigned')}
              options={[
                { value: 'all', label: 'Todos os grupos' },
                { value: 'unassigned', label: 'Sem equipe' },
                { value: 'assigned', label: 'Com equipe' },
              ]}
              className="w-44"
            />
          )}
        </div>
        {!isReadOnly && (
          <div className="flex items-center gap-3">
            {view === 'groups' && currentUser?.role === 'admin' && (
              <Button
                variant="ghost"
                onClick={handleSyncZendeskGroups}
                disabled={syncingZendesk}
                icon={syncingZendesk ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                title="Importa grupos por ID do Zendesk e identifica equipes antigas para conversão"
              >
                {syncingZendesk ? 'SINCRONIZANDO...' : 'SINCRONIZAR GRUPOS'}
              </Button>
            )}
            {view === 'teams' && <Button
              onClick={() => {
                setEditingTeam({ name: '', sigla: '', description: '', icon: '' });
                setIsIconDropdownOpen(false);
                setIsModalOpen(true);
              }}
              icon={<Plus className="w-4 h-4 transition-transform duration-300 group-hover:rotate-90" />}
              className="group bg-brand-primary text-brand-on-primary hover:bg-brand-primary/95 hover:shadow-premium-lg hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] transition-all duration-200"
            >
              NOVA EQUIPE
            </Button>}
          </div>
        )}
      </div>

      {view === 'groups' && <>
      {groupsWithoutZendeskId > 0 && currentUser?.role === 'admin' && (
        <p className="rounded-lg border border-surface-border bg-surface-subtle px-4 py-3 text-sm text-brand-muted">
          {groupsWithoutZendeskId} grupo(s) importado(s) ainda sem ID do Zendesk. Use <strong className="text-brand-primary">Sincronizar grupos</strong> para associá-los pelo nome.
        </p>
      )}
      <section className="space-y-3" aria-labelledby="zendesk-groups-title">
        <div className="flex items-baseline justify-between gap-3">
          <h3 id="zendesk-groups-title" className="text-sm font-bold text-brand-primary">Grupos de tickets</h3>
          <span className="text-xs text-brand-muted">{visibleGroups.length} grupo(s){!isReadOnly && groupsWithoutTeam > 0 ? ` · ${groupsWithoutTeam} sem equipe` : ''}</span>
        </div>
        {visibleGroups.length === 0 ? (
          <div className="rounded-xl border border-dashed border-surface-border px-4 py-6 text-sm text-brand-muted">
            {isReadOnly
              ? 'Nenhum grupo vinculado às suas equipes nesta visualização.'
              : groupAssignmentFilter === 'unassigned' && !searchTerm
                ? 'Todos os grupos desta visualização já estão vinculados a uma equipe.'
                : groups.length === 0
                  ? 'Nenhum grupo cadastrado. Sincronize o Zendesk para importar os grupos.'
                  : 'Nenhum grupo encontrado. Ajuste a busca ou os filtros.'}
          </div>
        ) : (
          <div className="divide-y divide-surface-border rounded-xl border border-surface-border bg-surface-card">
            {visibleGroups.map(group => {
              const linkedTeamIds = teamGroups.filter(link => link.group_id === group.id).map(link => link.team_id);
              const linkedTeams = teams.filter(team => linkedTeamIds.includes(team.id));
              return (
                <div key={group.id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-brand-primary">{group.name}</p>
                    <p className="text-xs text-brand-muted">{group.zendesk_group_id ? `Zendesk #${group.zendesk_group_id}` : 'ID do Zendesk pendente'} · {linkedTeams.length ? `${linkedTeams.length} equipe(s) atendem` : 'Sem equipe vinculada'}</p>
                    {linkedTeams.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {linkedTeams.map(team => (
                          <span key={team.id} className="inline-flex items-center gap-1 rounded-md border border-surface-border bg-surface-subtle px-2 py-1 text-xs text-brand-primary">
                            {getTeamPath(team)}
                            {!isReadOnly && <button type="button" aria-label={`Remover ${team.name} do grupo ${group.name}`}
                              disabled={groupSavingId === group.id} onClick={() => handleRemoveGroupTeam(group.id, team.id)}
                              className="rounded-sm p-0.5 text-brand-muted hover:text-error focus-visible:outline-2 focus-visible:outline-brand-primary"><X className="h-3 w-3" /></button>}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  {!isReadOnly && (
                    <div className="w-full sm:w-64">
                      <CustomSelect
                        value=""
                        onChange={value => handleAddGroupTeam(group.id, value)}
                        options={teams.filter(t => t.active !== false && !linkedTeamIds.includes(t.id)).map(team => ({ value: team.id, label: getTeamPath(team) }))}
                        disabled={groupSavingId === group.id}
                        placeholder="Adicionar equipe"
                        size="sm"
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {!isReadOnly && legacyZendeskTeams.length > 0 && (
        <section className="space-y-3" aria-labelledby="legacy-groups-title">
          <div>
            <h3 id="legacy-groups-title" className="text-sm font-bold text-brand-primary">Cadastros antigos para organizar</h3>
            <p className="mt-1 text-xs text-brand-muted">Primeiro atribua cada agente e gestor à sua equipe real em Usuários. Depois escolha a primeira equipe que atenderá o grupo.</p>
          </div>
          <div className="divide-y divide-surface-border rounded-xl border border-surface-border bg-surface-card">
            {legacyZendeskTeams.map(team => {
              const blockers = users.filter(user => user.primary_team_id === team.id
                || (user.active !== false && ['suporte', 'gestor_suporte'].includes(user.role)
                  && user.team_ids?.includes(team.id)
                  && !user.team_ids?.some(id => id !== team.id && teams.some(candidate => candidate.id === id))));
              return <div key={team.id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-brand-primary">{team.name}</p>
                  <p className="text-xs text-brand-muted">Grupo Zendesk #{team.zendesk_group_id}</p>
                  {blockers.length > 0 && <p className="mt-1 text-xs text-functional-warning">{blockers.length} pessoa(s) precisam de equipe real: {blockers.slice(0, 3).map(user => user.name).join(', ')}{blockers.length > 3 ? '…' : ''}</p>}
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <CustomSelect
                    value={conversionTargets[team.id] || ''}
                    onChange={value => setConversionTargets(prev => ({ ...prev, [team.id]: value }))}
                    options={teams.filter(candidate => candidate.id !== team.id && candidate.active !== false)
                      .map(candidate => ({ value: candidate.id, label: getTeamPath(candidate) }))}
                    placeholder="Primeira equipe do grupo"
                    className="w-full sm:w-52"
                    size="sm"
                  />
                  <Button variant="ghost" disabled={!conversionTargets[team.id] || blockers.length > 0 || groupSavingId === team.id}
                    onClick={() => handleConvertTeamToGroup(team)}>Converter em grupo</Button>
                </div>
              </div>;
            })}
          </div>
        </section>
      )}
      </>}

      {view === 'teams' && <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 items-stretch">
        {filteredTeams.map((t, index) => {
          const TeamIcon = getTeamIcon(t.icon);
          const parentTeam = teams.find(team => team.id === t.parent_team_id);
          const rootTeam = parentTeam || t;
          const previousTeam = filteredTeams[index - 1];
          const previousRootId = previousTeam?.parent_team_id || previousTeam?.id;
          const startsSection = rootTeam.id !== previousRootId && teams.some(team => team.parent_team_id === rootTeam.id);
          const activeAgents = users.filter(u => u.active !== false && u.team_ids?.includes(t.id));
          const activeAgentsCount = activeAgents.filter(u => u.role === 'suporte').length;
          const activeManagersCount = activeAgents.filter(u => u.role === 'gestor_suporte').length;
          const linkedGroups = groups.filter(group => group.active !== false && teamGroups.some(link => link.team_id === t.id && link.group_id === group.id))
            .sort((a, b) => a.name.localeCompare(b.name));
          const teamGroupCount = linkedGroups.length;
          
          return (
            <React.Fragment key={t.id}>
            {startsSection && (
              <div className="col-span-full flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-surface-border pb-2 pt-2">
                <h3 className="text-base font-bold text-brand-primary">{rootTeam.name}</h3>
                <span className="text-xs text-brand-muted">Equipe principal e suas gestões</span>
              </div>
            )}
            <Card 
              padding="sm" 
              onClick={() => setSelectedDrawerTeam(t)}
              className={`group hover:border-brand-accent transition-all relative flex flex-col justify-center min-h-[90px] cursor-pointer hover:shadow-md ${t.parent_team_id ? 'border-brand-accent/30' : ''}`}
            >
              {t.active === false && (
                <div className="absolute inset-0 bg-surface-bg/60 backdrop-blur-[1px] z-10 flex items-center justify-center rounded-card">
                  <Badge variant="error">Desativada</Badge>
                </div>
              )}
              <div className="flex justify-between items-center gap-3">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="w-10 h-10 flex items-center justify-center shrink-0">
                    <TeamIcon className="w-5 h-5 text-slate-400 dark:text-slate-500 group-hover:text-slate-600 dark:group-hover:text-slate-300 transition-colors" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-col gap-0.5">
                      <h4 className="font-black text-[11px] text-brand-primary uppercase tracking-tight leading-tight break-words">{t.name}</h4>
                      {t.requires_pj_review && <span className="w-fit rounded-md bg-brand-accent/10 px-1.5 py-0.5 text-[9px] font-semibold text-brand-primary">Revisão PJ abaixo de 75%</span>}
                      {t.approval_manager_id && <span className="text-[10px] text-brand-muted">Aprovação: {users.find(user => user.id === t.approval_manager_id)?.name || 'gestor designado'}</span>}
                      {t.parent_team_id && <span className="text-[10px] text-brand-muted">{parentTeam ? `Subequipe de ${parentTeam.name}` : 'Subequipe'}</span>}
                      {t.sigla && <span className="w-fit px-1 py-0.5 rounded-md bg-surface-subtle text-[7px] font-black text-brand-muted border border-surface-border">{t.sigla}</span>}
                    </div>
                    <div className="mt-1 flex relative">
                      <span 
                        onMouseEnter={() => setHoveredTeamId(t.id)}
                        onMouseLeave={() => setHoveredTeamId(null)}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedDrawerTeam(t);
                        }}
                        className="inline-flex items-center gap-1 bg-slate-50 dark:bg-slate-900/60 text-slate-600 dark:text-slate-400 border border-slate-200/60 dark:border-slate-800/60 px-2 py-0.5 rounded-lg text-[11px] font-medium leading-none cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors duration-200 relative group/badge"
                      >
                        <Users className="w-3 h-3 text-slate-400 dark:text-slate-500" />
                        <span>{activeAgentsCount} {activeAgentsCount === 1 ? 'Agente' : 'Agentes'} · {activeManagersCount} {activeManagersCount === 1 ? 'Gestor' : 'Gestores'}</span>
                        
                        {/* Hover Popover */}
                        <AnimatePresence>
                          {hoveredTeamId === t.id && (
                            <m.div
                              initial={{ opacity: 0, y: 10, scale: 0.95 }}
                              animate={{ opacity: 1, y: 0, scale: 1 }}
                              exit={{ opacity: 0, y: 5, scale: 0.95 }}
                              transition={{ duration: 0.15 }}
                              className="absolute left-0 bottom-full mb-2 w-56 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shadow-premium p-3 z-30 pointer-events-none text-left"
                            >
                              <div className="text-[10px] uppercase tracking-widest font-black text-slate-400 dark:text-slate-500 mb-2 border-b border-slate-100 dark:border-slate-800 pb-1">
                                Agentes da Equipe
                              </div>
                              <div className="max-h-48 overflow-y-auto thin-scrollbar space-y-2">
                                {activeAgents.length === 0 ? (
                                  <div className="text-xs text-slate-400 dark:text-slate-500 italic">Sem pessoas vinculadas</div>
                                ) : (
                                  activeAgents.map(u => (
                                    <div key={u.id} className="flex items-center gap-2">
                                      <div className="w-6 h-6 rounded-full bg-brand-primary/10 text-brand-primary border border-brand-primary/20 flex items-center justify-center text-[9px] font-bold shrink-0">
                                        {getInitials(u.name)}
                                      </div>
                                      <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 truncate">{u.name}</span>
                                    </div>
                                  ))
                                )}
                              </div>
                            </m.div>
                          )}
                        </AnimatePresence>
                      </span>
                    </div>
                    <div className="mt-2 border-t border-surface-border pt-2">
                      <p className="text-[11px] font-semibold text-brand-muted">{teamGroupCount} grupo{teamGroupCount === 1 ? '' : 's'} do Zendesk</p>
                      {teamGroupCount > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {linkedGroups.slice(0, 3).map(group => (
                            <span key={group.id} className="max-w-full truncate rounded-md bg-surface-subtle px-1.5 py-0.5 text-[10px] text-brand-primary" title={group.name}>{group.name}</span>
                          ))}
                          {teamGroupCount > 3 && <span className="px-1 py-0.5 text-[10px] text-brand-muted">+{teamGroupCount - 3}</span>}
                        </div>
                      )}
                      {!isReadOnly && <button type="button" onClick={(event) => { event.stopPropagation(); setSelectedDrawerTeam(t); }}
                        className="mt-1 inline-block text-left text-[10px] font-semibold text-brand-primary underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-brand-accent">
                        Gerenciar grupos e pessoas
                      </button>}
                    </div>
                  </div>
                </div>
                {!isReadOnly && (
                  <div className="flex gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button 
                      onClick={(event) => {
                        event.stopPropagation();
                        setEditingTeam(t); 
                        setIsIconDropdownOpen(false);
                        setIsModalOpen(true); 
                      }} 
                      className="p-1.5 rounded-lg hover:bg-surface-subtle text-brand-muted hover:text-brand-primary transition-all cursor-pointer"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    {deleteConfirmId === t.id ? (
                      <div className="flex items-center gap-0.5 animate-in fade-in slide-in-from-right-2">
                        <button onClick={(event) => { event.stopPropagation(); handleToggleStatus(t.id, false); }} className="px-1.5 py-1 rounded-md bg-error text-white text-[8px] font-black uppercase cursor-pointer">Sim</button>
                        <button onClick={(event) => { event.stopPropagation(); setDeleteConfirmId(null); }} className="px-1.5 py-1 rounded-md bg-surface-subtle text-brand-muted text-[8px] font-black uppercase cursor-pointer">Não</button>
                      </div>
                    ) : (
                      <button onClick={(event) => { event.stopPropagation(); setDeleteConfirmId(t.id); }} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/50 text-brand-muted hover:text-error dark:hover:text-red-400 transition-all cursor-pointer"><Trash2 className="w-3.5 h-3.5" /></button>
                    )}
                  </div>
                )}
              </div>
            </Card>
            </React.Fragment>
          );
        })}
      </div>}

      {createPortal(
        <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-2 sm:p-4 md:p-6 bg-black/75 backdrop-blur-xs animate-fade-in">
            <Card className="max-w-md w-full max-h-[92vh] flex flex-col shadow-2xl overflow-y-auto no-scrollbar border border-surface-border relative">
              <header className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-black text-brand-primary tracking-tight uppercase">{editingTeam.id ? 'Editar Equipe' : 'Nova Equipe'}</h3>
                <button onClick={() => { setIsModalOpen(false); setIsIconDropdownOpen(false); }} className="text-brand-muted hover:text-brand-primary transition-colors"><X className="w-6 h-6" /></button>
              </header>
              <div className="space-y-6">
                <div className="space-y-4">
                  <div className="flex flex-col">
                    <label className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400 font-semibold mb-1.5 ml-0.5 block">Nome da Equipe</label>
                    <input 
                      type="text" 
                      className="w-full bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 rounded-lg py-2 px-3 text-sm font-medium text-slate-900 dark:text-slate-50 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-slate-400 dark:focus:border-slate-600 focus:outline-none focus:ring-0 shadow-sm transition-all" 
                      value={editingTeam.name} 
                      onChange={e => setEditingTeam({ ...editingTeam, name: e.target.value })} 
                      placeholder="Ex: Suporte Nível 1"
                    />
                  </div>

                  <div className="space-y-1">
                    <CustomSelect
                      label="Equipe superior"
                      value={editingTeam.parent_team_id || ''}
                      onChange={value => setEditingTeam({ ...editingTeam, parent_team_id: value || null })}
                      options={[
                        { value: '', label: 'Equipe principal' },
                        ...teams.filter(team => team.active !== false && !team.parent_team_id && team.id !== editingTeam.id)
                          .map(team => ({ value: team.id, label: team.name })),
                      ]}
                      disabled={Boolean(editingTeam.id && teams.some(team => team.parent_team_id === editingTeam.id))}
                    />
                    <p className="text-xs text-brand-muted">Agrupa a equipe no painel. Cada gestor continua vendo apenas seus próprios agentes.</p>
                  </div>

                  {canConfigurePj && (
                    <label className="flex items-start gap-3 rounded-xl border border-surface-border bg-surface-subtle p-3 text-xs text-brand-primary">
                      <input type="checkbox" checked={editingTeam.requires_pj_review === true}
                        onChange={event => setEditingTeam({ ...editingTeam, requires_pj_review: event.target.checked })}
                        className="mt-0.5 size-4 accent-brand-primary" />
                      <span><strong className="block">Usar fluxo de aprovação PJ</strong>
                        O gestor encaminha aprovação ou contestação ao revisor antes da decisão final da Qualidade.</span>
                    </label>
                  )}
                  
                  <div className="flex flex-col">
                    <label className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400 font-semibold mb-1.5 ml-0.5 block">Sigla</label>
                    <input 
                      type="text" 
                      maxLength={4}
                      className={`w-full bg-white dark:bg-slate-900/40 border rounded-lg py-2 px-3 text-sm font-medium placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-0 shadow-sm transition-all uppercase ${
                        isSiglaDuplicate 
                          ? 'border-error focus:border-error text-error dark:text-error' 
                          : 'border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-50 focus:border-slate-400 dark:focus:border-slate-600'
                      }`} 
                      value={editingTeam.sigla || ''} 
                      onChange={e => setEditingTeam({ ...editingTeam, sigla: e.target.value.toUpperCase() })} 
                      placeholder="SUP1"
                    />
                    {isSiglaDuplicate && (
                      <span className="text-[10px] text-error font-semibold mt-1.5 ml-0.5 block leading-none animate-in fade-in duration-200">
                        Esta sigla já está em uso
                      </span>
                    )}
                  </div>

                  <div className="flex flex-col">
                    <label className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400 font-semibold mb-1.5 ml-0.5 block">Descrição da Equipe</label>
                    <textarea 
                      rows={2}
                      className="w-full bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 rounded-lg py-2 px-3 text-sm font-medium text-slate-900 dark:text-slate-50 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-slate-400 dark:focus:border-slate-600 focus:outline-none focus:ring-0 shadow-sm transition-all resize-none" 
                      value={editingTeam.description || ''} 
                      onChange={e => setEditingTeam({ ...editingTeam, description: e.target.value })} 
                      placeholder="Descreva brevemente o escopo ou propósito desta equipe..."
                    />
                  </div>

                  <div className="flex flex-col gap-1.5 relative">
                    <label className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400 font-semibold ml-0.5 block">
                      Visual do Ícone
                    </label>
                    <button
                      type="button"
                      onClick={() => setIsIconDropdownOpen(!isIconDropdownOpen)}
                      className={`w-full flex items-center justify-between bg-slate-50 dark:bg-slate-900/20 border rounded-lg py-3 px-4 text-sm font-medium h-14 text-left transition-all cursor-pointer focus:outline-none ${
                        isIconDropdownOpen 
                          ? 'border-brand-primary ring-2 ring-brand-primary/10' 
                          : 'border-slate-200/80 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                      }`}
                    >
                      {editingTeam.icon ? (
                        <div className="flex items-center gap-2.5">
                          <div className="w-10 h-10 flex items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-900/60 text-slate-600 dark:text-slate-400">
                            {React.createElement(getTeamIcon(editingTeam.icon), { className: "w-5 h-5" })}
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2.5">
                          <div className="w-10 h-10 flex items-center justify-center rounded-lg border-2 border-dashed border-slate-300 dark:border-slate-700 text-slate-400">
                            <Plus className="w-4 h-4 text-slate-400" />
                          </div>
                          <span className="font-medium text-slate-400 dark:text-slate-500">
                            Selecionar ícone
                          </span>
                        </div>
                      )}
                      <ChevronDown className={`w-5 h-5 text-slate-400 transition-transform duration-200 ${isIconDropdownOpen ? 'rotate-180' : ''}`} />
                    </button>

                    {/* Popover flutuante para cima com a grade de 62 ícones */}
                    <AnimatePresence>
                      {isIconDropdownOpen && (
                        <>
                          {/* Backdrop invisível para clique fora */}
                          <div className="fixed inset-0 z-40" onClick={() => setIsIconDropdownOpen(false)} />
                          <m.div
                            initial={{ opacity: 0, scale: 0.95, y: 10 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 10 }}
                            transition={{ duration: 0.15 }}
                            className="absolute bottom-full left-0 right-0 mb-2 p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shadow-premium z-50 animate-in fade-in zoom-in-95 duration-150"
                          >
                            <div className="text-[10px] uppercase tracking-widest font-black text-slate-400 dark:text-slate-500 mb-2 pb-1 border-b border-slate-100 dark:border-slate-800">
                              Selecionar Ícone
                            </div>
                            <div className="min-h-[200px] max-h-[220px] overflow-y-auto thin-scrollbar p-1">
                              <div className="grid grid-cols-6 gap-2">
                                {TEAM_ICONS_LIST.map(item => (
                                  <button
                                    key={item.id}
                                    type="button"
                                    onClick={() => {
                                      setEditingTeam({ ...editingTeam, icon: item.id });
                                      setIsIconDropdownOpen(false);
                                    }}
                                    title={item.id}
                                    className={`p-2.5 rounded-lg flex items-center justify-center transition-all duration-200 active:scale-[0.9] cursor-pointer ${
                                      editingTeam.icon === item.id 
                                        ? 'bg-brand-primary text-brand-on-primary shadow-md' 
                                        : 'bg-slate-50 dark:bg-slate-900/40 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-600 dark:hover:text-slate-200 border border-slate-200/40 dark:border-slate-800/40'
                                    }`}
                                  >
                                    {React.createElement(item.icon, { className: "w-5 h-5" })}
                                  </button>
                                ))}
                              </div>
                            </div>
                          </m.div>
                        </>
                      )}
                    </AnimatePresence>
                  </div>
                </div>

                <Button 
                  className="w-full group bg-brand-primary text-brand-on-primary hover:bg-brand-primary/95 hover:shadow-premium-lg hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] disabled:bg-surface-border dark:disabled:bg-surface-border disabled:text-brand-muted dark:disabled:text-brand-muted disabled:opacity-100 disabled:transform-none disabled:shadow-none transition-all duration-200 py-2.5 px-8" 
                  onClick={handleSaveTeam} 
                  disabled={saving || !editingTeam.name?.trim() || !editingTeam.icon || isSiglaDuplicate} 
                  icon={<Save className="w-4 h-4 transition-transform duration-200 group-hover:scale-110" />}
                >
                  {saving ? 'SALVANDO...' : 'SALVAR'}
                </Button>
              </div>
            </Card>
          </div>
        )}
        </AnimatePresence>,
        document.body
      )}

      {createPortal(
        <AnimatePresence>
        {activeDrawerTeam && (
          <div className="fixed inset-0 z-[9999] overflow-hidden">
            {/* Backdrop with transition */}
            <m.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="absolute inset-0 bg-black/75 backdrop-blur-xs"
              onClick={() => setSelectedDrawerTeam(null)}
            />
            
            {/* Sliding Drawer */}
            <div className="absolute inset-y-0 right-0 max-w-full flex pl-10">
              <m.div
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 220 }}
                className="w-screen max-w-md h-full bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 shadow-premium flex flex-col relative"
              >
                {/* Header */}
                <header className="p-6 border-b border-slate-100 dark:border-slate-800/80 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-brand-primary/10 text-brand-primary flex items-center justify-center">
                      {React.createElement(getTeamIcon(activeDrawerTeam.icon), { className: "w-5 h-5" })}
                    </div>
                    <div>
                      <h3 className="text-base font-black text-brand-primary uppercase tracking-tight leading-tight">{activeDrawerTeam.name}</h3>
                      {activeDrawerTeam.sigla && (
                        <span className="inline-block mt-1 px-1.5 py-0.5 rounded-md bg-surface-subtle text-[8px] font-black text-brand-muted border border-surface-border uppercase">{activeDrawerTeam.sigla}</span>
                      )}
                    </div>
                  </div>
                  <button 
                    onClick={() => setSelectedDrawerTeam(null)} 
                    className="p-1.5 rounded-lg hover:bg-surface-subtle text-brand-muted hover:text-brand-primary transition-all cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </header>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6 thin-scrollbar">
                  <section className="space-y-2 rounded-xl border border-surface-border bg-surface-card p-4" aria-label="Gestor aprovador da equipe">
                    <h4 className="text-sm font-bold text-brand-primary">Gestor das aprovações</h4>
                    <p className="text-xs text-brand-muted">Define quem pode aprovar ou contestar as monitorias desta equipe. As regras de quando pedir aprovação continuam iguais.</p>
                    <CustomSelect value={activeDrawerTeam.approval_manager_id || ''} onChange={saveApprovalManager}
                      options={[{ value: '', label: 'Qualquer gestor vinculado' }, ...drawerManagers.map(manager => ({ value: manager.id, label: manager.name }))]}
                      placeholder="Qualquer gestor vinculado" disabled={isReadOnly || savingApprovalManager || operationLoading}
                      aria-label="Gestor das aprovações" className="w-full" size="sm" />
                  </section>
                  <section className="space-y-3 rounded-xl border border-surface-border bg-surface-subtle/50 p-4" aria-label="Grupos do Zendesk da equipe">
                    <div>
                      <h4 className="text-sm font-bold text-brand-primary">Grupos do Zendesk ({drawerGroups.length})</h4>
                      <p className="text-xs text-brand-muted">Esta equipe pode atender tickets destes grupos. Um grupo pode servir a várias equipes.</p>
                    </div>
                    {drawerGroups.length === 0 ? (
                      <p className="text-xs text-brand-muted">Nenhum grupo vinculado.</p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {drawerGroups.map(group => (
                          <span key={group.id} className="inline-flex max-w-full items-center gap-1 rounded-lg border border-surface-border bg-surface-card px-2 py-1 text-xs text-brand-primary">
                            <span className="truncate" title={group.name}>{group.name}</span>
                            {!isReadOnly && <button type="button" aria-label={`Remover grupo ${group.name} desta equipe`}
                              disabled={groupSavingId !== null} onClick={() => handleRemoveGroupTeam(group.id, activeDrawerTeam.id)}
                              className="rounded p-0.5 text-brand-muted hover:bg-surface-subtle hover:text-error disabled:opacity-50"><X className="h-3.5 w-3.5" /></button>}
                          </span>
                        ))}
                      </div>
                    )}
                    {!isReadOnly && <div className="flex gap-2">
                      <CustomSelect value={selectedGroupToAdd} onChange={setSelectedGroupToAdd}
                        options={availableDrawerGroups.map(group => ({ value: group.id, label: group.name }))}
                        placeholder="Buscar grupo do Zendesk..." aria-label="Adicionar grupo do Zendesk" className="min-w-0 flex-1" size="sm" />
                      <Button type="button" onClick={() => handleAddGroupTeam(selectedGroupToAdd, activeDrawerTeam.id)}
                        disabled={!selectedGroupToAdd || groupSavingId !== null} className="shrink-0" aria-label="Vincular grupo à equipe">
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>}
                  </section>
                  <section className="space-y-3" aria-label="Gestores responsáveis">
                    <div>
                      <h4 className="text-sm font-bold text-brand-primary">Gestores responsáveis</h4>
                      <p className="text-xs text-brand-muted">Cada gestor vê as monitorias dos agentes desta equipe.</p>
                    </div>
                    {availableManagers.length === 0 ? (
                      <p className="rounded-lg border border-dashed border-surface-border p-3 text-xs text-brand-muted">Nenhum gestor de atendimento ativo cadastrado.</p>
                    ) : (
                      <div className="space-y-1">
                        {availableManagers.map(manager => (
                          <label key={manager.id} className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 hover:bg-surface-subtle">
                            <input type="checkbox" checked={drawerMemberIds.includes(manager.id)}
                              disabled={isReadOnly || operationLoading}
                              onChange={event => setDrawerMemberIds(previous => event.target.checked
                                ? [...previous, manager.id] : previous.filter(id => id !== manager.id))}
                              className="h-4 w-4 accent-brand-primary" />
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-medium text-brand-primary">{manager.name}</span>
                              <span className="block truncate text-xs text-brand-muted">{manager.email}</span>
                            </span>
                          </label>
                        ))}
                      </div>
                    )}
                  </section>
                  <p className="rounded-lg border border-surface-border px-3 py-2 text-xs text-brand-muted">
                    Para mudar quem acompanha as monitorias de um agente, altere sua <strong>Equipe principal</strong> em Usuários. O vínculo de membro abaixo apenas adiciona acesso à equipe.
                  </p>
                  {/* Section B: Add Member */}
                  {!isReadOnly && (
                    <div className="bg-slate-50/50 dark:bg-slate-900/30 p-4 border border-slate-100 dark:border-slate-800/60 rounded-xl space-y-3">
                      <h4 className="text-[10px] uppercase tracking-widest font-black text-slate-400 dark:text-slate-500">
                        Vincular Agente
                      </h4>
                      
                      <div className="flex gap-2">
                        <CustomSelect
                          value={selectedUserToAdd}
                          onChange={(val) => setSelectedUserToAdd(val)}
                          options={availableUsersToLink.map(u => ({ value: u.id, label: `${u.name} (${u.email})` }))}
                          placeholder="Buscar usuário..."
                          className="flex-1"
                          size="sm"
                        />
                        <Button
                          onClick={handleAddUserToTeamLocal}
                          disabled={!selectedUserToAdd || operationLoading}
                          className="h-9 px-4 shrink-0 text-[10px] font-black uppercase tracking-wider rounded-lg bg-brand-primary text-brand-on-primary hover:bg-brand-primary/90 transition-all duration-200 active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-1 group"
                        >
                          <Plus className="w-3.5 h-3.5 transition-transform duration-300 group-hover:rotate-90" />
                          <span>Adicionar</span>
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Section A: Members List */}
                  <div className="space-y-3">
                    <h4 className="text-[10px] uppercase tracking-widest font-black text-slate-400 dark:text-slate-500 mb-2">
                      Membros Atuais ({drawerTeamAgents.length})
                    </h4>
                    
                    {drawerTeamAgents.length === 0 ? (
                      <div className="p-8 text-center border-2 border-dashed border-slate-100 dark:border-slate-800 rounded-lg text-sm text-slate-400 dark:text-slate-500">
                        Nenhum membro ativo vinculado a esta equipe.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {drawerTeamAgents.map(u => (
                          <div 
                            key={u.id} 
                            className="flex items-center justify-between p-3 rounded-lg border border-slate-100 dark:border-slate-800/60 bg-slate-50/50 dark:bg-slate-900/30 hover:border-slate-200 dark:hover:border-slate-800 transition-all duration-200 group/member"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="w-8 h-8 rounded-full bg-brand-primary/10 text-brand-primary border border-brand-primary/20 flex items-center justify-center text-xs font-bold shrink-0">
                                {getInitials(u.name)}
                              </div>
                              <div className="min-w-0">
                                <p className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">{u.name}</p>
                                <p className="text-[10px] text-slate-400 dark:text-slate-500 truncate">{u.email}</p>
                              </div>
                            </div>
                            {!isReadOnly && (
                              <button
                                onClick={() => handleRemoveUserFromTeamLocal(u.id)}
                                disabled={operationLoading}
                                title="Remover da equipe"
                                className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/50 text-brand-muted hover:text-error dark:hover:text-red-400 transition-all cursor-pointer opacity-0 group-hover/member:opacity-100 focus:opacity-100 disabled:opacity-50"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Footer */}
                {!isReadOnly && (
                  <footer className="p-6 border-t border-slate-100 dark:border-slate-800/80 bg-white dark:bg-slate-900 flex items-center justify-end shrink-0">
                    <Button
                      onClick={handleSaveTeamUsers}
                      disabled={operationLoading}
                      className="w-full group bg-brand-primary text-brand-on-primary hover:bg-brand-primary/95 hover:shadow-premium-lg hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] disabled:bg-surface-border dark:disabled:bg-surface-border disabled:text-brand-muted dark:disabled:text-brand-muted disabled:opacity-100 disabled:transform-none disabled:shadow-none transition-all duration-200 py-2.5 px-8"
                      icon={<Save className="w-4 h-4 transition-transform duration-200 group-hover:scale-110" />}
                    >
                      {operationLoading ? 'SALVANDO...' : 'SALVAR ALTERAÇÕES'}
                    </Button>
                  </footer>
                )}
              </m.div>
            </div>
          </div>
        )}
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
}
