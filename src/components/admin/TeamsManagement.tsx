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
import { AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import CustomSelect from '../ui/CustomSelect';

interface TeamsManagementProps {
  teams: Team[];
  users: User[];
  loadData: () => void;
}

export default function TeamsManagement({ teams, users, loadData }: TeamsManagementProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTeam, setEditingTeam] = useState<Partial<Team>>({ name: '', sigla: '', icon: 'Shield' });
  const [saving, setSaving] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'active' | 'inactive'>('active');
  const [searchTerm, setSearchTerm] = useState('');

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
      .filter(t => t.name.toLowerCase().includes(searchTerm.toLowerCase()))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [teams, statusFilter, searchTerm]);

  const handleSaveTeam = async () => {
    if (!editingTeam.name) return toast.error('Por favor, informe o nome da equipe.');
    setSaving(true);
    const executeWithRetry = async (retryCount = 0): Promise<void> => {
      try {
        if (!supabase) {
          const payload = { name: editingTeam.name, sigla: editingTeam.sigla?.toUpperCase(), icon: editingTeam.icon || 'Shield', active: true };
          if (editingTeam.id) await mockDb.update('teams', editingTeam.id, payload);
          else await mockDb.insert('teams', payload);
          return;
        }

        await supabase.auth.getSession();
        const payload = { name: editingTeam.name, sigla: editingTeam.sigla?.toUpperCase(), icon: editingTeam.icon || 'Shield', active: true };

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
      else await supabase.from('teams').update({ active }).eq('id', id);
      toast.success(active ? 'Equipe ativada!' : 'Equipe desativada!');
      setDeleteConfirmId(null);
      loadData();
    } catch (e) { toast.error('Não foi possível alterar o status da equipe.'); }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="relative w-64 h-10">
            <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-brand-muted" />
            <input
              type="text"
              placeholder="Buscar equipe..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full h-full bg-surface-card border border-surface-border rounded-2xl pl-11 pr-4 text-xs font-bold text-brand-primary placeholder:text-brand-muted/60 focus:border-brand-accent focus:outline-none transition-all"
            />
          </div>
          <div className="h-10 flex items-center">
            <CustomSelect 
              value={statusFilter}
              onChange={val => setStatusFilter(val as any)}
              options={[{ value: 'active', label: 'Ativas' }, { value: 'inactive', label: 'Desativadas' }]}
              className="w-44"
            />
          </div>
        </div>
        <Button onClick={() => { setEditingTeam({ name: '' }); setIsModalOpen(true); }} icon={<Plus className="w-4 h-4" />}>Nova Equipe</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 items-stretch">
        {filteredTeams.map(t => {
          const TeamIcon = getTeamIcon(t.icon);
          return (
            <Card key={t.id} padding="sm" className="group hover:border-brand-accent transition-all relative overflow-hidden flex flex-col justify-center min-h-[90px]">
              {t.active === false && <div className="absolute inset-0 bg-surface-bg/60 backdrop-blur-[1px] z-10 flex items-center justify-center"><Badge variant="error">Desativada</Badge></div>}
              <div className="flex justify-between items-center gap-3">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-brand-subtle flex items-center justify-center text-brand-primary shrink-0 shadow-sm group-hover:bg-brand-primary group-hover:text-brand-on-primary transition-colors">
                    <TeamIcon className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-col gap-0.5">
                      <h4 className="font-black text-[11px] text-brand-primary uppercase tracking-tight leading-tight break-words">{t.name}</h4>
                      {t.sigla && <span className="w-fit px-1 py-0.5 rounded-md bg-surface-subtle text-[7px] font-black text-brand-muted border border-surface-border">{t.sigla}</span>}
                    </div>
                    <p className="text-[9px] font-bold text-brand-muted uppercase mt-0.5 flex items-center gap-1">
                      <Users className="w-2.5 h-2.5" />
                      {users.filter(u => u.team_ids?.includes(t.id)).length} Agentes
                    </p>
                  </div>
                </div>
                <div className="flex gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => { setEditingTeam(t); setIsModalOpen(true); }} className="p-1.5 rounded-lg hover:bg-surface-subtle text-brand-muted hover:text-brand-primary transition-all"><Edit2 className="w-3.5 h-3.5" /></button>
                  {deleteConfirmId === t.id ? (
                    <div className="flex items-center gap-0.5 animate-in fade-in slide-in-from-right-2">
                      <button onClick={() => handleToggleStatus(t.id, false)} className="px-1.5 py-1 rounded-md bg-error text-white text-[8px] font-black uppercase">Sim</button>
                      <button onClick={() => setDeleteConfirmId(null)} className="px-1.5 py-1 rounded-md bg-surface-subtle text-brand-muted text-[8px] font-black uppercase">Não</button>
                    </div>
                  ) : (
                    <button onClick={() => setDeleteConfirmId(t.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-brand-muted hover:text-error transition-all"><Trash2 className="w-3.5 h-3.5" /></button>
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
            <Card className="max-w-md w-full">
              <header className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-black text-brand-primary tracking-tight uppercase">{editingTeam.id ? 'Editar Equipe' : 'Nova Equipe'}</h3>
                <button onClick={() => setIsModalOpen(false)} className="text-brand-muted hover:text-brand-primary"><X className="w-6 h-6" /></button>
              </header>
              <div className="space-y-6">
                <div className="grid grid-cols-3 gap-4">
                  <div className="col-span-2 flex flex-col gap-1">
                    <label className="text-[10px] font-black text-brand-muted uppercase tracking-widest ml-1">Nome da Equipe</label>
                    <input 
                      type="text" 
                      className="w-full bg-surface-bg border border-surface-border rounded-xl py-3 px-4 text-sm font-semibold focus:border-brand-accent focus:outline-none" 
                      value={editingTeam.name} 
                      onChange={e => setEditingTeam({ ...editingTeam, name: e.target.value })} 
                      placeholder="Ex: Suporte Nível 1"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-black text-brand-muted uppercase tracking-widest ml-1">Sigla</label>
                    <input 
                      type="text" 
                      maxLength={5}
                      className="w-full bg-surface-bg border border-surface-border rounded-xl py-3 px-4 text-sm font-black uppercase focus:border-brand-accent focus:outline-none text-center" 
                      value={editingTeam.sigla} 
                      onChange={e => setEditingTeam({ ...editingTeam, sigla: e.target.value.toUpperCase() })} 
                      placeholder="SUP1"
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-[10px] font-black text-brand-muted uppercase tracking-widest ml-1">Ícone da Equipe ({TEAM_ICONS_LIST.length} opções)</label>
                  <div className="grid grid-cols-8 gap-2 p-3 bg-surface-bg border border-surface-border rounded-2xl max-h-48 overflow-y-auto custom-scrollbar">
                    {TEAM_ICONS_LIST.map(item => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setEditingTeam({ ...editingTeam, icon: item.id })}
                        className={`p-2 rounded-lg flex items-center justify-center transition-all ${editingTeam.icon === item.id ? 'bg-brand-primary text-brand-on-primary shadow-md' : 'bg-surface-subtle text-brand-muted hover:bg-surface-border'}`}
                      >
                        <item.icon className="w-4 h-4" />
                      </button>
                    ))}
                  </div>
                </div>

                <Button className="w-full" onClick={handleSaveTeam} disabled={saving} icon={<Save className="w-4 h-4" />}>
                  {saving ? 'Salvando...' : 'Salvar Equipe'}
                </Button>
              </div>
            </Card>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
