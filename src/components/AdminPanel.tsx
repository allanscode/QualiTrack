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
  BarChart3,
  Mail,
  User as UserIcon,
  ShieldCheck,
  ChevronRight,
  ArrowRight,
  Pencil,
  Key
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import QualityConfigManagement from './QualityConfigManagement';
import Card from './ui/Card';
import Button from './ui/Button';
import Badge from './ui/Badge';
import Select from './ui/Select';
import CustomSelect from './ui/CustomSelect';

export default function AdminPanel({ user: currentUser }: { user: User | null }) {
  const [activeSubTab, setActiveSubTab] = useState<'users' | 'teams' | 'forms' | 'requests' | 'qualidade'>('users');
  const [users, setUsers] = useState<User[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [forms, setForms] = useState<EvaluationForm[]>([]);
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [loading, setLoading] = useState(true);

  const loadAllData = async () => {
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
        const [u, t, f, r] = await Promise.all([
          supabase.from('users').select('*'),
          supabase.from('teams').select('*'),
          supabase.from('forms').select('*'),
          supabase.from('access_requests').select('*')
        ]);
        setUsers(u.data || []);
        setTeams(t.data || []);
        setForms(f.data || []);
        setRequests(r.data || []);
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
                  ? 'bg-brand-primary text-white shadow-premium' 
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

  const filteredUsers = useMemo(() => {
    return users
      .filter(u => statusFilter === 'active' ? u.active !== false : u.active === false)
      .filter(u =>
        u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        u.email.toLowerCase().includes(searchTerm.toLowerCase())
      );
  }, [users, statusFilter, searchTerm]);

  const handleSaveUser = async () => {
    if (!editingUser.name || !editingUser.email) return;
    setSaving(true);
    try {
      const emailLower = editingUser.email.toLowerCase();
      const payload: any = {
        name: editingUser.name,
        email: emailLower,
        role: editingUser.role,
        active: true,
        team_ids: editingUser.team_ids || [],
        ...(editingUser.password ? { password: editingUser.password } : {})
      };

      if (!supabase) {
        if (editingUser.id) await mockDb.update('users', editingUser.id, payload);
        else await mockDb.insert('users', { ...payload, id: emailLower });
      } else {
        const { error } = editingUser.id 
          ? await supabase.from('users').update(payload).eq('id', editingUser.id)
          : await supabase.from('users').insert([payload]);
        if (error) throw error;
      }

      toast.success('Usuário salvo com sucesso!');
      setIsModalOpen(false);
      loadData();
    } catch (error: any) {
      toast.error('Erro ao salvar: ' + error.message);
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
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      toast.success('Email de recuperação enviado!');
    } catch (e: any) {
      toast.error('Erro ao enviar email: ' + e.message);
    }
  };

  const handleToggleStatus = async (id: string, active: boolean) => {
    try {
      if (!supabase) await mockDb.update('users', id, { active });
      else await supabase.from('users').update({ active }).eq('id', id);
      toast.success(active ? 'Reativado!' : 'Desativado!');
      setDeleteConfirmId(null);
      loadData();
    } catch (e) { toast.error('Erro ao alterar status'); }
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
              className="w-full h-full bg-white border border-surface-border rounded-2xl pl-11 pr-4 text-xs font-bold text-brand-primary placeholder:text-brand-muted/60 focus:border-brand-accent focus:outline-none transition-all"
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
                    {({ 'admin': 'Admin', 'qualidade': 'Qualidade', 'gestor_qualidade': 'Gestor Qual.', 'gestor_suporte': 'Gestor Suporte', 'suporte': 'Suporte' } as any)[u.role] || u.role}
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
                <button onClick={() => setIsModalOpen(false)} className="text-brand-muted hover:text-brand-primary"><X className="w-6 h-6" /></button>
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
                <Select 
                  label="Perfil"
                  value={editingUser.role}
                  onChange={e => setEditingUser({ ...editingUser, role: e.target.value as any })}
                  options={[
                    { value: 'admin', label: 'Administrador' },
                    { value: 'gestor_qualidade', label: 'Gestor Qual.' },
                    { value: 'gestor_suporte', label: 'Gestor Suporte' },
                    { value: 'qualidade', label: 'Qualidade' },
                    { value: 'suporte', label: 'Suporte' }
                  ]}
                />
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-black text-brand-muted uppercase tracking-widest ml-1">Equipes</label>
                  <div className="flex flex-wrap gap-2 p-3 bg-surface-bg border border-surface-border rounded-xl max-h-32 overflow-y-auto no-scrollbar">
                    {teams.filter(t => t.active !== false).map(t => (
                      <label key={t.id} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-[10px] font-black uppercase tracking-tight cursor-pointer transition-all ${editingUser.team_ids?.includes(t.id) ? 'bg-brand-primary text-white border-brand-primary shadow-sm' : 'bg-white text-brand-muted border-surface-border hover:border-brand-highlight'}`}>
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
  const [editingTeam, setEditingTeam] = useState<{ name: string, id?: string }>({ name: '' });
  const [saving, setSaving] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'active' | 'inactive'>('active');
  const [searchTerm, setSearchTerm] = useState('');

  const filteredTeams = useMemo(() => {
    return teams
      .filter(t => statusFilter === 'active' ? t.active !== false : t.active === false)
      .filter(t => t.name.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [teams, statusFilter, searchTerm]);

  const handleSaveTeam = async () => {
    if (!editingTeam.name) return toast.error('O nome da equipe é obrigatório.');
    setSaving(true);
    try {
      const payload = { name: editingTeam.name, active: true };
      if (!supabase) {
        if (editingTeam.id) await mockDb.update('teams', editingTeam.id, payload);
        else await mockDb.insert('teams', payload);
      } else {
        const { error } = await supabase.from('teams').upsert([{ ...(editingTeam.id ? { id: editingTeam.id } : {}), ...payload }]);
        if (error) throw error;
      }
      toast.success('Equipe salva com sucesso!');
      setIsModalOpen(false);
      loadData();
    } catch (e) { toast.error('Erro ao salvar'); }
    finally { setSaving(false); }
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
      toast.success(active ? 'Ativada!' : 'Desativada!');
      setDeleteConfirmId(null);
      loadData();
    } catch (e) { toast.error('Erro ao alterar status'); }
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
              className="w-full h-full bg-white border border-surface-border rounded-2xl pl-11 pr-4 text-xs font-bold text-brand-primary placeholder:text-brand-muted/60 focus:border-brand-accent focus:outline-none transition-all"
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

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredTeams.map(t => (
          <Card key={t.id} className="group hover:border-brand-accent transition-all relative overflow-hidden">
            {t.active === false && <div className="absolute inset-0 bg-surface-bg/60 backdrop-blur-[1px] z-10 flex items-center justify-center"><Badge variant="error">Desativada</Badge></div>}
            <div className="flex justify-between items-start">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-2xl bg-brand-subtle flex items-center justify-center text-brand-primary">
                  <Shield className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-black text-brand-primary uppercase tracking-tight">{t.name}</h4>
                  <p className="text-[10px] font-bold text-brand-muted uppercase mt-0.5">{users.filter(u => u.team_ids?.includes(t.id)).length} Agentes</p>
                </div>
              </div>
              <div className="flex gap-1">
                <button onClick={() => { setEditingTeam(t); setIsModalOpen(true); }} className="p-2 rounded-xl hover:bg-surface-subtle text-brand-muted hover:text-brand-primary transition-all"><Edit2 className="w-4 h-4" /></button>
                {deleteConfirmId === t.id ? (
                  <div className="flex items-center gap-1 animate-in fade-in slide-in-from-right-2">
                    <button onClick={() => handleToggleStatus(t.id, false)} className="px-2.5 py-1.5 rounded-lg bg-error text-white text-[10px] font-black uppercase">Sim</button>
                    <button onClick={() => setDeleteConfirmId(null)} className="px-2.5 py-1.5 rounded-lg bg-surface-subtle text-brand-muted text-[10px] font-black uppercase tracking-widest">Não</button>
                  </div>
                ) : (
                  <button onClick={() => setDeleteConfirmId(t.id)} className="p-2.5 rounded-xl hover:bg-red-50 text-brand-muted hover:text-error transition-all"><Trash2 className="w-4 h-4" /></button>
                )}
              </div>
            </div>
          </Card>
        ))}
      </div>

      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <Card className="max-w-md w-full">
              <header className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-black text-brand-primary tracking-tight uppercase">{editingTeam.id ? 'Editar Equipe' : 'Nova Equipe'}</h3>
                <button onClick={() => setIsModalOpen(false)} className="text-brand-muted hover:text-brand-primary"><X className="w-6 h-6" /></button>
              </header>
              <div className="space-y-4">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-black text-brand-muted uppercase tracking-widest ml-1">Nome da Equipe</label>
                  <input type="text" className="w-full bg-surface-bg border border-surface-border rounded-xl py-3 px-4 text-sm font-semibold focus:border-brand-accent focus:outline-none" value={editingTeam.name} onChange={e => setEditingTeam({ ...editingTeam, name: e.target.value })} />
                </div>
                <Button className="w-full" onClick={handleSaveTeam} disabled={saving}>{saving ? 'Salvando...' : 'Salvar Equipe'}</Button>
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

  const filteredForms = useMemo(() => {
    return forms
      .filter(f => statusFilter === 'active' ? f.active !== false : f.active === false)
      .filter(f => f.title.toLowerCase().includes(searchTerm.toLowerCase()));
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
      toast.success(active ? 'Ativado!' : 'Desativado!');
      setDeleteConfirmId(null);
      loadForms();
    } catch (e) { toast.error('Erro ao alterar status'); }
  };

  const handleSaveForm = async () => {
    if (!editingForm.title || !editingForm.sections?.length) return toast.error('Preencha os campos obrigatórios.');
    setSaving(true);
    try {
      const payload = { ...editingForm, active: true, created_by: currentUser?.email };
      if (!supabase) {
        if (editingForm.id) await mockDb.update('forms', editingForm.id, payload);
        else await mockDb.insert('forms', payload);
      } else {
        const { error } = await supabase.from('forms').upsert([{ ...(editingForm.id ? { id: editingForm.id } : {}), ...payload }]);
        if (error) throw error;
      }
      toast.success('Formulário salvo!');
      setIsModalOpen(false);
      loadForms();
    } catch (e) { toast.error('Erro ao salvar'); }
    finally { setSaving(false); }
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
              className="w-full h-full bg-white border border-surface-border rounded-2xl pl-11 pr-4 text-xs font-bold text-brand-primary placeholder:text-brand-muted/60 focus:border-brand-accent focus:outline-none transition-all"
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
        <Button onClick={() => { setEditingForm({ title: '', description: '', team_id: '', sections: [], critical_errors: [] }); setIsModalOpen(true); }} icon={<Plus className="w-4 h-4" />}>Novo Formulário</Button>
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
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col bg-white rounded-[32px] shadow-2xl">
              <header className="flex items-center justify-between p-8 border-b border-surface-border bg-white sticky top-0 z-10">
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
                            className="w-full bg-white border border-surface-border rounded-2xl px-6 py-4 text-sm font-bold text-brand-primary focus:border-brand-accent focus:ring-4 focus:ring-brand-accent/5 outline-none transition-all shadow-sm" 
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
                            className="w-full bg-white border border-surface-border rounded-3xl px-6 py-4 text-sm font-bold text-brand-primary focus:border-brand-accent focus:ring-4 focus:ring-brand-accent/5 outline-none transition-all min-h-[150px] shadow-sm leading-relaxed" 
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
                        <div key={section.id} className="bg-white rounded-[32px] border border-surface-border shadow-premium-sm overflow-hidden border-l-8 border-l-brand-accent">
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
                                <div className="flex items-center gap-2 bg-white border border-surface-border rounded-xl px-3 py-1.5 shadow-sm">
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
                                <div key={q.id} className="flex items-center gap-4 p-4 rounded-2xl bg-white border border-surface-border group hover:border-brand-accent/40 transition-all shadow-sm">
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
                                  </div>
                                  <button onClick={() => removeQuestion(section.id, q.id)} className="p-2 text-brand-muted/30 hover:text-error transition-colors opacity-0 group-hover:opacity-100"><X className="w-4 h-4" /></button>
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
                        <div className="bg-white/50 p-16 rounded-[40px] border-2 border-dashed border-surface-border text-center">
                          <div className="w-20 h-20 rounded-[2.5rem] bg-white shadow-premium flex items-center justify-center mx-auto mb-6">
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
                        <div key={ce.id} className="flex items-center gap-4 p-5 rounded-2xl bg-white border border-surface-border border-l-8 border-l-error group hover:border-error/20 transition-all shadow-sm">
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
                        <div className="py-20 text-center border-2 border-dashed border-surface-border/40 rounded-[40px] bg-white/30">
                          <AlertOctagon className="w-12 h-12 text-brand-muted/20 mx-auto mb-4" />
                          <p className="text-[10px] font-black text-brand-muted uppercase tracking-widest">Nenhum erro crítico foi configurado para este formulário</p>
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </div>
              
              <footer className="p-8 border-t border-surface-border bg-white flex items-center justify-between sticky bottom-0">
                <div className="flex items-center gap-4">
                  {totalWeight !== 100 && (
                    <div className="flex items-center gap-2 text-error animate-pulse">
                      <AlertTriangle className="w-4 h-4" />
                      <span className="text-[10px] font-black uppercase tracking-widest">O peso total deve ser 100% (Atual: {totalWeight}%)</span>
                    </div>
                  )}
                  {totalWeight === 100 && (
                    <div className="flex items-center gap-2 text-success">
                      <Check className="w-4 h-4" />
                      <span className="text-[10px] font-black uppercase tracking-widest">Estrutura de pesos válida</span>
                    </div>
                  )}
                </div>
                <div className="flex gap-4">
                  <Button variant="ghost" onClick={() => setIsModalOpen(false)} className="rounded-2xl px-6">Cancelar</Button>
                  <Button onClick={handleSaveForm} disabled={saving || totalWeight !== 100} className="rounded-2xl px-10 shadow-premium shadow-brand-primary/20">
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
  const [statusFilter, setStatusFilter] = useState<'pending' | 'approved' | 'rejected'>('pending');
  const [isApproveModalOpen, setIsApproveModalOpen] = useState(false);
  const [approvingReq, setApprovingReq] = useState<any>(null);
  const [approveData, setApproveData] = useState<{ name: string, email: string, role: string, team_ids: string[] }>({ name: '', email: '', role: 'suporte', team_ids: [] });
  const [saving, setSaving] = useState(false);

  useEffect(() => { setRequests(initialRequests); }, [initialRequests]);

  const handleApprove = async () => {
    setSaving(true);
    try {
      const payload = { ...approveData, active: true, must_change_password: true, reset_token: Math.random().toString(36).substr(2, 10) };
      if (!supabase) {
        await mockDb.update('access_requests', approvingReq.id, { status: 'approved' });
        await mockDb.insert('users', { id: approveData.email, ...payload });
      } else {
        await supabase.from('access_requests').update({ status: 'approved' }).eq('id', approvingReq.id);
        await supabase.from('users').upsert([payload], { onConflict: 'email' });
        await supabase.functions.invoke('send-email', { body: { email: payload.email, name: payload.name, type: 'welcome', token: payload.reset_token } });
      }
      toast.success('Solicitação aprovada e e-mail enviado!');
      setIsApproveModalOpen(false);
      loadData();
    } catch (e) { toast.error('Erro ao aprovar'); }
    finally { setSaving(false); }
  };

  const handleReject = async (id: string) => {
    try {
      if (!supabase) await mockDb.update('access_requests', id, { status: 'rejected' });
      else await supabase.from('access_requests').update({ status: 'rejected' }).eq('id', id);
      toast.success('Rejeitada.');
      loadData();
    } catch (e) { toast.error('Erro ao rejeitar'); }
  };

  const filtered = requests.filter(r => r.status === statusFilter);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Select 
          value={statusFilter} 
          onChange={e => setStatusFilter(e.target.value as any)} 
          options={[{ value: 'pending', label: 'Pendentes' }, { value: 'approved', label: 'Aprovadas' }, { value: 'rejected', label: 'Rejeitadas' }]} 
        />
        <Button variant="ghost" onClick={loadData} icon={<RefreshCw className="w-4 h-4" />}>Atualizar</Button>
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
                <Button variant="outline" size="sm" onClick={() => handleReject(req.id)} className="text-error hover:bg-red-50">Recusar</Button>
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
                  <Select label="Perfil" value={approveData.role} onChange={e => setApproveData({...approveData, role: e.target.value})} options={[{ value: 'admin', label: 'Admin' }, { value: 'gestor_qualidade', label: 'Gestor Qual.' }, { value: 'gestor_suporte', label: 'Gestor Suporte' }, { value: 'qualidade', label: 'Qualidade' }, { value: 'suporte', label: 'Suporte' }]} />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-black text-brand-muted uppercase tracking-widest ml-1">Equipes</label>
                  <div className="flex flex-wrap gap-2 p-3 bg-surface-bg border border-surface-border rounded-xl">
                    {teams.map(t => (
                      <label key={t.id} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-[10px] font-black uppercase tracking-tight cursor-pointer transition-all ${approveData.team_ids?.includes(t.id) ? 'bg-brand-primary text-white border-brand-primary' : 'bg-white text-brand-muted border-surface-border'}`}>
                        <input type="checkbox" className="hidden" checked={approveData.team_ids?.includes(t.id)} onChange={e => {
                          const newIds = e.target.checked ? [...approveData.team_ids, t.id] : approveData.team_ids.filter(id => id !== t.id);
                          setApproveData({...approveData, team_ids: newIds});
                        }} />
                        {t.name}
                      </label>
                    ))}
                  </div>
                </div>
                <Button className="w-full mt-4" onClick={handleApprove} disabled={saving} icon={<Check className="w-4 h-4" />}>{saving ? 'Processando...' : 'Confirmar Aprovação'}</Button>
              </div>
            </Card>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
