import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot, doc, setDoc, deleteDoc, getDocs, where } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { User, Team, EvaluationForm } from '../types';
import { Users, Layout, ClipboardList, Plus, Trash2, Edit2, Shield, UserPlus, Save, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';

export default function AdminPanel({ user }: { user: User | null }) {
  const [activeSubTab, setActiveSubTab] = useState<'users' | 'teams' | 'forms' | 'requests'>('users');
  const [users, setUsers] = useState<User[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
      setUsers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as User)));
    });
    const unsubTeams = onSnapshot(collection(db, 'teams'), (snapshot) => {
      setTeams(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Team)));
      setLoading(false);
    });
    return () => { unsubUsers(); unsubTeams(); };
  }, []);

  return (
    <div className="space-y-8">
      {/* Sub Navigation */}
      <div className="flex gap-4 border-b border-[#E2E4D8]">
        <SubNavItem active={activeSubTab === 'users'} onClick={() => setActiveSubTab('users')} icon={<Users className="w-4 h-4" />} label="Usuários" />
        <SubNavItem active={activeSubTab === 'teams'} onClick={() => setActiveSubTab('teams')} icon={<Shield className="w-4 h-4" />} label="Equipes" />
        <SubNavItem active={activeSubTab === 'forms'} onClick={() => setActiveSubTab('forms')} icon={<ClipboardList className="w-4 h-4" />} label="Formulários" />
        <SubNavItem active={activeSubTab === 'requests'} onClick={() => setActiveSubTab('requests')} icon={<UserPlus className="w-4 h-4" />} label="Solicitações" />
      </div>

      <AnimatePresence mode="wait">
        {activeSubTab === 'users' && <UsersManagement users={users} teams={teams} key="users" />}
        {activeSubTab === 'teams' && <TeamsManagement teams={teams} users={users} key="teams" />}
        {activeSubTab === 'forms' && <FormsManagement user={user} teams={teams} key="forms" />}
        {activeSubTab === 'requests' && <RequestsManagement key="requests" users={users} teams={teams} />}
      </AnimatePresence>
    </div>
  );
}

