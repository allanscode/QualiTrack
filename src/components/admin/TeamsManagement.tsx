import React, { useState, useMemo } from 'react';
import { supabase, mockDb } from '../../lib/supabase';
import { User, Team } from '../../types';
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
  users: User[];
  loadData: () => void;
}

export default function TeamsManagement({ teams, users, loadData }: TeamsManagementProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTeam, setEditingTeam] = useState<Partial<Team>>({ name: '', sigla: '', description: '', icon: '' });
  const [saving, setSaving] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'active' | 'inactive'>('active');
  const [searchTerm, setSearchTerm] = useState('');

  const [hoveredTeamId, setHoveredTeamId] = useState<string | null>(null);
  const [selectedDrawerTeam, setSelectedDrawerTeam] = useState<Team | null>(null);
  const [selectedUserToAdd, setSelectedUserToAdd] = useState<string>('');
  const [operationLoading, setOperationLoading] = useState(false);
  const [isIconDropdownOpen, setIsIconDropdownOpen] = useState(false);

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

  const filteredTeams = useMemo(() => {
    return teams
      .filter(t => statusFilter === 'active' ? t.active !== false : t.active === false)
      .filter(t => matchesSearch(t.name, searchTerm))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [teams, statusFilter, searchTerm]);

  const isSiglaDuplicate = useMemo(() => {
    if (!editingTeam.sigla?.trim()) return false;
    return teams.some(t => t.id !== editingTeam.id && t.sigla?.toUpperCase() === editingTeam.sigla?.toUpperCase().trim());
  }, [editingTeam.sigla, editingTeam.id, teams]);

  const activeDrawerTeam = useMemo(() => {
    if (!selectedDrawerTeam) return null;
    return teams.find(t => t.id === selectedDrawerTeam.id) || selectedDrawerTeam;
  }, [selectedDrawerTeam, teams]);

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
    return users.filter(u => u.active !== false && drawerMemberIds.includes(u.id));
  }, [drawerMemberIds, users, activeDrawerTeam]);

  const availableUsersToLink = useMemo(() => {
    if (!activeDrawerTeam) return [];
    return users.filter(u => u.active !== false && !drawerMemberIds.includes(u.id));
  }, [drawerMemberIds, users, activeDrawerTeam]);

  const handleSaveTeam = async () => {
    if (!editingTeam.name) return toast.error('Por favor, informe o nome da equipe.');
    setSaving(true);
    const executeWithRetry = async (retryCount = 0): Promise<void> => {
      try {
        if (!supabase) {
          const payload = { name: editingTeam.name, sigla: editingTeam.sigla?.toUpperCase(), description: editingTeam.description || '', icon: editingTeam.icon || 'Shield', active: true };
          if (editingTeam.id) await mockDb.update('teams', editingTeam.id, payload);
          else await mockDb.insert('teams', payload);
          return;
        }

        await supabase.auth.getSession();
        const payload = { name: editingTeam.name, sigla: editingTeam.sigla?.toUpperCase(), description: editingTeam.description || '', icon: editingTeam.icon || 'Shield', active: true };

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

  const handleToggleStatus = async (id: string, active: boolean) => {
    if (!active) {
      const linkedUsers = users.filter(u => u.active !== false && u.team_ids?.includes(id));
      if (linkedUsers.length > 0) {
        return toast.error(`Não é possível desativar: ${linkedUsers.length} usuário(s) ativo(s) vinculado(s) a esta equipe. Desvincule-os primeiro.`);
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
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="relative w-64 h-10">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Buscar equipe..."
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
        </div>
        <Button 
          onClick={() => { 
            setEditingTeam({ name: '', sigla: '', description: '', icon: '' }); 
            setIsIconDropdownOpen(false);
            setIsModalOpen(true); 
          }} 
          icon={<Plus className="w-4 h-4 transition-transform duration-300 group-hover:rotate-90" />}
          className="group bg-brand-primary text-brand-on-primary hover:bg-brand-primary/95 hover:shadow-premium-lg hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] transition-all duration-200"
        >
          NOVA EQUIPE
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 items-stretch">
        {filteredTeams.map(t => {
          const TeamIcon = getTeamIcon(t.icon);
          const activeAgents = users.filter(u => u.active !== false && u.team_ids?.includes(t.id));
          const activeAgentsCount = activeAgents.length;
          
          return (
            <Card key={t.id} padding="sm" className="group hover:border-brand-accent transition-all relative flex flex-col justify-center min-h-[90px]">
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
                        <span>{activeAgentsCount} {activeAgentsCount === 1 ? 'Agente' : 'Agentes'}</span>
                        
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
                                {activeAgentsCount === 0 ? (
                                  <div className="text-xs text-slate-400 dark:text-slate-500 italic">Sem agentes vinculados</div>
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
                  </div>
                </div>
                <div className="flex gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button 
                    onClick={() => { 
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
                      <button onClick={() => handleToggleStatus(t.id, false)} className="px-1.5 py-1 rounded-md bg-error text-white text-[8px] font-black uppercase cursor-pointer">Sim</button>
                      <button onClick={() => setDeleteConfirmId(null)} className="px-1.5 py-1 rounded-md bg-surface-subtle text-brand-muted text-[8px] font-black uppercase cursor-pointer">Não</button>
                    </div>
                  ) : (
                    <button onClick={() => setDeleteConfirmId(t.id)} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/50 text-brand-muted hover:text-error dark:hover:text-red-400 transition-all cursor-pointer"><Trash2 className="w-3.5 h-3.5" /></button>
                  )}
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <Card className="max-w-md w-full relative">
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

        {activeDrawerTeam && (
          <div className="fixed inset-0 z-50 overflow-hidden">
            {/* Backdrop with transition */}
            <m.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
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
                  {/* Section B: Add Member */}
                  <div className="bg-slate-50/50 dark:bg-slate-900/30 p-4 border border-slate-100 dark:border-slate-800/60 rounded-xl space-y-3">
                    <h4 className="text-[10px] uppercase tracking-widest font-black text-slate-400 dark:text-slate-500">
                      Vincular Novo Agente
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
                            <button
                              onClick={() => handleRemoveUserFromTeamLocal(u.id)}
                              disabled={operationLoading}
                              title="Remover da equipe"
                              className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/50 text-slate-400 hover:text-error dark:hover:text-red-400 transition-all cursor-pointer opacity-0 group-hover/member:opacity-100 focus:opacity-100 disabled:opacity-50"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Footer */}
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
              </m.div>
            </div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
