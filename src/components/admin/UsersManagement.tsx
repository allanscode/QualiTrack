import React, { useState, useEffect, useMemo } from 'react';
import { supabase, mockDb } from '../../lib/supabase';
import { User, Team, ROLE_LABELS } from '../../types';
import { 
  Search, 
  UserPlus, 
  Mail, 
  Key, 
  Edit2, 
  Trash2, 
  X, 
  Save, 
  RefreshCw 
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import CustomSelect from '../ui/CustomSelect';

interface UsersManagementProps {
  users: User[];
  teams: Team[];
  loadData: () => void;
}

export default function UsersManagement({ users, teams, loadData }: UsersManagementProps) {
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

        // 1. Session warmup
        await supabase.auth.getSession();

        const emailLower = editingUser.email.toLowerCase();
        const payload = {
          name: editingUser.name,
          email: emailLower,
          role: editingUser.role,
          active: true,
          team_ids: editingUser.team_ids || []
        };

        // 2. Define Operation
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

        // 3. Timeout race
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 15000));
        await Promise.race([operation, timeoutPromise]);

      } catch (err: any) {
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
                    {ROLE_LABELS[u.role] || u.role}
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