function SubNavItem({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) {
  return (
    <button 
      onClick={onClick}
      className={`flex items-center gap-2 px-6 py-4 text-sm font-bold transition-all relative ${active ? 'text-[#2D3A3A]' : 'text-[#7A7D71] hover:text-[#2D3A3A]'}`}
    >
      {icon} {label}
      {active && <motion.div layoutId="subnav" className="absolute bottom-0 left-0 right-0 h-1 bg-[#A7C0A5] rounded-t-full" />}
    </button>
  );
}

function UsersManagement({ users, teams }: { users: User[], teams: Team[] }) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<{name: string, email: string, role: string, teamId: string, id?: string}>({ name: '', email: '', role: 'tecnico', teamId: '' });
  const [saving, setSaving] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const activeUsers = users.filter(u => u.active !== false);

  const handleSaveUser = async () => {
    if (!editingUser.name || !editingUser.email) return;
    setSaving(true);
    try {
      const emailLower = editingUser.email.toLowerCase();
      const payload: any = {
        name: editingUser.name,
        email: emailLower,
        role: editingUser.role,
        teamId: editingUser.teamId || null,
        active: true,
      };
      if (!editingUser.id) {
        payload.createdAt = new Date().toISOString();
      }
      await setDoc(doc(db, 'users', emailLower), payload, { merge: true });
      toast.success(editingUser.id ? 'Usuário atualizado com sucesso!' : 'Usuário criado com sucesso!');
      setIsModalOpen(false);
      setEditingUser({ name: '', email: '', role: 'tecnico', teamId: '' });
    } catch (error) {
       console.error(error);
       toast.error("Erro ao salvar usuário");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteUser = async (id: string) => {
    try {
      const agentQuery = await getDocs(query(collection(db, 'monitorias'), where('agentId', '==', id)));
      const auditorQuery = await getDocs(query(collection(db, 'monitorias'), where('auditorId', '==', id)));
      
      if (!agentQuery.empty || !auditorQuery.empty) {
        // Soft delete para manter a integridade das monitorias
        await setDoc(doc(db, 'users', id), { active: false }, { merge: true });
        toast.success('Usuário desativado com sucesso. Ele foi mantido no sistema para preservar o histórico de monitorias.');
      } else {
        // Hard delete
        await deleteDoc(doc(db, 'users', id));
        toast.success('Usuário excluído com sucesso.');
      }
      setDeleteConfirmId(null);
    } catch (e) {
      console.error(e);
      toast.error('Erro ao excluir usuário');
    }
  };

  const openEdit = (u: User) => {
    setEditingUser({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      teamId: u.teamId || ''
    });
    setIsModalOpen(true);
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-6">
      <div className="flex justify-between items-center px-2">
        <h3 className="text-2xl font-bold text-[#2D3A3A]">Gerenciamento de Usuários</h3>
        <button 
          onClick={() => {
            setEditingUser({ name: '', email: '', role: 'tecnico', teamId: '' });
            setIsModalOpen(true);
          }}
          className="bg-[#2D3A3A] text-white px-6 py-2.5 rounded-2xl text-sm font-bold shadow-lg shadow-[#2D3A3A]/20 hover:bg-opacity-90 flex items-center gap-2 transition-all">
          <UserPlus className="w-4 h-4" /> Adicionar Usuário
        </button>
      </div>

      <div className="bg-white rounded-[40px] border border-[#E2E4D8] shadow-sm overflow-hidden flex flex-col">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-[#F9F9F6] text-[11px] uppercase tracking-widest text-[#7A7D71] font-bold">
              <tr>
                <th className="px-8 py-4">Nome</th>
                <th className="px-8 py-4">Email</th>
                <th className="px-8 py-4">Cargo</th>
                <th className="px-8 py-4">Equipe</th>
                <th className="px-8 py-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="text-sm text-[#3D4035]">
              {activeUsers.map(u => (
                <tr key={u.id} className="border-b border-[#F0F1E8] hover:bg-[#F9F9F6] transition-colors">
                  <td className="px-8 py-4 font-semibold text-[#2D3A3A]">{u.name}</td>
                  <td className="px-8 py-4 text-[#7A7D71]">{u.email}</td>
                  <td className="px-8 py-4">
                    <span className="text-[10px] font-bold uppercase tracking-widest px-3 py-1 bg-[#E2E4D8] text-[#2D3A3A] rounded-full">
                      {u.role}
                    </span>
                  </td>
                  <td className="px-8 py-4 text-[#7A7D71] text-xs">
                    {u.teamId ? teams.find(t => t.id === u.teamId)?.name : ''}
                  </td>
                  <td className="px-8 py-4 text-right">
                    <div className="flex justify-end gap-2">
                       {deleteConfirmId === u.id ? (
                        <>
                          <button onClick={() => handleDeleteUser(u.id)} className="px-3 py-1 bg-red-500 text-white text-[10px] uppercase font-bold tracking-widest rounded-lg hover:bg-red-600 transition-colors">Confirmar</button>
                          <button onClick={() => setDeleteConfirmId(null)} className="px-3 py-1 bg-[#E2E4D8] text-[#2D3A3A] text-[10px] uppercase font-bold tracking-widest rounded-lg hover:bg-[#D0D3C5] transition-colors">Cancelar</button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => openEdit(u)} className="p-2.5 rounded-xl hover:bg-[#E2E4D8] text-[#7A7D71] hover:text-[#2D3A3A] transition-colors"><Edit2 className="w-4 h-4" /></button>
                          <button onClick={() => setDeleteConfirmId(u.id)} className="p-2.5 rounded-xl hover:bg-red-50 text-red-500 hover:text-red-600 transition-colors"><Trash2 className="w-4 h-4" /></button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {activeUsers.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-8 py-12 text-center text-[#7A7D71]">Nenhum usuário ativo</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#2D3A3A]/40 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-[32px] p-8 w-full max-w-md shadow-2xl relative"
            >
              <button 
                onClick={() => setIsModalOpen(false)}
                className="absolute right-6 top-6 p-2 rounded-xl text-[#7A7D71] hover:bg-[#F0F1E8] transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
              
              <h3 className="text-2xl font-bold text-[#2D3A3A] mb-6">{editingUser.id ? 'Editar Usuário' : 'Novo Usuário'}</h3>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold tracking-widest text-[#7A7D71] uppercase mb-2">Nome Completo</label>
                  <input type="text" className="w-full bg-[#F9F9F6] border border-[#E2E4D8] rounded-2xl py-3 px-4 text-sm focus:border-[#A7C0A5] focus:ring-1 focus:ring-[#A7C0A5] focus:outline-none" value={editingUser.name} onChange={e => setEditingUser({...editingUser, name: e.target.value})} />
                </div>
                <div>
                  <label className="block text-xs font-bold tracking-widest text-[#7A7D71] uppercase mb-2">E-mail (Google)</label>
                  <input type="email" disabled={!!editingUser.id} className="w-full bg-[#F9F9F6] border border-[#E2E4D8] rounded-2xl py-3 px-4 text-sm focus:border-[#A7C0A5] focus:ring-1 focus:ring-[#A7C0A5] focus:outline-none disabled:opacity-50" value={editingUser.email} onChange={e => setEditingUser({...editingUser, email: e.target.value.toLowerCase()})} />
                </div>
                <div>
                  <label className="block text-xs font-bold tracking-widest text-[#7A7D71] uppercase mb-2">Perfil de Acesso</label>
                  <select 
                    className="w-full bg-[#F9F9F6] border border-[#E2E4D8] rounded-2xl py-3 px-4 text-sm focus:border-[#A7C0A5] focus:ring-1 focus:ring-[#A7C0A5] focus:outline-none appearance-none"
                    value={editingUser.role}
                    onChange={e => setEditingUser({...editingUser, role: e.target.value as any})}
                  >
                    <option value="admin">Administrador (Acesso Total)</option>
                    <option value="gestor">Gestor</option>
                    <option value="analista">Analista de Qualidade</option>
                    <option value="tecnico">Técnico</option>
                    <option value="assistente">Assistente</option>
                  </select>
                </div>
                
                <div>
                  <label className="block text-xs font-bold tracking-widest text-[#7A7D71] uppercase mb-2">Equipe</label>
                  <select 
                    className="w-full bg-[#F9F9F6] border border-[#E2E4D8] rounded-2xl py-3 px-4 text-sm focus:border-[#A7C0A5] focus:ring-1 focus:ring-[#A7C0A5] focus:outline-none appearance-none"
                    value={editingUser.teamId}
                    onChange={e => setEditingUser({...editingUser, teamId: e.target.value})}
                  >
                    <option value="">Nenhuma Equipe</option>
                    {teams.filter(t => t.active !== false).map(t => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>

                <div className="pt-4">
                  <button 
                    onClick={handleSaveUser}
                    disabled={saving}
                    className="w-full bg-[#2D3A3A] text-white py-4 rounded-2xl font-bold shadow-lg shadow-[#2D3A3A]/20 hover:bg-opacity-90 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
                  >
                    {saving ? 'Salvando...' : editingUser.id ? 'Salvar Alterações' : 'Cadastrar Usuário'}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function TeamsManagement({ teams, users }: { teams: Team[], users: User[] }) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTeam, setEditingTeam] = useState<{name: string, id?: string}>({ name: '' });
  const [saving, setSaving] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const activeTeams = teams.filter(t => t.active !== false);

  const handleSaveTeam = async () => {
    if (!editingTeam.name) return toast.error('O nome da equipe é obrigatório.');
    setSaving(true);
    try {
      const teamRef = editingTeam.id ? doc(db, 'teams', editingTeam.id) : doc(collection(db, 'teams'));
      await setDoc(teamRef, {
        name: editingTeam.name,
        active: true
      }, { merge: true });
      toast.success(editingTeam.id ? 'Equipe atualizada com sucesso!' : 'Equipe criada com sucesso!');
      setIsModalOpen(false);
      setEditingTeam({ name: '' });
    } catch (e) {
      console.error(e);
      toast.error('Erro ao salvar equipe');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteTeam = async (id: string) => {
    try {
      const hasUsers = users.some(u => u.teamId === id);
      const formsSnapshot = await getDocs(query(collection(db, 'forms'), where('teamId', '==', id)));
      
      if (hasUsers || !formsSnapshot.empty) {
        toast.error('Não é possível excluir esta equipe pois ela ainda possui usuários ou formulários vinculados. Desvincule-os primeiro.');
        setDeleteConfirmId(null);
        return;
      }

      await deleteDoc(doc(db, 'teams', id));
      toast.success('Equipe excluída com sucesso.');
      setDeleteConfirmId(null);
    } catch (e) {
      console.error(e);
      toast.error('Erro ao excluir equipe');
    }
  };

  const openEdit = (t: Team) => {
    setEditingTeam({
      id: t.id,
      name: t.name
    });
    setIsModalOpen(true);
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-6">
      <div className="flex justify-between items-center px-2">
        <h3 className="text-2xl font-bold text-[#2D3A3A]">Estrutura de Equipes</h3>
        <button 
          onClick={() => {
            setEditingTeam({ name: '' });
            setIsModalOpen(true);
          }}
          className="bg-[#2D3A3A] text-white px-6 py-2.5 rounded-2xl text-sm font-bold shadow-lg shadow-[#2D3A3A]/20 hover:bg-opacity-90 flex items-center gap-2 transition-all"
        >
          <Plus className="w-4 h-4" /> Nova Equipe
        </button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {activeTeams.map(t => (
          <div key={t.id} className="bg-white rounded-3xl border border-[#E2E4D8] p-6 shadow-sm group hover:shadow-md transition-shadow">
            <div className="flex justify-between items-start mb-4">
              <h4 className="font-bold text-xl text-[#2D3A3A]">{t.name}</h4>
              <div className="flex gap-1.5">
                {deleteConfirmId === t.id ? (
                  <>
                    <button onClick={() => handleDeleteTeam(t.id)} className="px-2 py-1 bg-red-500 text-white text-[10px] uppercase font-bold tracking-widest rounded transition-colors">Confirmar</button>
                    <button onClick={() => setDeleteConfirmId(null)} className="px-2 py-1 bg-[#E2E4D8] text-[#2D3A3A] text-[10px] uppercase font-bold tracking-widest rounded transition-colors">Cancelar</button>
                  </>
                ) : (
                  <>
                    <button onClick={() => openEdit(t)} className="p-2 rounded-lg hover:bg-[#F9F9F6] text-[#7A7D71] hover:text-[#2D3A3A] transition-colors">
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={() => setDeleteConfirmId(t.id)}
                      className="p-2 rounded-lg hover:bg-red-50 text-[#7A7D71] hover:text-red-500 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        ))}
        {activeTeams.length === 0 && (
          <div className="col-span-full p-16 text-center bg-[#FBFBF9] rounded-[40px] border border-[#E2E4D8] shadow-sm">
            <Shield className="w-12 h-12 mx-auto mb-4 text-[#A7C0A5]" />
            <p className="text-sm font-semibold tracking-wider text-[#7A7D71] uppercase">Nenhuma equipe cadastrada</p>
          </div>
        )}
      </div>

      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#2D3A3A]/40 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-[32px] p-8 w-full max-w-md shadow-2xl relative"
            >
              <button 
                onClick={() => setIsModalOpen(false)}
                className="absolute right-6 top-6 p-2 rounded-xl text-[#7A7D71] hover:bg-[#F0F1E8] transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
              
              <h3 className="text-2xl font-bold text-[#2D3A3A] mb-2">{editingTeam.id ? 'Editar Equipe' : 'Nova Equipe'}</h3>
              <p className="text-sm text-[#7A7D71] mb-6">Crie ou gerencie uma equipe.</p>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold tracking-widest text-[#7A7D71] uppercase mb-2">Nome da Equipe</label>
                  <input 
                    type="text" 
                    className="w-full bg-[#F9F9F6] border border-[#E2E4D8] rounded-2xl py-3 px-4 text-sm focus:border-[#A7C0A5] focus:ring-1 focus:ring-[#A7C0A5] focus:outline-none" 
                    value={editingTeam.name} 
                    onChange={e => setEditingTeam({...editingTeam, name: e.target.value})} 
                    placeholder="Ex: Suporte N1" 
                  />
                </div>

                <div className="pt-4">
                  <button 
                    onClick={handleSaveTeam}
                    disabled={saving}
                    className="w-full bg-[#2D3A3A] text-white py-4 rounded-2xl font-bold shadow-lg shadow-[#2D3A3A]/20 hover:bg-opacity-90 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
                  >
                    {saving ? 'Salvando...' : editingTeam.id ? 'Salvar Alterações' : 'Cadastrar Equipe'}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function FormsManagement({ user, teams }: { user: User | null, teams: Team[] }) {
  const [forms, setForms] = useState<EvaluationForm[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingForm, setEditingForm] = useState<Partial<EvaluationForm>>({
    title: '', description: '', teamId: '', sections: []
  });
  const [saving, setSaving] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const activeForms = forms.filter(f => f.active !== false);

  const handleDeleteForm = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try {
      const monitoriasQuery = await getDocs(query(collection(db, 'monitorias'), where('formId', '==', id)));
      
      if (!monitoriasQuery.empty) {
        // Soft delete para manter a integridade
        await setDoc(doc(db, 'forms', id), { active: false }, { merge: true });
        toast.success('Formulário desativado com sucesso. Ele foi mantido no sistema para preservar a integridade das monitorias.');
      } else {
        // Hard delete
        await deleteDoc(doc(db, 'forms', id));
        toast.success('Formulário excluído com sucesso.');
      }
      setDeleteConfirmId(null);
    } catch (e) {
      console.error(e);
      toast.error('Erro ao excluir formulário');
    }
  };

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'forms'), (snapshot) => {
      setForms(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as EvaluationForm)));
    });
    return () => unsub();
  }, []);


  const handleAddSection = () => {
    const newSection = { id: Date.now().toString(), title: '', weight: 0, questions: [] };
    setEditingForm({ ...editingForm, sections: [...(editingForm.sections || []), newSection] });
  };

  const handleAddQuestion = (sectionId: string) => {
    setEditingForm(prev => {
      const newSections = (prev.sections || []).map(s => {
        if (s.id === sectionId) {
          return { ...s, questions: [...s.questions, { id: Date.now().toString() + Math.random(), text: '', type: 'yes_no_na' as const }] };
        }
        return s;
      });
      return { ...prev, sections: newSections };
    });
  };

  const handleUpdateSection = (sectionId: string, field: string, value: string | number) => {
    setEditingForm(prev => {
      const newSections = (prev.sections || []).map(s => {
        if (s.id === sectionId) {
          return { ...s, [field]: value };
        }
        return s;
      });
      return { ...prev, sections: newSections };
    });
  };

  const handleUpdateQuestion = (sectionId: string, questionId: string, text: string) => {
    setEditingForm(prev => {
      const newSections = (prev.sections || []).map(s => {
        if (s.id === sectionId) {
          return {
            ...s,
            questions: s.questions.map(q => q.id === questionId ? { ...q, text } : q)
          };
        }
        return s;
      });
      return { ...prev, sections: newSections };
    });
  };

  const handleRemoveSection = (sectionId: string) => {
    setEditingForm(prev => ({
      ...prev,
      sections: (prev.sections || []).filter(s => s.id !== sectionId)
    }));
  };

  const handleRemoveQuestion = (sectionId: string, questionId: string) => {
    setEditingForm(prev => ({
      ...prev,
      sections: (prev.sections || []).map(s => {
        if (s.id === sectionId) {
          return { ...s, questions: s.questions.filter(q => q.id !== questionId) };
        }
        return s;
      })
    }));
  };

  const handleSaveForm = async () => {
    if (!editingForm.title || !editingForm.sections?.length) return toast.error('Preencha título e adicione pelo menos um pilar.');
    setSaving(true);
    try {
      const formId = editingForm.id || Date.now().toString();
      await setDoc(doc(db, 'forms', formId), {
        title: editingForm.title,
        description: editingForm.description || '',
        teamId: editingForm.teamId || '',
        sections: editingForm.sections,
        active: true,
        createdBy: user?.email || '',
        createdAt: editingForm.createdAt || new Date().toISOString()
      });
      toast.success(editingForm.id ? 'Formulário atualizado com sucesso!' : 'Formulário criado com sucesso!');
      setIsModalOpen(false);
      setEditingForm({ title: '', description: '', teamId: '', sections: [] });
    } catch (e) {
      console.error(e);
      toast.error('Erro ao salvar formulário');
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-6">
      <div className="flex justify-between items-center px-2">
        <h3 className="text-2xl font-bold text-[#2D3A3A]">Modelos de Avaliação</h3>
        <button 
          onClick={() => {
            setEditingForm({ title: '', description: '', teamId: '', sections: [] });
            setIsModalOpen(true);
          }}
          className="bg-[#2D3A3A] text-white px-6 py-2.5 rounded-2xl text-sm font-bold shadow-lg shadow-[#2D3A3A]/20 hover:bg-opacity-90 flex items-center gap-2 transition-all">
          <Plus className="w-4 h-4" /> Novo Formulário
        </button>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {activeForms.map(f => (
          <div key={f.id} className="bg-white rounded-3xl border border-[#E2E4D8] p-6 shadow-sm group hover:shadow-md transition-shadow cursor-pointer relative" onClick={() => { setEditingForm(f); setIsModalOpen(true); }}>
            <div className="absolute top-4 right-4 flex gap-1.5 transition-opacity">
              {deleteConfirmId === f.id ? (
                <>
                  <button onClick={(e) => handleDeleteForm(e, f.id)} className="px-2 py-1 bg-red-500 text-white text-[10px] uppercase font-bold tracking-widest rounded transition-colors relative z-10">Confirmar</button>
                  <button onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(null); }} className="px-2 py-1 bg-[#E2E4D8] text-[#2D3A3A] text-[10px] uppercase font-bold tracking-widest rounded transition-colors relative z-10">Cancelar</button>
                </>
              ) : (
                <>
                  <button 
                    onClick={(e) => { e.stopPropagation(); setEditingForm(f); setIsModalOpen(true); }}
                    className="p-2 rounded-lg hover:bg-[#F9F9F6] text-[#7A7D71] hover:text-[#2D3A3A] transition-colors relative z-10"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(f.id); }}
                    className="p-2 rounded-lg hover:bg-red-50 text-[#7A7D71] hover:text-red-500 transition-colors relative z-10"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </>
              )}
            </div>
            <h4 className="font-bold text-xl text-[#2D3A3A] mb-2 pr-16">{f.title}</h4>
            <p className="text-sm text-[#7A7D71] mb-4">{f.description}</p>
            <div className="flex items-center gap-4 text-xs font-bold uppercase tracking-widest text-[#7A7D71]">
              <span>{f.sections.length} Pilares</span>
              {f.teamId && <span>{teams.find(t => t.id === f.teamId)?.name || 'Geral'}</span>}
            </div>
          </div>
        ))}
      </div>

      {activeForms.length === 0 && (
        <div className="p-16 text-center bg-[#FBFBF9] rounded-[40px] border border-[#E2E4D8] shadow-sm">
          <ClipboardList className="w-12 h-12 mx-auto mb-4 text-[#A7C0A5]" />
          <p className="text-sm font-semibold tracking-wider text-[#7A7D71] uppercase">Nenhum formulário cadastrado</p>
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#2D3A3A]/40 backdrop-blur-sm overflow-y-auto">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="bg-white rounded-[32px] p-8 w-full max-w-4xl shadow-2xl relative my-8"
          >
            <button 
              onClick={() => setIsModalOpen(false)}
              className="absolute right-6 top-6 p-2 rounded-xl text-[#7A7D71] hover:bg-[#F0F1E8] transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
            
            <h3 className="text-2xl font-bold text-[#2D3A3A] mb-6">{editingForm.id ? 'Editar Formulário' : 'Novo Formulário'}</h3>
            
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold tracking-widest text-[#7A7D71] uppercase mb-2">Título do Formulário</label>
                  <input type="text" className="w-full bg-[#F9F9F6] border border-[#E2E4D8] rounded-2xl py-3 px-4 text-sm focus:border-[#A7C0A5] focus:ring-1 focus:ring-[#A7C0A5] focus:outline-none" value={editingForm.title} onChange={e => setEditingForm({...editingForm, title: e.target.value})} placeholder="Ex: Avaliação de Suporte Técnico" />
                </div>
                <div>
                  <label className="block text-xs font-bold tracking-widest text-[#7A7D71] uppercase mb-2">Equipe (Opcional)</label>
                  <select 
                    className="w-full bg-[#F9F9F6] border border-[#E2E4D8] rounded-2xl py-3 px-4 text-sm focus:border-[#A7C0A5] focus:ring-1 focus:ring-[#A7C0A5] focus:outline-none appearance-none"
                    value={editingForm.teamId || ''}
                    onChange={e => setEditingForm({...editingForm, teamId: e.target.value})}
                  >
                    <option value="">Todas as Equipes (Geral)</option>
                    {teams.filter(t => t.active !== false).map(t => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-4 mt-8">
                  <h4 className="text-lg font-bold text-[#2D3A3A]">Pilares de Avaliação</h4>
                  <button onClick={handleAddSection} className="text-sm font-bold text-[#A7C0A5] hover:text-[#2D3A3A] transition-colors flex items-center gap-1"><Plus className="w-4 h-4"/> Adicionar Pilar</button>
                </div>

                <div className="space-y-6">
                  {editingForm.sections?.map((section, sIdx) => (
                    <div key={section.id} className="p-6 border border-[#E2E4D8] rounded-3xl bg-[#FBFBF9]">
                      <div className="flex items-start justify-between gap-4 mb-4">
                        <div className="flex-1 grid grid-cols-1 md:grid-cols-4 gap-4">
                          <div className="md:col-span-3">
                            <label className="block text-xs font-bold tracking-widest text-[#7A7D71] uppercase mb-1">Nome do Pilar</label>
                            <input type="text" className="w-full bg-white border border-[#E2E4D8] rounded-xl py-2 px-3 text-sm focus:border-[#A7C0A5] focus:ring-1 focus:ring-[#A7C0A5] focus:outline-none" value={section.title} onChange={e => handleUpdateSection(section.id, 'title', e.target.value)} placeholder="Ex: Pilar Técnico" />
                          </div>
                          <div>
                            <label className="block text-xs font-bold tracking-widest text-[#7A7D71] uppercase mb-1">Peso (%)</label>
                            <input type="number" className="w-full bg-white border border-[#E2E4D8] rounded-xl py-2 px-3 text-sm focus:border-[#A7C0A5] focus:ring-1 focus:ring-[#A7C0A5] focus:outline-none" value={section.weight || 0} onChange={e => handleUpdateSection(section.id, 'weight', Number(e.target.value))} placeholder="35" />
                          </div>
                        </div>
                        <button onClick={() => handleRemoveSection(section.id)} className="p-2 text-red-500 hover:bg-red-50 rounded-lg mt-5"><Trash2 className="w-4 h-4" /></button>
                      </div>

                      <div className="pl-4 border-l-2 border-[#E2E4D8] space-y-3 mt-4">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-bold uppercase tracking-widest text-[#7A7D71]">Critérios</span>
                          <button onClick={() => handleAddQuestion(section.id)} className="text-xs font-bold text-[#A7C0A5] hover:text-[#2D3A3A] transition-colors flex items-center gap-1"><Plus className="w-3 h-3"/> Novo Critério</button>
                        </div>
                        {section.questions.map((q, qIdx) => (
                          <div key={q.id} className="flex items-center gap-2">
                            <input type="text" className="flex-1 bg-white border border-[#E2E4D8] rounded-xl py-2 px-3 text-sm focus:border-[#A7C0A5] focus:ring-1 focus:ring-[#A7C0A5] focus:outline-none" value={q.text} onChange={e => handleUpdateQuestion(section.id, q.id, e.target.value)} placeholder="Ex: Investigação de Histórico e Contexto" />
                            <div className="px-3 py-2 bg-[#F0F1E8] rounded-xl text-xs font-bold text-[#7A7D71]">SIM/NÃO/N/A</div>
                            <button onClick={() => handleRemoveQuestion(section.id, q.id)} className="p-2 text-red-500 hover:bg-red-50 rounded-lg"><Trash2 className="w-4 h-4" /></button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              
              <div className="pt-6 border-t border-[#E2E4D8]">
                <button 
                  onClick={handleSaveForm}
                  disabled={saving}
                  className="w-full bg-[#2D3A3A] text-white py-4 rounded-2xl font-bold shadow-lg shadow-[#2D3A3A]/20 hover:bg-opacity-90 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
                >
                  <Save className="w-4 h-4"/> {saving ? 'Salvando...' : 'Salvar Formulário'}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </motion.div>
  );
}

function RequestsManagement({ users, teams }: { users: User[], teams: Team[] }) {
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'accessRequests'), (snapshot) => {
      setRequests(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'accessRequests');
    });
    return () => unsub();
  }, []);

  const handleStatus = async (id: string, status: 'approved' | 'rejected') => {
    try {
      await setDoc(doc(db, 'accessRequests', id), { status }, { merge: true });
      toast.success(status === 'approved' ? 'Solicitação aprovada. Para efetivar, crie o usuário na aba Usuários.' : 'Solicitação rejeitada com sucesso.');
    } catch (e) {
      toast.error('Erro ao atualizar solicitação.');
      handleFirestoreError(e, OperationType.UPDATE, 'accessRequests');
    }
  };

  if (loading) return <div className="text-sm font-medium text-[#7A7D71]">Carregando solicitações...</div>;

  const pendingRequests = requests.filter(r => r.status === 'pending');
  const pastRequests = requests.filter(r => r.status !== 'pending').sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-8">
      {pendingRequests.length === 0 && pastRequests.length === 0 ? (
        <div className="bg-white rounded-3xl border border-[#E2E4D8] p-12 text-center text-[#7A7D71]">
          Nenhuma solicitação de acesso no momento.
        </div>
      ) : null}

      {pendingRequests.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-xl font-bold text-[#2D3A3A]">Aguardando Aprovação</h3>
          {pendingRequests.map(req => (
            <div key={req.id} className="bg-white rounded-2xl border border-yellow-200 p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 relative overflow-hidden">
              <div className="absolute left-0 top-0 bottom-0 w-1 bg-yellow-400" />
              <div>
                <h4 className="font-bold text-lg text-[#2D3A3A]">{req.name}</h4>
                <div className="text-sm text-[#7A7D71] mt-1">{req.email}</div>
                <div className="text-xs text-[#A7C0A5] mt-1">Solicitado em: {new Date(req.createdAt).toLocaleString()}</div>
              </div>
              <div className="flex gap-2 w-full md:w-auto">
                <button onClick={() => handleStatus(req.id, 'rejected')} className="flex-1 md:flex-none px-6 py-2.5 bg-white border border-[#E2E4D8] rounded-xl text-sm font-bold text-red-500 hover:bg-red-50 transition-colors">
                  Recusar
                </button>
                <button onClick={() => handleStatus(req.id, 'approved')} className="flex-1 md:flex-none px-6 py-2.5 bg-[#A7C0A5] text-[#2D3A3A] rounded-xl text-sm font-bold hover:bg-[#8da38b] transition-colors">
                  Aprovar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {pastRequests.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-xl font-bold text-[#2D3A3A]">Histórico de Solicitações</h3>
          {pastRequests.map(req => (
            <div key={req.id} className="bg-[#F9F9F6] rounded-2xl border border-[#E2E4D8] p-4 flex justify-between items-center opacity-75 grayscale">
              <div>
                <div className="font-bold text-sm text-[#3D4035]">{req.name} <span className="font-normal text-[#7A7D71]">({req.email})</span></div>
              </div>
              <div className={`text-xs font-bold px-2 py-1 rounded uppercase tracking-widest ${req.status === 'approved' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                {req.status === 'approved' ? 'Aprovado' : 'Recusado'}
              </div>
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );
}
