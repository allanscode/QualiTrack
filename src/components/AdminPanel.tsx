import React, { useState, useEffect, useMemo } from 'react';
import { supabase, mockDb } from '../lib/supabase';
import { User, Team, EvaluationForm, AccessRequest, FormSection, Question } from '../types';
import { 
  Users, 
  ClipboardList, 
  Plus, 
  Trash2, 
  Edit2, 
  Shield, 
  UserPlus, 
  Save, 
  X, 
  Check, 
  RefreshCw, 
  Search, 
  AlertOctagon, 
  AlertTriangle,
  AlertCircle,
  BarChart3,
  Mail,
  User as UserIcon,
  ShieldCheck,
  ChevronRight,
  ChevronLeft,
  ArrowRight,
  Pencil,
  Key,
  MessageSquare,
  Headset,
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
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import QualityConfigManagement from './QualityConfigManagement';
import Card from './ui/Card';
import Button from './ui/Button';
import Badge from './ui/Badge';
import CustomSelect from './ui/CustomSelect';

export default function AdminPanel({ user: currentUser }: { user: User | null }) {
  const [activeSubTab, setActiveSubTab] = useState<'users' | 'teams' | 'forms' | 'requests' | 'qualidade'>('users');
  const [users, setUsers] = useState<User[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [forms, setForms] = useState<EvaluationForm[]>([]);
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [loading, setLoading] = useState(true);

  // Heartbeat global para manter a sessão viva a cada 5 minutos em toda a aba Admin
  useEffect(() => {
    if (!supabase) return;
    const interval = setInterval(async () => {
      try {
        await supabase.auth.getSession();
        console.log('[Admin] Sessão validada pelo heartbeat global.');
      } catch (e) {
        console.warn('[Admin] Falha no heartbeat de sessão.');
      }
    }, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const loadAllData = async () => {
    setLoading(true);
    try {
      if (!supabase) {
        const [u, t, f, r] = await Promise.all([
          mockDb.get('users'),
          mockDb.get('teams'),
          mockDb.get('forms'),
          mockDb.get('access_requests')
        ]);
        setUsers(u.data || []);
        setTeams(t.data || []);
        setForms(f.data || []);
        setRequests(r.data || []);
      } else {
        const executeWithRetry = async (retryCount = 0): Promise<any[]> => {
          try {
            console.log(`[Admin] Carregando dados (Tentativa ${retryCount + 1})...`);
            
            // Garantir que temos uma sessão válida antes de tentar buscar
            const { data: { session } } = await supabase.auth.getSession();
            if (!session && retryCount < 1) {
              console.warn('[Admin] Sessão não encontrada. Tentando refresh...');
              await supabase.auth.refreshSession();
            }

            const fetchPromise = Promise.all([
              supabase.from('users').select('*'),
              supabase.from('teams').select('*'),
              supabase.from('forms').select('*')
            ]);
            
            const timeoutPromise = new Promise((_, reject) => 
              setTimeout(() => reject(new Error('timeout')), 30000)
            );

            const results = await Promise.race([fetchPromise, timeoutPromise]) as any[];
            
            const errorRes = results.find(r => r.error);
            if (errorRes) throw errorRes.error;

            return results;
          } catch (err: any) {
            console.error(`[Admin] Erro na tentativa ${retryCount + 1}:`, err);
            
            if (retryCount < 2) {
              const waitTime = 1000 * (retryCount + 1);
              console.warn(`[Admin] Retentando em ${waitTime/1000}s...`);
              await new Promise(res => setTimeout(res, waitTime));
              return executeWithRetry(retryCount + 1);
            }
            throw err;
          }
        };

        const [u, t, f] = await executeWithRetry();
        
        // Só atualiza o estado se tivermos dados válidos
        if (u.data) setUsers(u.data);
        if (t.data) setTeams(t.data);
        if (f.data) setForms(f.data);

        // Busca de solicitações separada (mais propensa a erro se RLS estiver OFF)
        try {
          const { data: r, error: re } = await supabase.from('access_requests').select('*').order('created_at', { ascending: false });
          if (!re && r) setRequests(r);
        } catch (e) {
          console.warn('[Admin] Falha ao carregar solicitações de acesso.');
        }
      }
    } catch (e) {
      console.error("Error loading admin data:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAllData();
  }, [activeSubTab]);

  return (
    <div className="space-y-6 animate-fade-in">

      <div className="flex items-center gap-2 bg-surface-card p-1.5 rounded-2xl border border-surface-border shadow-premium-sm w-fit overflow-x-auto no-scrollbar">
        {[
          { key: 'users', label: 'Usuários', icon: Users },
          { key: 'teams', label: 'Equipes', icon: Shield },
          { key: 'forms', label: 'Formulários', icon: ClipboardList },
          { key: 'requests', label: 'Solicitações', icon: UserPlus },
          { key: 'qualidade', label: 'Configurações', icon: BarChart3 },
        ].map((item) => {
          const Icon = item.icon;
          const active = activeSubTab === item.key;
          return (
            <button
              key={item.key}
              onClick={() => setActiveSubTab(item.key as any)}
              className={`
                flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all
                ${active 
                  ? 'bg-brand-primary text-brand-on-primary shadow-premium' 
                  : 'text-brand-muted hover:text-brand-primary hover:bg-surface-subtle'}
              `}
            >
              <Icon className="w-4 h-4" />
              {item.label}
            </button>
          );
        })}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={activeSubTab}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2 }}
        >
          {activeSubTab === 'users' && <UsersManagement users={users} teams={teams} loadData={loadAllData} />}
          {activeSubTab === 'teams' && <TeamsManagement teams={teams} users={users} loadData={loadAllData} />}
          {activeSubTab === 'forms' && <FormsManagement currentUser={currentUser} teams={teams} loadData={loadAllData} />}
          {activeSubTab === 'requests' && <RequestsManagement requests={requests} users={users} teams={teams} loadData={loadAllData} />}
          {activeSubTab === 'qualidade' && <QualityConfigManagement />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function UsersManagement({ users, teams, loadData }: { users: User[], teams: Team[], loadData: () => void }) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'active' | 'inactive'>('active');
  const [editingUser, setEditingUser] = useState<{ name: string, email: string, role: string, team_ids: string[], password?: string, id?: string }>({ name: '', email: '', role: 'suporte', team_ids: [], password: '' });
  const [saving, setSaving] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [teamSearch, setTeamSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [teamFilter, setTeamFilter] = useState('');

  const filteredUsers = useMemo(() => {
    return users
      .filter(u => statusFilter === 'active' ? u.active !== false : u.active === false)
      .filter(u => roleFilter === '' ? true : u.role === roleFilter)
      .filter(u => teamFilter === '' ? true : (u.team_ids || []).includes(teamFilter))
      .filter(u =>
        u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        u.email.toLowerCase().includes(searchTerm.toLowerCase())
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [users, statusFilter, searchTerm, roleFilter, teamFilter]);

  const handleSaveUser = async () => {
    if (!editingUser.name || !editingUser.email) return;
    setSaving(true);
    const executeWithRetry = async (retryCount = 0): Promise<void> => {
      try {
        if (!supabase) {
          const emailLower = editingUser.email.toLowerCase();
          const payload = { ...editingUser, email: emailLower, active: true, team_ids: editingUser.team_ids || [] };
          if (editingUser.id) await mockDb.update('users', editingUser.id, payload);
          else await mockDb.insert('users', { ...payload, id: emailLower });
          return;
        }

        // 1. Aquecimento de sessão (garante que o cliente está pronto)
        await supabase.auth.getSession();

        const emailLower = editingUser.email.toLowerCase();
        const payload = {
          name: editingUser.name,
          email: emailLower,
          role: editingUser.role,
          active: true,
          team_ids: editingUser.team_ids || []
        };

        // 2. Definição da Operação
        const operation = (async () => {
          if (editingUser.id) {
            const { error } = await supabase.from('users').update(payload).eq('id', editingUser.id);
            if (error) throw error;
          } else {
            const { data, error: funcError } = await supabase.functions.invoke('admin-invite-user', { body: payload });
            if (funcError) throw funcError;
            if (data?.success === false) throw new Error(data.details?.message || 'Erro ao convidar usuário');
          }
        })();

        // 3. Corrida com Timeout
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 15000));
        await Promise.race([operation, timeoutPromise]);

      } catch (err: any) {
        // Se for timeout e ainda houver tentativas, tenta novamente em 1 segundo
        if (err.message === 'timeout' && retryCount < 2) {
          console.warn(`Tentativa ${retryCount + 1} de salvamento de usuário falhou por timeout. Retentando...`);
          await new Promise(res => setTimeout(res, 1000));
          return executeWithRetry(retryCount + 1);
        }
        throw err;
      }
    };

    try {
      await executeWithRetry();
      toast.success(editingUser.id ? 'Usuário atualizado!' : 'Convite enviado com sucesso!');
      setIsModalOpen(false);
      loadData();
    } catch (e: any) {
      console.error('Erro definitivo ao gerenciar usuário:', e);
      if (e.message === 'timeout') {
        toast.error('O servidor não respondeu após várias tentativas. Por favor, verifique sua conexão ou tente recarregar a página (F5).');
      } else {
        toast.error(e.message || 'Erro ao salvar usuário.');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleResetPassword = async (email: string) => {
    try {
      if (!supabase) {
        toast.info(`[MOCK] Email de recuperação enviado para ${email}`);
        return;
      }
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin,
      });
      if (error) throw error;
      toast.success('Email de recuperação enviado!');
    } catch (e: any) {
      toast.error('Não foi possível enviar o email de recuperação.');
    }
  };

  const handleToggleStatus = async (id: string, active: boolean) => {
    try {
      if (!supabase) await mockDb.update('users', id, { active });
      else await supabase.from('users').update({ active }).eq('id', id);
      toast.success(active ? 'Usuário reativado!' : 'Usuário desativado!');
      setDeleteConfirmId(null);
      loadData();
    } catch (e) { toast.error('Não foi possível alterar o status do usuário.'); }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="relative w-64 h-10">
            <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-brand-muted" />
            <input
              type="text"
              placeholder="Buscar usuário..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full h-full bg-surface-card border border-surface-border rounded-2xl pl-11 pr-4 text-xs font-bold text-brand-primary placeholder:text-brand-muted/60 focus:border-brand-accent focus:outline-none transition-all"
            />
          </div>
          <div className="h-10 flex items-center gap-2">
            <CustomSelect 
              value={statusFilter}
              onChange={val => setStatusFilter(val as any)}
              options={[{ value: 'active', label: 'Ativos' }, { value: 'inactive', label: 'Desativados' }]}
              className="w-40"
            />
            <CustomSelect 
              value={roleFilter}
              onChange={val => setRoleFilter(val as string)}
              options={[
                { value: '', label: 'Todos os Perfis' }, 
                { value: 'admin', label: 'Administrador' },
                { value: 'suporte', label: 'Agente de Atendimento' },
                { value: 'qualidade', label: 'Monitor de Qualidade' },
                { value: 'gestor_suporte', label: 'Supervisor de Atendimento' },
                { value: 'gestor_qualidade', label: 'Supervisor de Qualidade' }
              ]}
              className="w-48"
            />
            <CustomSelect 
              value={teamFilter}
              onChange={val => setTeamFilter(val as string)}
              options={[
                { value: '', label: 'Todas as Equipes' },
                ...teams.filter(t => t.active !== false)
                   .sort((a, b) => a.name.localeCompare(b.name))
                   .map(t => ({ value: t.id, label: t.name }))
              ]}
              className="w-48"
            />
          </div>
        </div>
        <Button onClick={() => { setEditingUser({ name: '', email: '', role: 'suporte', team_ids: [], password: '' }); setIsModalOpen(true); }} icon={<UserPlus className="w-4 h-4" />}>
          Adicionar Usuário
        </Button>
      </div>

      <Card padding="none" className="overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-surface-bg border-b border-surface-border">
              <th className="px-6 py-4 text-[10px] font-black uppercase text-brand-muted tracking-widest">Usuário</th>
              <th className="px-6 py-4 text-[10px] font-black uppercase text-brand-muted tracking-widest">Perfil</th>
              <th className="px-6 py-4 text-[10px] font-black uppercase text-brand-muted tracking-widest">Equipe</th>
              <th className="px-6 py-4 text-right text-[10px] font-black uppercase text-brand-muted tracking-widest">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-subtle">
            {filteredUsers.map(u => (
              <tr key={u.id} className="hover:bg-surface-bg/50 transition-colors group">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-brand-subtle flex items-center justify-center text-brand-primary font-black">
                      {u.name.slice(0,1)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className={`text-sm font-black tracking-tight ${u.active === false ? 'text-error' : 'text-brand-primary'}`}>{u.name}</p>
                        {u.active === false && <Badge variant="error" className="scale-75 origin-left">Desativado</Badge>}
                      </div>
                      <p className="text-[10px] font-bold text-brand-muted flex items-center gap-1"><Mail className="w-3 h-3" /> {u.email}</p>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <Badge variant="neutral" className="bg-surface-subtle text-brand-primary">
                    {({ 'admin': 'Administrador', 'qualidade': 'Monitor de Qualidade', 'gestor_qualidade': 'Supervisor de Qualidade', 'gestor_suporte': 'Supervisor de Atendimento', 'suporte': 'Agente de Atendimento' } as any)[u.role] || u.role}
                  </Badge>
                </td>
                <td className="px-6 py-4 text-xs font-bold text-brand-muted">
                  {u.team_ids && u.team_ids.length > 0
                    ? u.team_ids
                        .map(id => teams.find(t => t.id === id && t.active !== false)?.name)
                        .filter(Boolean)
                        .join(', ') || 'Sem equipe'
                    : 'Sem equipe'}
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex justify-end gap-1">
                    {u.active === false ? (
                      <Button variant="outline" size="sm" onClick={() => handleToggleStatus(u.id, true)} icon={<RefreshCw className="w-3.5 h-3.5" />}>Reativar</Button>
                    ) : (
                      <>
                        <button 
                          onClick={() => handleResetPassword(u.email)} 
                          title="Reenviar Senha"
                          className="p-2.5 rounded-xl hover:bg-brand-subtle text-brand-muted hover:text-brand-primary transition-all"
                        >
                          <Key className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => { 
                            // Only load active team IDs into the editor to avoid persisting ghost teams
                            const activeTeamIds = u.team_ids?.filter(id => teams.find(t => t.id === id)?.active !== false) || [];
                            setEditingUser({...u, team_ids: activeTeamIds}); 
                            setIsModalOpen(true); 
                          }} 
                          className="p-2.5 rounded-xl hover:bg-surface-subtle text-brand-muted hover:text-brand-primary transition-all"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        {deleteConfirmId === u.id ? (
                          <div className="flex items-center gap-1 animate-in fade-in slide-in-from-right-2">
                            <button onClick={() => handleToggleStatus(u.id, false)} className="px-2.5 py-1.5 rounded-lg bg-error text-white text-[10px] font-black uppercase">Sim</button>
                            <button onClick={() => setDeleteConfirmId(null)} className="px-2.5 py-1.5 rounded-lg bg-surface-subtle text-brand-muted text-[10px] font-black uppercase tracking-widest">Não</button>
                          </div>
                        ) : (
                          <button onClick={() => setDeleteConfirmId(u.id)} className="p-2.5 rounded-xl hover:bg-red-50 text-brand-muted hover:text-error transition-all"><Trash2 className="w-4 h-4" /></button>
                        )}
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <Card className="max-w-md w-full animate-in zoom-in-95 duration-200">
              <header className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-black text-brand-primary tracking-tight uppercase">{editingUser.id ? 'Editar Usuário' : 'Novo Usuário'}</h3>
                <button onClick={() => { setIsModalOpen(false); setTeamSearch(''); }} className="text-brand-muted hover:text-brand-primary"><X className="w-6 h-6" /></button>
              </header>

              <div className="space-y-4">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-black text-brand-muted uppercase tracking-widest ml-1">Nome Completo</label>
                  <input type="text" className="w-full bg-surface-bg border border-surface-border rounded-xl py-3 px-4 text-sm font-semibold focus:border-brand-accent focus:outline-none" value={editingUser.name} onChange={e => setEditingUser({ ...editingUser, name: e.target.value })} />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-black text-brand-muted uppercase tracking-widest ml-1">Email</label>
                  <input type="email" disabled={!!editingUser.id} className="w-full bg-surface-bg border border-surface-border rounded-xl py-3 px-4 text-sm font-semibold focus:border-brand-accent focus:outline-none disabled:opacity-50" value={editingUser.email} onChange={e => setEditingUser({ ...editingUser, email: e.target.value.toLowerCase() })} />
                </div>
                <CustomSelect 
                  label="Perfil"
                  value={editingUser.role}
                  onChange={val => setEditingUser({ ...editingUser, role: val as any })}
                  options={[
                    { value: 'admin', label: 'Administrador' },
                    { value: 'suporte', label: 'Agente de Atendimento' },
                    { value: 'qualidade', label: 'Monitor de Qualidade' },
                    { value: 'gestor_suporte', label: 'Supervisor de Atendimento' },
                    { value: 'gestor_qualidade', label: 'Supervisor de Qualidade' }
                  ].sort((a, b) => a.label.localeCompare(b.label))}
                />
                <div className="flex flex-col gap-1">
                  <div className="flex items-center justify-between ml-1 mb-1">
                    <label className="text-[10px] font-black text-brand-muted uppercase tracking-widest">Equipes</label>
                    {teams.filter(t => t.active !== false).length > 8 && (
                      <div className="relative w-32 h-7">
                        <Search className="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2 text-brand-muted/50" />
                        <input 
                          type="text" 
                          placeholder="Buscar..." 
                          className="w-full h-full bg-surface-subtle border border-surface-border rounded-lg pl-6 pr-2 text-[10px] font-bold text-brand-primary focus:border-brand-accent focus:outline-none transition-all"
                          value={teamSearch}
                          onChange={e => setTeamSearch(e.target.value)}
                        />
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2 p-3 bg-surface-bg border border-surface-border rounded-xl max-h-32 overflow-y-auto no-scrollbar">
                    {teams.filter(t => t.active !== false)
                      .filter(t => t.name.toLowerCase().includes(teamSearch.toLowerCase()))
                      .sort((a, b) => a.name.localeCompare(b.name))
                      .map(t => (
                      <label key={t.id} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-[10px] font-black uppercase tracking-tight cursor-pointer transition-all ${editingUser.team_ids?.includes(t.id) ? 'bg-brand-primary text-brand-on-primary border-brand-primary shadow-sm' : 'bg-surface-subtle text-brand-muted border-surface-border hover:border-brand-highlight'}`}>
                        <input
                          type="checkbox"
                          className="hidden"
                          checked={editingUser.team_ids?.includes(t.id) || false}
                          onChange={(e) => {
                            const newIds = e.target.checked
                              ? [...(editingUser.team_ids || []), t.id]
                              : (editingUser.team_ids || []).filter(id => id !== t.id);
                            setEditingUser({ ...editingUser, team_ids: newIds });
                          }}
                        />
                        {t.name}
                      </label>
                    ))}
                    {teams.filter(t => t.active !== false).length === 0 && (
                      <p className="text-[10px] font-bold text-brand-muted uppercase italic p-2">Nenhuma equipe ativa cadastrada.</p>
                    )}
                    {teams.filter(t => t.active !== false).length > 0 && teams.filter(t => t.active !== false).filter(t => t.name.toLowerCase().includes(teamSearch.toLowerCase())).length === 0 && (
                      <p className="text-[10px] font-bold text-brand-muted uppercase italic p-2 w-full text-center">Nenhuma equipe encontrada.</p>
                    )}
                  </div>
                </div>

                <Button className="w-full mt-4" onClick={handleSaveUser} disabled={saving} icon={<Save className="w-4 h-4" />}>
                  {saving ? 'Salvando...' : 'Salvar Usuário'}
                </Button>
              </div>
            </Card>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function TeamsManagement({ teams, users, loadData }: { teams: Team[], users: User[], loadData: () => void }) {
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
    // Validation: Prevent deactivating a team if it has active users
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

function FormsManagement({ currentUser, teams, loadData }: { currentUser: User | null, teams: Team[], loadData: () => void }) {
  const [forms, setForms] = useState<EvaluationForm[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingForm, setEditingForm] = useState<Partial<EvaluationForm>>({ title: '', description: '', team_id: '', sections: [], critical_errors: [] });
  const [saving, setSaving] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'active' | 'inactive'>('active');
  const [searchTerm, setSearchTerm] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'geral' | 'pilares' | 'criticos'>('geral');
  const [expandedDescriptions, setExpandedDescriptions] = useState<Record<string, boolean>>({});

  // Auto-save logic
  useEffect(() => {
    // Only auto-save if it's a new form AND has some content
    const hasContent = editingForm.title || (editingForm.sections && editingForm.sections.length > 0);
    if (isModalOpen && !editingForm.id && hasContent) { 
      localStorage.setItem('qualitrack_form_draft', JSON.stringify(editingForm));
    }
  }, [editingForm, isModalOpen]);
  


  const loadDraft = () => {
    const draft = localStorage.getItem('qualitrack_form_draft');
    if (draft) {
      try {
        setEditingForm(JSON.parse(draft));
        toast.success('Rascunho recuperado com sucesso!');
      } catch (e) {
        console.error('Failed to load draft', e);
      }
    }
  };

  const clearDraft = () => {
    localStorage.removeItem('qualitrack_form_draft');
  };

  const filteredForms = useMemo(() => {
    return forms
      .filter(f => statusFilter === 'active' ? f.active !== false : f.active === false)
      .filter(f => f.title.toLowerCase().includes(searchTerm.toLowerCase()))
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [forms, statusFilter, searchTerm]);

  const loadForms = async () => {
    const res = supabase ? await supabase.from('forms').select('*') : await mockDb.get('forms');
    setForms(res.data || []);
  };

  useEffect(() => {
    loadForms();
  }, []);

  const handleToggleStatus = async (id: string, active: boolean) => {
    try {
      if (!supabase) await mockDb.update('forms', id, { active });
      else await supabase.from('forms').update({ active }).eq('id', id);
      toast.success(active ? 'Formulário ativado!' : 'Formulário desativado!');
      setDeleteConfirmId(null);
      loadForms();
    } catch (e) { toast.error('Não foi possível alterar o status do formulário.'); }
  };

  const handleSaveForm = async () => {
    if (!editingForm.title || !editingForm.sections?.length) return toast.error('Por favor, preencha o título e as seções do formulário.');
    setSaving(true);
    const executeWithRetry = async (retryCount = 0): Promise<void> => {
      try {
        if (!supabase) {
          const payload = { ...editingForm, active: true, created_by: currentUser?.email };
          if (editingForm.id) await mockDb.update('forms', editingForm.id, payload);
          else await mockDb.insert('forms', payload);
          return;
        }

        await supabase.auth.getSession();
        const payload = { ...editingForm, active: true, created_by: currentUser?.email };

        const operation = (async () => {
          const { error } = await supabase.from('forms').upsert([{ ...(editingForm.id ? { id: editingForm.id } : {}), ...payload }]);
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
      toast.success('Formulário salvo com sucesso!');
      clearDraft();
      setIsModalOpen(false);
      loadForms();
    } catch (e: any) { 
      console.error('Erro definitivo ao salvar formulário:', e);
      toast.error(e.message === 'timeout' ? 'O servidor não respondeu. Seu rascunho continua salvo localmente.' : (e.message || 'Não foi possível salvar o formulário.'));
    } finally { 
      setSaving(false); 
    }
  };

  const addSection = () => {
    const newSection: FormSection = { id: Math.random().toString(36).substr(2, 9), title: 'Novo Pilar', weight: 0, questions: [] };
    setEditingForm({ ...editingForm, sections: [...(editingForm.sections || []), newSection] });
  };

  const removeSection = (id: string) => {
    setEditingForm({ ...editingForm, sections: editingForm.sections?.filter(s => s.id !== id) });
  };

  const updateSection = (id: string, field: string, value: any) => {
    setEditingForm({
      ...editingForm,
      sections: editingForm.sections?.map(s => s.id === id ? { ...s, [field]: value } : s)
    });
  };

  const addQuestion = (sectionId: string) => {
    const newQuestion: Question = { id: Math.random().toString(36).substr(2, 9), text: 'Novo Item', type: 'yes_no_na', is_critical: false };
    setEditingForm({
      ...editingForm,
      sections: editingForm.sections?.map(s => s.id === sectionId ? { ...s, questions: [...s.questions, newQuestion] } : s)
    });
  };

  const removeQuestion = (sectionId: string, qId: string) => {
    setEditingForm({
      ...editingForm,
      sections: editingForm.sections?.map(s => s.id === sectionId ? { ...s, questions: s.questions.filter(q => q.id !== qId) } : s)
    });
  };

  const addCriticalError = () => {
    const newQuestion: Question = { id: Math.random().toString(36).substr(2, 9), text: 'Novo Erro Crítico', type: 'yes_no_na', is_critical: true };
    setEditingForm({
      ...editingForm,
      critical_errors: [...(editingForm.critical_errors || []), newQuestion]
    });
  };

  const removeCriticalError = (qId: string) => {
    setEditingForm({
      ...editingForm,
      critical_errors: editingForm.critical_errors?.filter(q => q.id !== qId)
    });
  };

  const updateCriticalError = (qId: string, field: string, value: any) => {
    setEditingForm({
      ...editingForm,
      critical_errors: editingForm.critical_errors?.map(q => q.id === qId ? { ...q, [field]: value } : q)
    });
  };

  const updateQuestion = (sectionId: string, qId: string, field: string, value: any) => {
    setEditingForm({
      ...editingForm,
      sections: editingForm.sections?.map(s => s.id === sectionId ? { ...s, questions: s.questions.map(q => q.id === qId ? { ...q, [field]: value } : q) } : s)
    });
  };

  const totalWeight = useMemo(() => {
    return (editingForm.sections || []).reduce((acc, s) => acc + (Number(s.weight) || 0), 0);
  }, [editingForm.sections]);

  const isValid = useMemo(() => {
    return totalWeight === 100 && 
           !(editingForm.sections || []).some(s => (Number(s.weight) || 0) <= 0) &&
           !(editingForm.sections || []).some(s => !s.questions || s.questions.length === 0);
  }, [totalWeight, editingForm.sections]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="relative w-64 h-10">
            <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-brand-muted" />
            <input
              type="text"
              placeholder="Buscar formulário..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full h-full bg-surface-card border border-surface-border rounded-2xl pl-11 pr-4 text-xs font-bold text-brand-primary placeholder:text-brand-muted/60 focus:border-brand-accent focus:outline-none transition-all"
            />
          </div>
          <div className="h-10 flex items-center">
            <CustomSelect 
              value={statusFilter}
              onChange={val => setStatusFilter(val as any)}
              options={[{ value: 'active', label: 'Ativos' }, { value: 'inactive', label: 'Desativados' }]}
              className="w-44"
            />
          </div>
        </div>
        <div className="flex gap-2">
          {localStorage.getItem('qualitrack_form_draft') && (
            <Button variant="outline" onClick={loadDraft} className="border-brand-accent/30 text-brand-accent hover:bg-brand-accent/5">
              Recuperar Rascunho
            </Button>
          )}
          <Button onClick={() => { setEditingForm({ title: '', description: '', team_id: '', sections: [], critical_errors: [] }); setIsModalOpen(true); }} icon={<Plus className="w-4 h-4" />}>
            Novo Formulário
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredForms.map(f => (
          <Card key={f.id} className="group hover:border-brand-accent transition-all relative">
            <div className="flex justify-between items-start mb-4">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-2xl bg-brand-subtle flex items-center justify-center text-brand-primary">
                  <ClipboardList className="w-5 h-5" />
                </div>
                <div onClick={() => { setEditingForm(f); setIsModalOpen(true); }} className="cursor-pointer">
                  <h4 className="font-black text-brand-primary uppercase tracking-tight">{f.title}</h4>
                  <Badge variant="neutral">{f.team_id ? teams.find(t => t.id === f.team_id)?.name : 'Geral'}</Badge>
                </div>
              </div>
              <div className="flex gap-1">
                {statusFilter === 'inactive' ? (
                  <Button variant="outline" size="sm" onClick={() => handleToggleStatus(f.id, true)} icon={<RefreshCw className="w-3.5 h-3.5" />}>Reativar</Button>
                ) : (
                  <>
                    <button onClick={() => { setEditingForm(f); setIsModalOpen(true); }} className="p-2 rounded-xl hover:bg-surface-subtle text-brand-muted hover:text-brand-primary transition-all"><Pencil className="w-4 h-4" /></button>
                    {deleteConfirmId === f.id ? (
                      <div className="flex items-center gap-1 animate-in fade-in slide-in-from-right-2">
                        <button onClick={(e) => { e.stopPropagation(); handleToggleStatus(f.id, false); }} className="px-2.5 py-1.5 rounded-lg bg-error text-white text-[10px] font-black uppercase">Sim</button>
                        <button onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(null); }} className="px-2.5 py-1.5 rounded-lg bg-surface-subtle text-brand-muted text-[10px] font-black uppercase tracking-widest">Não</button>
                      </div>
                    ) : (
                      <button onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(f.id); }} className="p-2.5 rounded-xl hover:bg-red-50 text-brand-muted hover:text-error transition-all"><Trash2 className="w-4 h-4" /></button>
                    )}
                  </>
                )}
              </div>
            </div>
            <div onClick={() => { setEditingForm(f); setIsModalOpen(true); }} className="cursor-pointer">
              <p className="text-xs text-brand-muted line-clamp-2 mb-4">{f.description}</p>
              <div className="flex items-center gap-4">
                <span className="text-[10px] font-black uppercase text-brand-highlight">{f.sections.length} Pilares</span>
                <span className="text-[10px] font-black uppercase text-brand-highlight">Peso Total: {f.sections.reduce((acc, s) => acc + (s.weight || 0), 0)}%</span>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#2D3A3A]/60 backdrop-blur-md">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col bg-surface-card rounded-[32px] shadow-2xl">
              <header className="flex items-center justify-between p-8 border-b border-surface-border bg-surface-card sticky top-0 z-10">
                <div className="flex items-center gap-6">
                  <div className="w-14 h-14 rounded-2xl bg-brand-primary/5 flex items-center justify-center text-brand-primary">
                    <ClipboardList className="w-7 h-7" />
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-brand-primary tracking-tight uppercase">Editor de Formulário</h3>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-widest ${totalWeight === 100 ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'}`}>
                        Peso Total: {totalWeight}% {totalWeight !== 100 && '(Incompleto)'}
                      </span>
                      <span className="text-brand-muted/30">•</span>
                      <p className="text-[10px] font-bold text-brand-muted uppercase tracking-widest">{editingForm.title || 'Novo Formulário'}</p>
                    </div>
                  </div>
                </div>
                <button onClick={() => setIsModalOpen(false)} className="p-3 rounded-2xl hover:bg-surface-subtle text-brand-muted hover:text-brand-primary transition-all"><X className="w-6 h-6" /></button>
              </header>

              <div className="flex border-b border-surface-border bg-surface-bg/30 px-8">
                {[
                  { id: 'geral', label: '1. Informações Gerais', icon: Shield },
                  { id: 'pilares', label: '2. Estrutura de Pilares', icon: BarChart3 },
                  { id: 'criticos', label: '3. Erros Críticos', icon: AlertOctagon },
                ].map(t => (
                  <button
                    key={t.id}
                    onClick={() => setActiveTab(t.id as any)}
                    className={`flex items-center gap-2 px-6 py-4 text-[11px] font-black uppercase tracking-widest transition-all border-b-2 -mb-[1px] ${activeTab === t.id ? 'border-brand-primary text-brand-primary' : 'border-transparent text-brand-muted hover:text-brand-primary'}`}
                  >
                    <t.icon className="w-4 h-4" />
                    {t.label}
                  </button>
                ))}
              </div>

              <div className="flex-1 overflow-y-auto p-8 space-y-8 no-scrollbar bg-surface-bg/10">
                {activeTab === 'geral' && (
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="max-w-2xl mx-auto space-y-8 py-4">
                    <div className="grid grid-cols-1 gap-8">
                      <div className="space-y-6">
                        <div className="flex flex-col gap-2">
                          <label className="text-[10px] font-black text-brand-muted uppercase tracking-widest ml-1">Título do Formulário</label>
                          <input 
                            type="text" 
                            className="w-full bg-surface-bg border border-surface-border rounded-2xl px-6 py-4 text-sm font-bold text-brand-primary focus:border-brand-accent focus:ring-4 focus:ring-brand-accent/5 outline-none transition-all shadow-sm" 
                            value={editingForm.title} 
                            onChange={e => setEditingForm({...editingForm, title: e.target.value})} 
                            placeholder="Ex: Monitoria de Atendimento Chat" 
                          />
                        </div>
                        <div className="flex flex-col gap-2">
                          <label className="text-[10px] font-black text-brand-muted uppercase tracking-widest ml-1">Equipe Vinculada</label>
                          <CustomSelect 
                            value={editingForm.team_id || ''} 
                            onChange={val => setEditingForm({...editingForm, team_id: val})} 
                            options={[{ value: '', label: 'Geral (Todas as Equipes)' }, ...teams.map(t => ({ value: t.id, label: t.name }))]} 
                          />
                        </div>
                        <div className="flex flex-col gap-2">
                          <label className="text-[10px] font-black text-brand-muted uppercase tracking-widest ml-1">Descrição do Propósito</label>
                          <textarea 
                            className="w-full bg-surface-bg border border-surface-border rounded-3xl px-6 py-4 text-sm font-bold text-brand-primary focus:border-brand-accent focus:ring-4 focus:ring-brand-accent/5 outline-none transition-all min-h-[150px] shadow-sm leading-relaxed" 
                            value={editingForm.description} 
                            onChange={e => setEditingForm({...editingForm, description: e.target.value})} 
                            placeholder="Descreva detalhadamente o que este formulário avalia e quais os objetivos..." 
                          />
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}

                {activeTab === 'pilares' && (
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-sm font-black text-brand-primary uppercase tracking-widest">Definição da Estrutura</h4>
                        <p className="text-[10px] font-bold text-brand-muted uppercase mt-1">Crie os pilares de avaliação e distribua os pesos.</p>
                      </div>
                      <Button variant="outline" size="sm" onClick={addSection} icon={<Plus className="w-4 h-4" />} className="rounded-2xl border-brand-accent/30 text-brand-accent hover:bg-brand-accent/5">Novo Pilar</Button>
                    </div>
                    
                    <div className="grid grid-cols-1 gap-6">
                      {editingForm.sections?.map((section, sIdx) => (
                        <div key={section.id} className="bg-surface-card rounded-[32px] border border-surface-border shadow-premium-sm overflow-hidden border-l-8 border-l-brand-accent">
                          <div className="p-6 border-b border-surface-border bg-surface-subtle/10 flex items-center justify-between gap-6">
                            <div className="flex items-center gap-4 flex-1">
                              <span className="text-[10px] font-black text-brand-muted/40 uppercase tracking-widest">#{sIdx + 1}</span>
                              <input 
                                className="bg-transparent border-none p-0 text-lg font-black text-brand-primary uppercase tracking-tight focus:ring-0 w-full placeholder:text-brand-muted/30"
                                value={section.title}
                                onChange={e => updateSection(section.id, 'title', e.target.value)}
                                placeholder="NOME DO PILAR (Ex: QUALIDADE)"
                              />
                            </div>
                            <div className="flex items-center gap-6">
                              <div className="flex flex-col items-end">
                                <label className="text-[8px] font-black text-brand-muted uppercase tracking-[0.2em] mb-1">Peso do Pilar</label>
                                <div className="flex items-center gap-2 bg-surface-bg border border-surface-border rounded-xl px-3 py-1.5 shadow-sm">
                                  <input 
                                    type="number" 
                                    className="w-10 bg-transparent border-none p-0 text-sm font-black text-brand-primary focus:ring-0 text-center"
                                    value={section.weight}
                                    onChange={e => updateSection(section.id, 'weight', parseInt(e.target.value) || 0)}
                                  />
                                  <span className="text-[10px] font-black text-brand-muted">%</span>
                                </div>
                              </div>
                              <button onClick={() => removeSection(section.id)} className="p-2.5 rounded-xl hover:bg-red-50 text-brand-muted/40 hover:text-error transition-all"><Trash2 className="w-5 h-5" /></button>
                            </div>
                          </div>
                          
                          <div className="p-6 bg-surface-bg/5 space-y-3">
                            {section.questions.map((q, qIdx) => {
                              const itemWeightInPilar = section.questions.length > 0 ? (100 / section.questions.length).toFixed(1) : 0;
                              const itemImpactInTotal = section.questions.length > 0 ? ((section.weight || 0) / section.questions.length).toFixed(1) : 0;

                              return (
                                <div key={q.id} className="flex items-center gap-4 p-4 rounded-2xl bg-surface-card border border-surface-border group hover:border-brand-accent/40 transition-all shadow-sm">
                                  <div className="w-8 h-8 rounded-lg bg-surface-subtle flex items-center justify-center text-[10px] font-black text-brand-muted">{qIdx + 1}</div>
                                  <div className="flex-1">
                                    <input 
                                      className="bg-transparent border-none p-0 text-xs font-bold text-brand-primary w-full focus:ring-0 placeholder:text-brand-muted/30"
                                      value={q.text}
                                      onChange={e => updateQuestion(section.id, q.id, 'text', e.target.value)}
                                      placeholder="Ex: Utilizou a saudação padrão corretamente?"
                                    />
                                    <div className="flex items-center gap-4 mt-1.5 opacity-60">
                                      <span className="text-[9px] font-black text-brand-muted uppercase tracking-widest">Peso no Pilar: {itemWeightInPilar}%</span>
                                      <span className="text-brand-muted/20">•</span>
                                      <span className="text-[9px] font-black text-brand-muted uppercase tracking-widest">Impacto Global: {itemImpactInTotal}%</span>
                                    </div>
                                    {expandedDescriptions[q.id] && (
                                      <div className="mt-3">
                                        <textarea
                                          className="w-full bg-surface-bg border border-surface-border rounded-xl px-4 py-3 text-xs font-semibold text-brand-primary focus:border-brand-accent focus:ring-2 focus:ring-brand-accent/10 outline-none transition-all resize-none shadow-sm placeholder:text-brand-muted/40"
                                          placeholder="Descreva detalhadamente o que este critério avalia (será exibido como dica durante a monitoria)..."
                                          rows={2}
                                          value={q.description || ''}
                                          onChange={e => updateQuestion(section.id, q.id, 'description', e.target.value)}
                                        />
                                      </div>
                                    )}
                                  </div>
                                  <div className="flex flex-col gap-1">
                                    <button 
                                      onClick={() => setExpandedDescriptions(prev => ({ ...prev, [q.id]: !prev[q.id] }))} 
                                      className={`p-2 rounded-xl transition-colors ${expandedDescriptions[q.id] || q.description ? 'text-brand-accent bg-brand-accent/10' : 'text-brand-muted/30 hover:text-brand-primary hover:bg-surface-subtle'}`}
                                      title="Adicionar Descrição"
                                    >
                                      <MessageSquare className="w-4 h-4" />
                                    </button>
                                    <button onClick={() => removeQuestion(section.id, q.id)} className="p-2 rounded-xl text-brand-muted/30 hover:text-error hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100">
                                      <X className="w-4 h-4" />
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                            
                            <button 
                              onClick={() => addQuestion(section.id)}
                              className="w-full py-4 rounded-2xl border-2 border-dashed border-surface-border/60 text-brand-muted text-[10px] font-black uppercase tracking-widest hover:border-brand-accent/40 hover:text-brand-accent hover:bg-brand-accent/5 transition-all flex items-center justify-center gap-2"
                            >
                              <Plus className="w-3.5 h-3.5" /> Adicionar Critério ao Pilar
                            </button>
                          </div>
                        </div>
                      ))}

                      {(!editingForm.sections || editingForm.sections.length === 0) && (
                        <div className="bg-surface-bg/50 p-16 rounded-[40px] border-2 border-dashed border-surface-border text-center">
                          <div className="w-20 h-20 rounded-[2.5rem] bg-surface-card shadow-premium flex items-center justify-center mx-auto mb-6">
                            <Plus className="w-10 h-10 text-brand-muted/40" />
                          </div>
                          <h5 className="text-brand-primary font-black uppercase tracking-widest text-sm">Nenhum Pilar Definido</h5>
                          <p className="text-brand-muted text-[10px] font-bold uppercase mt-2">Clique no botão acima ou abaixo para começar a estruturar o formulário.</p>
                          <Button variant="outline" onClick={addSection} className="mt-8 rounded-2xl">Criar Primeiro Pilar</Button>
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}

                {activeTab === 'criticos' && (
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-sm font-black text-error uppercase tracking-widest flex items-center gap-2">
                          <AlertOctagon className="w-5 h-5" />
                          Erros Críticos (Zeradores)
                        </h4>
                        <p className="text-[10px] font-bold text-brand-muted uppercase mt-1">Itens que, se marcados como 'NÃO', zeram automaticamente a monitoria.</p>
                      </div>
                      <Button variant="outline" size="sm" onClick={addCriticalError} icon={<Plus className="w-4 h-4" />} className="rounded-2xl border-error/30 text-error hover:bg-red-50 hover:border-error">Novo Erro Crítico</Button>
                    </div>

                    <div className="grid grid-cols-1 gap-4">
                      {editingForm.critical_errors?.map((ce, idx) => (
                        <div key={ce.id} className="flex items-center gap-4 p-5 rounded-2xl bg-surface-card border border-surface-border border-l-8 border-l-error group hover:border-error/20 transition-all shadow-sm">
                          <div className="w-10 h-10 rounded-xl bg-error/5 text-error flex items-center justify-center text-[10px] font-black">{idx + 1}</div>
                          <div className="flex-1">
                            <input 
                              className="bg-transparent border-none p-0 text-sm font-bold text-brand-primary w-full focus:ring-0 placeholder:text-brand-muted/30"
                              value={ce.text}
                              onChange={e => updateCriticalError(ce.id, 'text', e.target.value)}
                              placeholder="Ex: Fraude ou quebra de protocolo de segurança..."
                            />
                          </div>
                          <button onClick={() => removeCriticalError(ce.id)} className="p-2 text-brand-muted/30 hover:text-error transition-colors opacity-0 group-hover:opacity-100"><X className="w-5 h-5" /></button>
                        </div>
                      ))}
                      
                      {(!editingForm.critical_errors || editingForm.critical_errors.length === 0) && (
                        <div className="py-20 text-center border-2 border-dashed border-surface-border/40 rounded-[40px] bg-surface-bg/30">
                          <AlertOctagon className="w-12 h-12 text-brand-muted/20 mx-auto mb-4" />
                          <p className="text-[10px] font-black text-brand-muted uppercase tracking-widest">Nenhum erro crítico foi configurado para este formulário</p>
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </div>
              
              <footer className="p-8 border-t border-surface-border bg-surface-card flex items-center justify-between sticky bottom-0">
                <div className="flex items-center gap-4">
                  {(() => {
                    if (totalWeight !== 100) return (
                      <div className="flex items-center gap-2 text-error animate-pulse">
                        <AlertTriangle className="w-4 h-4" />
                        <span className="text-[10px] font-black uppercase tracking-widest">Peso Total incorreto ({totalWeight}%)</span>
                      </div>
                    );
                    if ((editingForm.sections || []).some(s => (Number(s.weight) || 0) <= 0)) return (
                      <div className="flex items-center gap-2 text-error animate-pulse">
                        <AlertTriangle className="w-4 h-4" />
                        <span className="text-[10px] font-black uppercase tracking-widest">Pilar com Valor Zerado</span>
                      </div>
                    );
                    if ((editingForm.sections || []).some(s => !s.questions || s.questions.length === 0)) return (
                      <div className="flex items-center gap-2 text-error animate-pulse">
                        <AlertTriangle className="w-4 h-4" />
                        <span className="text-[10px] font-black uppercase tracking-widest">Pilar sem Critério</span>
                      </div>
                    );
                    return (
                      <div className="flex items-center gap-2 text-success">
                        <Check className="w-4 h-4" />
                        <span className="text-[10px] font-black uppercase tracking-widest">Estrutura válida</span>
                      </div>
                    );
                  })()}
                </div>
                <div className="flex gap-3">
                  <div className="flex gap-2 mr-4 border-r border-surface-border pr-4">
                    <Button 
                      variant="ghost" 
                      onClick={() => setActiveTab(activeTab === 'criticos' ? 'pilares' : activeTab === 'pilares' ? 'geral' : 'geral')} 
                      disabled={activeTab === 'geral'}
                      className="rounded-2xl px-4 text-brand-muted hover:text-brand-primary disabled:opacity-30"
                    >
                      <ChevronLeft className="w-4 h-4 mr-1" /> Anterior
                    </Button>
                    <Button 
                      variant="ghost" 
                      onClick={() => setActiveTab(activeTab === 'geral' ? 'pilares' : 'criticos')} 
                      disabled={activeTab === 'criticos'}
                      className="rounded-2xl px-4 text-brand-muted hover:text-brand-primary disabled:opacity-30"
                    >
                      Próximo <ChevronRight className="w-4 h-4 ml-1" />
                    </Button>
                  </div>

                  <Button variant="ghost" onClick={() => setIsModalOpen(false)} className="rounded-2xl px-6 text-brand-muted hover:text-brand-primary">
                    Cancelar
                  </Button>
                  
                  <Button 
                    onClick={handleSaveForm} 
                    disabled={saving || !isValid} 
                    variant={isValid ? 'secondary' : 'outline'}
                    className="rounded-2xl px-10 shadow-premium transition-all"
                  >
                    {saving ? 'Publicando...' : (editingForm.id ? 'Salvar Alterações' : 'Publicar Formulário')}
                  </Button>
                </div>
              </footer>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function RequestsManagement({ requests: initialRequests, users, teams, loadData }: { requests: AccessRequest[], users: User[], teams: Team[], loadData: () => void }) {
  const [requests, setRequests] = useState<AccessRequest[]>(initialRequests);
  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'pending' | 'approved' | 'rejected'>('pending');
  const [isApproveModalOpen, setIsApproveModalOpen] = useState(false);
  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
  const [approvingReq, setApprovingReq] = useState<any>(null);
  const [rejectingReq, setRejectingReq] = useState<any>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [approveData, setApproveData] = useState<{ name: string, email: string, role: string, team_ids: string[] }>({ name: '', email: '', role: 'suporte', team_ids: [] });
  const [saving, setSaving] = useState(false);
  const [teamSearch, setTeamSearch] = useState('');

  // Load on mount and whenever props update
  useEffect(() => { setRequests(initialRequests); }, [initialRequests]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const handleApprove = async () => {
    setSaving(true);
    const executeWithRetry = async (retryCount = 0): Promise<void> => {
      try {
        if (!supabase) {
          const payload = { ...approveData, active: true };
          await mockDb.update('access_requests', approvingReq.id, { status: 'approved' });
          await mockDb.insert('users', { id: approveData.email, ...payload });
          return;
        }

        await supabase.auth.getSession();
        const payload = { ...approveData, active: true };

        const operation = (async () => {
          const { error: reqError } = await supabase.from('access_requests').update({ status: 'approved' }).eq('id', approvingReq.id);
          if (reqError) throw reqError;

          const { data, error: funcError } = await supabase.functions.invoke('admin-invite-user', { body: payload });
          if (funcError) throw funcError;
          if (data?.success === false) throw new Error(data.details?.message || 'Erro ao convidar usuário');
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
      toast.success('Solicitação aprovada e e-mail de acesso enviado!');
      setIsApproveModalOpen(false);
      await handleRefresh(); 
      loadData(); 
    } catch (e: any) { 
      console.error('Erro definitivo ao aprovar solicitação:', e);
      toast.error(e.message === 'timeout' ? 'O servidor não respondeu ao processar o convite. Tente novamente.' : (e.message || 'Não foi possível aprovar a solicitação no momento.'));
    } finally { 
      setSaving(false); 
    }
  };

  const handleReject = (req: any) => {
    setRejectingReq(req);
    setRejectReason('');
    setIsRejectModalOpen(true);
  };

  const confirmReject = async () => {
    if (!rejectReason.trim()) {
      toast.error('Por favor, informe o motivo da rejeição.');
      return;
    }

    setSaving(true);
    try {
      // 1. Update Database
      if (!supabase) {
        await mockDb.update('access_requests', rejectingReq.id, { status: 'rejected', rejection_reason: rejectReason });
      } else {
        const { error } = await supabase
          .from('access_requests')
          .update({ status: 'rejected', rejection_reason: rejectReason })
          .eq('id', rejectingReq.id);
        if (error) throw error;

        // 2. Send Rejection Email via Edge Function
        const { error: emailError } = await supabase.functions.invoke('send-email', {
          body: {
            email: rejectingReq.email,
            name: rejectingReq.name,
            type: 'rejection',
            token: rejectReason // We reuse the token field to pass the reason string
          }
        });
        if (emailError) console.error('Failed to send rejection email:', emailError);
      }

      toast.success('Solicitação rejeitada e e-mail enviado.');
      setIsRejectModalOpen(false);
      await handleRefresh();
      loadData();
    } catch (e: any) {
      toast.error('Não foi possível processar a rejeição da solicitação.');
    } finally {
      setSaving(false);
    }
  };

  const filtered = requests.filter(r => r.status === statusFilter);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <CustomSelect 
          value={statusFilter} 
          onChange={val => setStatusFilter(val as any)} 
          options={[{ value: 'pending', label: 'Pendentes' }, { value: 'approved', label: 'Aprovadas' }, { value: 'rejected', label: 'Rejeitadas' }]} 
        />
         <Button variant="ghost" onClick={handleRefresh} disabled={refreshing} icon={<RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />}>
          {refreshing ? 'Atualizando...' : 'Atualizar'}
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {filtered.map(req => (
          <Card key={req.id} className={`flex flex-col md:flex-row items-center justify-between gap-6 border-l-4 ${req.status === 'pending' ? 'border-l-warning' : req.status === 'approved' ? 'border-l-brand-accent' : 'border-l-error'}`}>
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-surface-bg flex items-center justify-center text-brand-muted">
                <UserIcon className="w-6 h-6" />
              </div>
              <div>
                <h4 className="font-black text-brand-primary uppercase tracking-tight">{req.name}</h4>
                <p className="text-xs font-bold text-brand-muted">{req.email}</p>
                <p className="text-[10px] font-bold text-brand-highlight uppercase mt-1">Solicitado em: {new Date(req.created_at).toLocaleDateString()}</p>
              </div>
            </div>
            {req.status === 'pending' && (
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => handleReject(req)} className="text-error hover:bg-red-50">Recusar</Button>
                <Button size="sm" onClick={() => { setApprovingReq(req); setApproveData({ name: req.name, email: req.email, role: 'suporte', team_ids: [] }); setIsApproveModalOpen(true); }}>Revisar e Aprovar</Button>
              </div>
            )}
            {req.status !== 'pending' && <Badge variant={req.status === 'approved' ? 'success' : 'error'}>{req.status === 'approved' ? 'Aprovado' : 'Recusado'}</Badge>}
          </Card>
        ))}
        {filtered.length === 0 && <Card className="py-20 text-center"><p className="text-brand-muted font-bold">Nenhuma solicitação nesta categoria.</p></Card>}
      </div>

      <AnimatePresence>
        {isApproveModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <Card className="max-w-md w-full">
              <header className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-black text-brand-primary tracking-tight uppercase">Aprovar Solicitação</h3>
                <button onClick={() => setIsApproveModalOpen(false)} className="text-brand-muted hover:text-brand-primary"><X className="w-6 h-6" /></button>
              </header>
              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-4">
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-black text-brand-muted uppercase tracking-widest ml-1">Nome</label>
                    <input type="text" className="w-full bg-surface-bg border border-surface-border rounded-xl px-4 py-3 text-sm font-semibold focus:border-brand-accent focus:outline-none" value={approveData.name} onChange={e => setApproveData({...approveData, name: e.target.value})} />
                  </div>
                  <CustomSelect 
                    label="Perfil" 
                    value={approveData.role} 
                    onChange={val => setApproveData({...approveData, role: val})} 
                    options={[
                      { value: 'admin', label: 'Administrador' }, 
                      { value: 'suporte', label: 'Agente de Atendimento' }, 
                      { value: 'qualidade', label: 'Monitor de Qualidade' }, 
                      { value: 'gestor_suporte', label: 'Supervisor de Atendimento' }, 
                      { value: 'gestor_qualidade', label: 'Supervisor de Qualidade' }
                    ].sort((a, b) => a.label.localeCompare(b.label))} 
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <div className="flex items-center justify-between ml-1 mb-1">
                    <label className="text-[10px] font-black text-brand-muted uppercase tracking-widest">Equipes</label>
                    {teams.length > 8 && (
                      <div className="relative w-32 h-7">
                        <Search className="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2 text-brand-muted/50" />
                        <input 
                          type="text" 
                          placeholder="Buscar..." 
                          className="w-full h-full bg-surface-subtle border border-surface-border rounded-lg pl-6 pr-2 text-[10px] font-bold text-brand-primary focus:border-brand-accent focus:outline-none transition-all"
                          value={teamSearch}
                          onChange={e => setTeamSearch(e.target.value)}
                        />
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2 p-3 bg-surface-bg border border-surface-border rounded-xl max-h-32 overflow-y-auto no-scrollbar">
                    {teams
                      .filter(t => t.name.toLowerCase().includes(teamSearch.toLowerCase()))
                      .sort((a, b) => a.name.localeCompare(b.name))
                      .map(t => (
                      <label key={t.id} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-[10px] font-black uppercase tracking-tight cursor-pointer transition-all ${approveData.team_ids?.includes(t.id) ? 'bg-brand-primary text-brand-on-primary border-brand-primary' : 'bg-surface-subtle text-brand-muted border-surface-border'}`}>
                        <input type="checkbox" className="hidden" checked={approveData.team_ids?.includes(t.id)} onChange={e => {
                          const newIds = e.target.checked ? [...approveData.team_ids, t.id] : approveData.team_ids.filter(id => id !== t.id);
                          setApproveData({...approveData, team_ids: newIds});
                        }} />
                        {t.name}
                      </label>
                    ))}
                    {teams.length > 0 && teams.filter(t => t.name.toLowerCase().includes(teamSearch.toLowerCase())).length === 0 && (
                      <p className="text-[10px] font-bold text-brand-muted uppercase italic p-2 w-full text-center">Nenhuma equipe encontrada.</p>
                    )}
                  </div>
                </div>
                <Button className="w-full mt-4" onClick={handleApprove} disabled={saving} icon={<Check className="w-4 h-4" />}>{saving ? 'Processando...' : 'Confirmar Aprovação'}</Button>
              </div>
            </Card>
          </div>
        )}

        {isRejectModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <Card className="max-w-md w-full">
              <header className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2 text-error">
                  <AlertCircle className="w-5 h-5" />
                  <h3 className="text-xl font-black text-brand-primary tracking-tight uppercase">Rejeitar Solicitação</h3>
                </div>
                <button onClick={() => setIsRejectModalOpen(false)} className="text-brand-muted hover:text-brand-primary"><X className="w-6 h-6" /></button>
              </header>
              <div className="space-y-4">
                <p className="text-sm text-brand-muted font-medium">
                  Você está recusando o acesso de <span className="text-brand-primary font-bold">{rejectingReq?.name}</span>.
                  Informe abaixo o motivo da recusa, que será enviado por e-mail para o usuário.
                </p>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-black text-brand-muted uppercase tracking-widest ml-1">Motivo da Rejeição</label>
                  <textarea 
                    className="w-full bg-surface-bg border border-surface-border rounded-xl px-4 py-3 text-sm font-semibold focus:border-error focus:outline-none min-h-[120px] resize-none"
                    placeholder="Ex: E-mail não corporativo ou setor não autorizado."
                    value={rejectReason}
                    onChange={e => setRejectReason(e.target.value)}
                  />
                </div>
                <div className="flex gap-3 mt-4">
                  <Button variant="outline" className="flex-1" onClick={() => setIsRejectModalOpen(false)}>Cancelar</Button>
                  <Button className="flex-1 bg-error hover:bg-red-700" onClick={confirmReject} disabled={saving}>
                    {saving ? 'Enviando...' : 'Confirmar Recusa'}
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
