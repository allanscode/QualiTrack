import React, { useState, useEffect, useMemo } from 'react';
import { supabase, mockDb, requireAccessToken } from '../../lib/supabase';
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
  RefreshCw,
  Star
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
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

interface UsersManagementProps {
  users: User[];
  teams: Team[];
  loadData: () => void;
}

export default function UsersManagement({ users, teams, loadData }: UsersManagementProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'active' | 'inactive'>('active');
  const [editingUser, setEditingUser] = useState<{ name: string, email: string, role: string, team_ids: string[], primary_team_id?: string, password?: string, id?: string }>({ name: '', email: '', role: 'suporte', team_ids: [], primary_team_id: '', password: '' });
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
        matchesSearch(u.name, searchTerm) ||
        matchesSearch(u.email, searchTerm)
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [users, statusFilter, searchTerm, roleFilter, teamFilter]);

  const syncUserTeams = async (userId: string, teamIds: string[]) => {
    let existing: any[] = [];
    if (supabase) {
      const { data } = await supabase.from('user_teams').select('*').eq('user_id', userId);
      existing = data || [];
    } else {
      const { data } = await mockDb.get('user_teams');
      existing = (data || []).filter((ut: any) => ut.user_id === userId);
    }
    const existingTeamIds = existing.map((ut: any) => ut.team_id);
    const toAdd = teamIds.filter(id => !existingTeamIds.includes(id));
    const toRemove = existing.filter((ut: any) => !teamIds.includes(ut.team_id));

    // supabase-js devolve { error } em vez de lançar: sem checar, o vínculo
    // de equipes falharia em silêncio e o usuário ficaria sem equipe alguma,
    // sem nenhum aviso na tela.
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
      const inserts = toAdd.map(team_id => ({ user_id: userId, team_id }));
      if (supabase) {
        const { error } = await supabase.from('user_teams').insert(inserts);
        if (error) throw error;
      } else {
        for (const ins of inserts) await mockDb.insert('user_teams', ins);
      }
    }
  };

  const handleSaveUser = async () => {
    if (!editingUser.name || !editingUser.email) return;
    setSaving(true);
    const executeWithRetry = async (retryCount = 0): Promise<void> => {
      try {
        const emailLower = editingUser.email.toLowerCase();
        const teamIds = editingUser.team_ids || [];

        if (!supabase) {
          const payload = { ...editingUser, email: emailLower, active: true, team_ids: teamIds };
          if (editingUser.id) {
            await mockDb.update('users', editingUser.id, payload);
            await syncUserTeams(editingUser.id, teamIds);
          } else {
            const newUser = await mockDb.insert('users', { ...payload, id: emailLower });
            await syncUserTeams(newUser.data.id, teamIds);
          }
          return;
        }

        // Falha cedo e com mensagem util se a sessao tiver expirado.
        const accessToken = await requireAccessToken();

        const userPayload = {
          name: editingUser.name,
          email: emailLower,
          role: editingUser.role,
          primary_team_id: editingUser.primary_team_id || null,
          active: true
        };

        const operation = (async () => {
          let userId = editingUser.id;
          if (editingUser.id) {
            const { error } = await supabase.from('users').update(userPayload).eq('id', editingUser.id);
            if (error) throw error;
            await syncUserTeams(editingUser.id, teamIds);
          } else {
            const { data, error: funcError } = await supabase.functions.invoke('admin-invite-user', {
              headers: { Authorization: `Bearer ${accessToken}` },
              body: { ...userPayload, team_ids: teamIds }
            });
            if (funcError) throw funcError;
            if (data?.success === false) throw new Error(data.details?.message || 'Erro ao convidar usuário');
            userId = data?.user?.id || null;
            if (userId) await syncUserTeams(userId, teamIds);
          }
        })();

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
      else {
        const { error } = await supabase.from('users').update({ active }).eq('id', id);
        if (error) throw error;
      }
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
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Buscar usuário..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full h-full bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 rounded-lg pl-9 pr-4 text-sm font-normal text-slate-900 dark:text-slate-50 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-slate-400 dark:focus:border-slate-600 focus:outline-none focus:ring-0 transition-all shadow-sm"
            />
          </div>
          <div className="flex items-center gap-2">
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
        <Button 
          onClick={() => { setEditingUser({ name: '', email: '', role: 'suporte', team_ids: [], primary_team_id: '', password: '' }); setTeamSearch(''); setIsModalOpen(true); }} 
          icon={<UserPlus className="w-4 h-4 transition-transform duration-200 group-hover:scale-110" />}
          className="group bg-brand-primary text-brand-on-primary hover:bg-brand-primary/95 hover:shadow-premium-lg hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] transition-all duration-200"
        >
          NOVO USUÁRIO
        </Button>
      </div>

      <Card padding="none" className="overflow-visible">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-surface-bg border-b border-surface-border">
              <th className="px-6 py-4 text-[10px] font-black uppercase text-brand-muted tracking-widest">Usuário</th>
              <th className="px-6 py-4 text-[10px] font-black uppercase text-brand-muted tracking-widest">Perfil</th>
              <th className="px-6 py-4 text-[10px] font-black uppercase text-brand-muted tracking-widest">Equipe</th>
              <th className="px-6 py-4 text-right text-[10px] font-black uppercase text-brand-muted tracking-widest">Ações</th>
              <th className="px-6 py-4 w-12"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-subtle">
            {filteredUsers.map(u => (
              <tr key={u.id} className="hover:bg-surface-bg/50 transition-colors group">
                <td className="px-6 py-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-brand-subtle flex items-center justify-center text-brand-primary text-xs font-black shrink-0 shadow-sm">
                      {getInitials(u.name)}
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
                <td className="px-6 py-3">
                  <Badge variant="neutral" className="bg-surface-subtle text-brand-primary">
                    {ROLE_LABELS[u.role] || u.role}
                  </Badge>
                </td>
                <td className="px-6 py-3 text-xs font-bold text-brand-muted whitespace-nowrap">
                  {(() => {
                    if (!u.team_ids || u.team_ids.length === 0) return (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-lg bg-surface-subtle text-[10px] font-black text-brand-muted uppercase tracking-wider">
                        Sem equipe
                      </span>
                    );
                    
                    const activeTeams = u.team_ids
                      .map(id => teams.find(t => t.id === id && t.active !== false))
                      .filter(Boolean) as Team[];
                    
                    if (activeTeams.length === 0) return (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-lg bg-surface-subtle text-[10px] font-black text-brand-muted uppercase tracking-wider">
                        Sem equipe
                      </span>
                    );
                    
                    const primaryTeam = activeTeams.find(t => t.id === u.primary_team_id) || activeTeams[0];
                    const remainingTeamNames = activeTeams
                      .filter(t => t.id !== primaryTeam.id)
                      .map(t => t.name);

                    return (
                      <div className="flex items-center gap-1.5">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-lg bg-blue-50 dark:bg-blue-950/30 text-[10px] font-black text-blue-600 dark:text-blue-400 border border-blue-100/50 dark:border-blue-900/30 uppercase tracking-wider">
                          {primaryTeam.name}
                        </span>
                        {remainingTeamNames.length > 0 && (
                          <div className="relative group/popover">
                            <span className="inline-flex items-center justify-center px-1.5 py-0.5 rounded-lg bg-brand-accent/10 dark:bg-brand-accent/20 text-[10px] font-black text-brand-accent hover:bg-brand-accent hover:text-white transition-all cursor-pointer">
                              +{remainingTeamNames.length}
                            </span>
                            {/* Popover */}
                            <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 hidden group-hover/popover:block z-50 min-w-[160px] bg-surface-card border border-surface-border rounded-xl shadow-premium-lg p-2.5 animate-in fade-in slide-in-from-bottom-2 duration-150 text-left">
                              <p className="text-[9px] font-black text-brand-muted uppercase tracking-widest border-b border-surface-border pb-1.5 mb-1.5">Outras Equipes</p>
                              <div className="space-y-1 max-h-36 overflow-y-auto no-scrollbar animate-in fade-in duration-200">
                                {remainingTeamNames.map((name, idx) => (
                                  <div key={idx} className="text-[10px] font-black text-brand-primary py-1 px-1.5 hover:bg-surface-bg rounded-md transition-colors uppercase tracking-wider">
                                    {name}
                                  </div>
                                ))}
                              </div>
                              {/* Arrow */}
                              <div className="absolute left-1/2 -translate-x-1/2 top-full w-2 h-2 bg-surface-card border-r border-b border-surface-border rotate-45 -mt-1"></div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </td>
                <td className="px-6 py-3 text-right">
                  <div className="flex justify-end gap-1">
                    {u.active === false ? (
                      <Button variant="outline" size="sm" onClick={() => handleToggleStatus(u.id, true)} icon={<RefreshCw className="w-3.5 h-3.5" />}>Reativar</Button>
                    ) : (
                      <>
                        <button 
                          onClick={() => handleResetPassword(u.email)} 
                          title="Reenviar Senha"
                          className="group p-2.5 rounded-lg hover:bg-brand-subtle text-brand-muted hover:text-brand-primary transition-all duration-200 cursor-pointer"
                        >
                          <Key className="w-4 h-4 transition-transform duration-200 group-hover:scale-110" />
                        </button>
                        <button 
                          onClick={() => { 
                            const activeTeamIds = u.team_ids?.filter(id => teams.find(t => t.id === id)?.active !== false) || [];
                            const primaryTeamId = u.primary_team_id || activeTeamIds[0] || '';
                            setEditingUser({...u, team_ids: activeTeamIds, primary_team_id: primaryTeamId}); 
                            setTeamSearch(''); 
                            setIsModalOpen(true); 
                          }} 
                          className="group p-2.5 rounded-lg hover:bg-surface-subtle text-brand-muted hover:text-brand-primary transition-all duration-200 cursor-pointer"
                        >
                          <Edit2 className="w-4 h-4 transition-transform duration-200 group-hover:scale-110" />
                        </button>
                      </>
                    )}
                  </div>
                </td>
                <td className="px-6 py-3 text-right w-12">
                  {u.active !== false && (
                    <div className="flex justify-end">
                      {deleteConfirmId === u.id ? (
                        <div className="flex items-center gap-1 animate-in fade-in slide-in-from-right-2">
                          <button onClick={() => handleToggleStatus(u.id, false)} className="px-2.5 py-1.5 rounded-lg bg-error text-white text-[10px] font-black uppercase">Sim</button>
                          <button onClick={() => setDeleteConfirmId(null)} className="px-2.5 py-1.5 rounded-lg bg-surface-subtle text-brand-muted text-[10px] font-black uppercase tracking-widest">Não</button>
                        </div>
                      ) : (
                        <button 
                          onClick={() => setDeleteConfirmId(u.id)} 
                          title="Desativar Usuário"
                          className="group p-2.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/50 text-brand-muted hover:text-error dark:hover:text-red-400 opacity-40 group-hover:opacity-70 hover:!opacity-100 transition-all duration-200 cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4 transition-transform duration-200 group-hover:scale-110" />
                        </button>
                      )}
                    </div>
                  )}
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
                  <label className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400 font-semibold mb-1.5 ml-0.5 block">Nome Completo</label>
                  <input type="text" className="w-full bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 rounded-lg py-2 px-3 text-sm font-medium text-slate-900 dark:text-slate-50 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-slate-400 dark:focus:border-slate-600 focus:outline-none focus:ring-0 transition-all shadow-sm" value={editingUser.name} onChange={e => setEditingUser({ ...editingUser, name: e.target.value })} />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400 font-semibold mb-1.5 ml-0.5 block">Email</label>
                  <input type="email" disabled={!!editingUser.id} className="w-full bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 rounded-lg py-2 px-3 text-sm font-medium text-slate-900 dark:text-slate-50 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-slate-400 dark:focus:border-slate-600 focus:outline-none focus:ring-0 transition-all shadow-sm disabled:opacity-50" value={editingUser.email} onChange={e => setEditingUser({ ...editingUser, email: e.target.value.toLowerCase() })} />
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
                    <label className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400 font-semibold ml-0.5">Equipes</label>
                    {teams.filter(t => t.active !== false).length > 8 && (
                      <div className="relative w-32 h-7">
                        <Search className="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
                        <input 
                          type="text" 
                          placeholder="Buscar..." 
                          className="w-full h-full bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 rounded-lg pl-6 pr-2 text-[10px] font-medium text-slate-900 dark:text-slate-50 focus:border-slate-400 dark:focus:border-slate-600 focus:outline-none focus:ring-0 transition-all"
                          value={teamSearch}
                          onChange={e => setTeamSearch(e.target.value)}
                        />
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-1 gap-y-2 p-4 bg-white dark:bg-slate-900/20 border border-slate-200 dark:border-slate-800 rounded-lg max-h-40 overflow-y-auto scrollbar-thin">
                     {teams.filter(t => t.active !== false)
                       .filter(t => matchesSearch(t.name, teamSearch))
                       .sort((a, b) => a.name.localeCompare(b.name))
                       .map(t => {
                        const isChecked = editingUser.team_ids?.includes(t.id) || false;
                        const isPrimary = editingUser.primary_team_id === t.id;

                        return (
                          <div key={t.id} className="flex items-center justify-between py-1 px-2 hover:bg-slate-50 dark:hover:bg-slate-900/30 rounded-lg transition-colors group">
                            <label className="flex items-center gap-2.5 cursor-pointer flex-1 min-w-0">
                              <input
                                type="checkbox"
                                className="w-4 h-4 rounded border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:ring-slate-500/20 focus:ring-offset-0 accent-slate-900 dark:accent-slate-50 transition-all cursor-pointer shrink-0"
                                checked={isChecked}
                                onChange={(e) => {
                                  const newIds = e.target.checked
                                    ? [...(editingUser.team_ids || []), t.id]
                                    : (editingUser.team_ids || []).filter(id => id !== t.id);
                                  
                                  let newPrimary = editingUser.primary_team_id;
                                  if (!e.target.checked && newPrimary === t.id) {
                                    newPrimary = newIds[0] || '';
                                  } else if (e.target.checked && !newPrimary) {
                                    newPrimary = t.id;
                                  }
                                  
                                  setEditingUser({ ...editingUser, team_ids: newIds, primary_team_id: newPrimary });
                                }}
                              />
                              <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide group-hover:text-slate-900 dark:group-hover:text-white transition-colors truncate">
                                {t.name}
                              </span>
                            </label>
                            {isChecked && (
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingUser({ ...editingUser, primary_team_id: t.id });
                                }}
                                title={isPrimary ? "Equipe Principal" : "Definir como Principal"}
                                className="p-1 text-slate-400 dark:text-slate-500 hover:text-amber-500 dark:hover:text-amber-400 transition-colors shrink-0"
                              >
                                <Star className={`w-3.5 h-3.5 ${isPrimary ? 'text-amber-500 dark:text-amber-400 fill-amber-500 dark:fill-amber-400' : ''}`} />
                              </button>
                            )}
                          </div>
                        );
                      })}
                    {teams.filter(t => t.active !== false).length === 0 && (
                      <p className="text-[10px] font-bold text-brand-muted uppercase italic p-2 col-span-2 text-center">Nenhuma equipe ativa cadastrada.</p>
                    )}
                    {teams.filter(t => t.active !== false).length > 0 && teams.filter(t => t.active !== false).filter(t => matchesSearch(t.name, teamSearch)).length === 0 && (
                      <p className="text-[10px] font-bold text-brand-muted uppercase italic p-2 col-span-2 text-center">Nenhuma equipe encontrada.</p>
                    )}
                  </div>
                </div>

                 <Button 
                  className="w-full mt-4 group bg-brand-primary text-brand-on-primary hover:bg-brand-primary/95 hover:shadow-premium-lg hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] disabled:bg-surface-border dark:disabled:bg-surface-border disabled:text-brand-muted dark:disabled:text-brand-muted disabled:opacity-100 disabled:transform-none disabled:shadow-none transition-all duration-200 py-2.5 px-8" 
                  onClick={handleSaveUser} 
                  disabled={saving} 
                  icon={<Save className="w-4 h-4 transition-transform duration-200 group-hover:scale-110" />}
                >
                  {saving ? 'SALVANDO...' : 'SALVAR'}
                </Button>
              </div>
            </Card>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
