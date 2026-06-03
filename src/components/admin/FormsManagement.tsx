import React, { useState, useEffect, useMemo } from 'react';
import { supabase, mockDb } from '../../lib/supabase';
import { User, Team, EvaluationForm, FormSection, Question } from '../../types';
import { 
  Plus, 
  Trash2, 
  X, 
  Check, 
  RefreshCw, 
  Search, 
  AlertOctagon, 
  AlertTriangle,
  ClipboardList,
  MessageSquare,
  Shield,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  Pencil
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import CustomSelect from '../ui/CustomSelect';

interface FormsManagementProps {
  currentUser: User | null;
  teams: Team[];
  loadData: () => void;
}

export default function FormsManagement({ currentUser, teams, loadData }: FormsManagementProps) {
  const [forms, setForms] = useState<EvaluationForm[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingForm, setEditingForm] = useState<Partial<EvaluationForm>>({ title: '', description: '', team_id: '', sections: [], critical_errors: [] });
  const [saving, setSaving] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'active' | 'inactive'>('active');
  const [searchTerm, setSearchTerm] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'geral' | 'pilares' | 'criticos'>('geral');
  const [expandedDescriptions, setExpandedDescriptions] = useState<Record<string, boolean>>({});
  const [showDraftBanner, setShowDraftBanner] = useState(false);
  const [draftRecoveredOrDismissed, setDraftRecoveredOrDismissed] = useState(false);
  const lastSavedDraftRef = React.useRef<string | null>(null);
  const recoveringDraftRef = React.useRef(false);

  // Auto-save logic with strict comparison to prevent immediate draft re-write
  useEffect(() => {
    if (recoveringDraftRef.current) {
      recoveringDraftRef.current = false;
      return;
    }
    const hasContent = editingForm.title || (editingForm.sections && editingForm.sections.length > 0);
    if (isModalOpen && !editingForm.id && hasContent) { 
      const currentStr = JSON.stringify(editingForm);
      if (currentStr !== lastSavedDraftRef.current) {
        localStorage.setItem('qualitrack_form_draft', currentStr);
        lastSavedDraftRef.current = currentStr;
      }
    }
  }, [editingForm, isModalOpen]);

  const loadDraft = (e?: React.MouseEvent) => {
    e?.preventDefault();
    const draft = localStorage.getItem('qualitrack_form_draft');
    if (draft) {
      try {
        recoveringDraftRef.current = true;
        const parsed = JSON.parse(draft);
        lastSavedDraftRef.current = draft;
        setEditingForm(parsed);
        setShowDraftBanner(false);
        setDraftRecoveredOrDismissed(true);
        localStorage.removeItem('qualitrack_form_draft');
        toast.success('Rascunho recuperado com sucesso!');
      } catch (err) {
        console.error('Failed to load draft', err);
      }
    }
  };

  const clearDraft = (e?: React.MouseEvent) => {
    e?.preventDefault();
    localStorage.removeItem('qualitrack_form_draft');
    lastSavedDraftRef.current = null;
    setShowDraftBanner(false);
    setDraftRecoveredOrDismissed(true);
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
      loadData();
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
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Buscar formulário..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full h-full bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 rounded-lg pl-9 pr-4 text-sm font-normal text-slate-900 dark:text-slate-50 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-slate-400 dark:focus:border-slate-600 focus:outline-none focus:ring-0 transition-all shadow-sm"
            />
          </div>
          <div className="flex items-center">
            <CustomSelect 
              value={statusFilter}
              onChange={val => setStatusFilter(val as any)}
              options={[{ value: 'active', label: 'Ativos' }, { value: 'inactive', label: 'Desativados' }]}
              className="w-44"
            />
          </div>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => { 
            setEditingForm({ title: '', description: '', team_id: '', sections: [], critical_errors: [] }); 
            setDraftRecoveredOrDismissed(false);
            setShowDraftBanner(!!localStorage.getItem('qualitrack_form_draft')); 
            setIsModalOpen(true); 
          }} icon={<Plus className="w-4 h-4" />} className="transition-all duration-200 cursor-pointer hover:bg-opacity-90 dark:hover:bg-neutral-200">
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
                    <button onClick={() => { setEditingForm(f); setIsModalOpen(true); }} className="p-2 rounded-xl hover:bg-surface-subtle text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 transition-all"><Pencil className="w-4 h-4" /></button>
                    {deleteConfirmId === f.id ? (
                      <div className="flex items-center gap-1 animate-in fade-in slide-in-from-right-2">
                        <button onClick={(e) => { e.stopPropagation(); handleToggleStatus(f.id, false); }} className="px-2.5 py-1.5 rounded-lg bg-error text-white text-[10px] font-black uppercase">Sim</button>
                        <button onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(null); }} className="px-2.5 py-1.5 rounded-lg bg-surface-subtle text-brand-muted text-[10px] font-black uppercase tracking-widest">Não</button>
                      </div>
                    ) : (
                      <button onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(f.id); }} className="p-2.5 rounded-xl hover:bg-red-50 dark:hover:bg-red-950/30 text-slate-400 hover:text-error dark:hover:text-red-400 transition-all"><Trash2 className="w-4 h-4" /></button>
                    )}
                  </>
                )}
              </div>
            </div>
            <div onClick={() => { setEditingForm(f); setIsModalOpen(true); }} className="cursor-pointer">
              <p className="text-xs text-brand-muted line-clamp-2 mb-4">{f.description}</p>
              <div className="flex items-center gap-4">
                <span className="text-[10px] font-black uppercase text-slate-500 dark:text-slate-300">{f.sections.length} Pilares</span>
                <span className="text-[10px] font-black uppercase text-slate-500 dark:text-emerald-400">Peso Total: {f.sections.reduce((acc, s) => acc + (s.weight || 0), 0)}%</span>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="max-w-3xl w-full min-h-[600px] h-[650px] max-h-[90vh] overflow-hidden flex flex-col bg-surface-card border border-surface-border rounded-[32px] shadow-2xl">
              <header className="flex items-center justify-between p-6 border-b border-surface-border bg-surface-card sticky top-0 z-10">
                <div className="flex items-center gap-4">
                  <div className="w-11 h-11 rounded-xl bg-surface-subtle flex items-center justify-center text-brand-primary">
                    <ClipboardList className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-brand-primary tracking-tight uppercase">Editor de Formulário</h3>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-widest ${totalWeight === 100 ? 'bg-functional-success text-functional-success' : 'bg-functional-warning text-functional-warning'}`}>
                        Peso Total: {totalWeight}% {totalWeight !== 100 && '(Incompleto)'}
                      </span>
                      <span className="text-brand-muted opacity-30">•</span>
                      <p className="text-[10px] font-bold text-brand-muted uppercase tracking-widest">{editingForm.title || 'Novo Formulário'}</p>
                    </div>
                  </div>
                </div>
                <button onClick={() => setIsModalOpen(false)} className="p-2.5 rounded-xl hover:bg-surface-subtle text-brand-muted hover:text-brand-primary transition-all"><X className="w-5 h-5" /></button>
              </header>

              <div className="flex border-b border-surface-border px-6 gap-6 pt-4 pb-2 bg-surface-card">
                {[
                  { id: 'geral', label: '1. Informações Gerais', icon: Shield },
                  { id: 'pilares', label: '2. Estrutura de Pilares', icon: BarChart3 },
                  { id: 'criticos', label: '3. Erros Críticos', icon: AlertOctagon },
                ].map(t => (
                  <button
                    key={t.id}
                    onClick={() => setActiveTab(t.id as any)}
                    className={`flex items-center gap-2 px-1 pb-3 text-sm transition-colors duration-200 border-b-2 -mb-px ${activeTab === t.id ? 'border-brand-primary text-brand-primary font-bold' : 'border-transparent text-brand-muted hover:text-brand-primary font-medium'}`}
                  >
                    <t.icon className="w-4 h-4" />
                    {t.label}
                  </button>
                ))}
              </div>

              <div className="flex-1 overflow-y-auto pl-6 pr-3 py-6 space-y-6 bg-surface-bg dark:bg-surface-bg thin-scrollbar">
                {activeTab === 'geral' && (
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="max-w-2xl mx-auto space-y-8 py-4">
                    {showDraftBanner && !draftRecoveredOrDismissed && !editingForm.id && (
                      <div className="p-4 bg-brand-subtle dark:bg-surface-subtle border border-surface-border rounded-2xl flex items-center justify-between text-xs text-brand-primary">
                        <span className="font-bold flex items-center gap-2">💡 Você possui um rascunho anterior salvo. Deseja recuperá-lo?</span>
                        <div className="flex gap-2">
                          <Button size="sm" onClick={loadDraft} className="cursor-pointer">Recuperar</Button>
                          <Button size="sm" variant="outline" onClick={clearDraft} className="cursor-pointer">Dispensar</Button>
                        </div>
                      </div>
                    )}
                    <div className="grid grid-cols-1 gap-8">
                      <div className="space-y-6">
                        <div className="flex flex-col">
                          <label className="uppercase tracking-widest text-[10px] font-black text-brand-muted opacity-80 dark:opacity-70 mb-1.5 ml-0.5 block">Título do Formulário</label>
                          <input 
                            type="text" 
                            className="w-full h-10 bg-white dark:bg-surface-bg border border-surface-border dark:border-surface-border rounded-lg px-3 text-sm font-normal text-brand-primary dark:text-brand-primary placeholder:text-brand-muted focus:border-brand-accent dark:focus:border-brand-accent focus:outline-none focus:ring-0 transition-all shadow-sm" 
                            value={editingForm.title || ''} 
                            onChange={e => setEditingForm({...editingForm, title: e.target.value})} 
                            placeholder="Ex: Monitoria de Atendimento Chat" 
                          />
                        </div>
                        <div className="flex flex-col">
                          <label className="uppercase tracking-widest text-[10px] font-black text-brand-muted opacity-80 dark:opacity-70 mb-1.5 ml-0.5 block">Equipe Vinculada</label>
                          <CustomSelect 
                            value={editingForm.team_id || ''} 
                            onChange={val => setEditingForm({...editingForm, team_id: val})} 
                            options={[{ value: '', label: 'Geral (Todas as Equipes)' }, ...teams.map(t => ({ value: t.id, label: t.name }))]} 
                          />
                        </div>
                        <div className="flex flex-col">
                          <label className="uppercase tracking-widest text-[10px] font-black text-brand-muted opacity-80 dark:opacity-70 mb-1.5 ml-0.5 block">Descrição do Propósito</label>
                          <textarea 
                            className="w-full min-h-[120px] bg-white dark:bg-surface-bg border border-surface-border dark:border-surface-border rounded-lg p-3 text-sm font-normal text-brand-primary dark:text-brand-primary placeholder:text-brand-muted focus:border-brand-accent dark:focus:border-brand-accent focus:outline-none focus:ring-0 transition-all shadow-sm resize-y leading-relaxed" 
                            value={editingForm.description || ''} 
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
                    </div>
                    
                    <div className="grid grid-cols-1 gap-6">
                      {editingForm.sections?.map((section, sIdx) => (
                        <div key={section.id} className="bg-surface-card rounded-[32px] border border-surface-border shadow-premium-sm overflow-hidden border-l-8 border-l-brand-accent">
                          <div className="py-3 px-5 border-b border-surface-border bg-surface-subtle flex items-center justify-between gap-4">
                            <div className="flex items-center gap-3 flex-1">
                              <span className="text-[10px] font-black text-brand-muted opacity-40 uppercase tracking-widest">#{sIdx + 1}</span>
                              <input 
                                className="bg-transparent border-none p-0 text-sm font-black text-brand-primary dark:text-brand-primary uppercase tracking-tight focus:ring-0 w-full placeholder:text-brand-muted"
                                style={{ background: 'transparent', border: 'none', padding: 0, boxShadow: 'none' }}
                                value={section.title}
                                onChange={e => updateSection(section.id, 'title', e.target.value)}
                                placeholder="NOME DO PILAR (Ex: QUALIDADE)"
                              />
                            </div>
                            <div className="flex items-center gap-4">
                              <div className="flex flex-col items-end">
                                <label className="uppercase tracking-widest text-[10px] font-black text-brand-muted opacity-80 dark:opacity-70 mb-1.5 block">Peso do Pilar</label>
                                <div className="flex items-center gap-1.5">
                                  <input 
                                    type="number" 
                                    className="w-20 max-w-[80px] shrink-0 h-9 font-bold px-2 text-center rounded-lg focus:outline-none focus:ring-0 bg-white dark:bg-surface-bg border border-surface-border dark:border-surface-border text-brand-primary dark:text-brand-primary focus:border-brand-accent dark:focus:border-brand-accent transition-all shadow-sm"
                                    style={{ width: '80px', maxWidth: '80px' }}
                                    value={section.weight || 0}
                                    onChange={e => updateSection(section.id, 'weight', parseInt(e.target.value) || 0)}
                                  />
                                  <span className="text-xs font-bold text-brand-muted">%</span>
                                </div>
                              </div>
                              <button onClick={() => removeSection(section.id)} className="p-2 rounded-lg hover:bg-surface-subtle text-brand-muted opacity-40 hover:opacity-100 hover:text-error transition-all cursor-pointer"><Trash2 className="w-4 h-4" /></button>
                            </div>
                          </div>
                          
                          <div className="p-4 bg-surface-bg space-y-2.5">
                            {section.questions.map((q, qIdx) => {
                              const itemWeightInPilar = section.questions.length > 0 ? (100 / section.questions.length).toFixed(1) : 0;
                              const itemImpactInTotal = section.questions.length > 0 ? ((section.weight || 0) / section.questions.length).toFixed(1) : 0;
 
                              return (
                                <div key={q.id} className="flex items-center gap-3 py-3 px-4 rounded-xl bg-surface-card border border-surface-border group hover:border-brand-accent transition-all shadow-sm">
                                  <div className="w-7 h-7 rounded-lg bg-surface-subtle dark:bg-surface-bg flex items-center justify-center text-sm font-bold text-brand-muted dark:text-brand-muted">{qIdx + 1}</div>
                                  <div className="flex-1">
                                    <input 
                                      className="bg-transparent border-none p-0 text-xs font-bold text-brand-primary dark:text-brand-primary w-full focus:ring-0 placeholder:text-brand-muted"
                                      style={{ background: 'transparent', border: 'none', padding: 0, boxShadow: 'none' }}
                                      value={q.text}
                                      onChange={e => updateQuestion(section.id, q.id, 'text', e.target.value)}
                                      placeholder="Ex: Utilizou a saudação padrão corretamente?"
                                    />
                                    <div className="flex items-center gap-4 mt-1">
                                      <span className="text-[10px] font-bold text-brand-muted opacity-80 dark:opacity-60 uppercase tracking-wider">Peso no Pilar: {itemWeightInPilar}%</span>
                                      <span className="text-brand-muted opacity-30">•</span>
                                      <span className="text-[10px] font-bold text-brand-muted opacity-80 dark:opacity-60 uppercase tracking-wider">Impacto Global: {itemImpactInTotal}%</span>
                                    </div>
                                    {expandedDescriptions[q.id] && (
                                      <div className="mt-2.5">
                                        <textarea
                                          className="w-full text-xs font-normal text-brand-primary dark:text-brand-primary placeholder:text-brand-muted bg-white dark:bg-surface-bg border border-surface-border dark:border-surface-border rounded-lg p-2.5 focus:border-brand-accent dark:focus:border-brand-accent focus:outline-none focus:ring-0 transition-all shadow-sm resize-none leading-relaxed"
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
                                      className={`p-2 rounded-xl transition-colors cursor-pointer ${expandedDescriptions[q.id] || q.description ? 'text-brand-accent bg-brand-subtle' : 'text-brand-muted opacity-30 hover:opacity-100 hover:text-brand-primary hover:bg-surface-subtle'}`}
                                      title="Adicionar Descrição"
                                    >
                                      <MessageSquare className="w-4 h-4" />
                                    </button>
                                    <button onClick={() => removeQuestion(section.id, q.id)} className="p-2 rounded-xl text-brand-muted opacity-30 hover:opacity-100 hover:text-error hover:bg-surface-subtle transition-colors opacity-0 group-hover:opacity-100 cursor-pointer">
                                      <X className="w-4 h-4" />
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                            
                            <button 
                              onClick={() => addQuestion(section.id)}
                              className="w-full py-2 rounded-xl border border-dashed border-surface-border text-brand-muted text-sm font-semibold hover:border-brand-accent hover:text-brand-accent hover:bg-brand-subtle transition-all flex items-center justify-center gap-2 cursor-pointer"
                            >
                              <Plus className="w-3.5 h-3.5" /> Adicionar Critério ao Pilar
                            </button>
                          </div>
                        </div>
                      ))}

                      {editingForm.sections && editingForm.sections.length > 0 && (
                        <div className="flex justify-end mt-2 pr-1">
                          <Button 
                            variant="outline" 
                            size="sm" 
                            onClick={addSection} 
                            icon={<Plus className="w-4 h-4" />} 
                            className="border-brand-accent text-brand-accent hover:bg-brand-subtle"
                          >
                            Novo Pilar
                          </Button>
                        </div>
                      )}

                      {(!editingForm.sections || editingForm.sections.length === 0) && (
                        <div className="bg-surface-bg p-16 rounded-[40px] border-2 border-dashed border-surface-border text-center">
                          <div className="w-20 h-20 rounded-[2.5rem] bg-surface-card shadow-premium flex items-center justify-center mx-auto mb-6">
                            <Plus className="w-10 h-10 text-brand-muted opacity-40" />
                          </div>
                          <h5 className="text-brand-primary font-black uppercase tracking-widest text-sm">Nenhum Pilar Definido</h5>
                          <p className="text-brand-muted text-[10px] font-bold uppercase mt-2">Clique no botão acima ou abaixo para começar a estruturar o formulário.</p>
                          <Button variant="outline" onClick={addSection} className="mt-8">Criar Primeiro Pilar</Button>
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
                        <p className="text-[10px] font-bold text-brand-muted dark:text-brand-muted/80 uppercase mt-1">Itens que, se marcados como 'NÃO', zeram automaticamente a monitoria.</p>
                      </div>
                      <Button variant="outline" size="sm" onClick={addCriticalError} icon={<Plus className="w-4 h-4" />} className="border-error text-error hover:bg-level-ruim hover:border-error">Novo Erro Crítico</Button>
                    </div>

                    <div className="grid grid-cols-1 gap-4">
                      {editingForm.critical_errors?.map((ce, idx) => (
                        <div key={ce.id} className="flex items-center gap-3 py-3 px-4 rounded-xl bg-surface-card border border-surface-border border-l-8 border-l-error group hover:border-error transition-all shadow-sm">
                          <div className="w-7 h-7 rounded-lg bg-level-ruim text-error flex items-center justify-center text-sm font-bold">{idx + 1}</div>
                          <div className="flex-1">
                            <input 
                              className="bg-transparent border-none p-0 text-xs font-bold text-brand-primary dark:text-brand-primary w-full focus:ring-0 placeholder:text-brand-muted"
                              style={{ background: 'transparent', border: 'none', padding: 0, boxShadow: 'none' }}
                              value={ce.text}
                              onChange={e => updateCriticalError(ce.id, 'text', e.target.value)}
                              placeholder="Ex: Fraude ou quebra de protocolo de segurança..."
                            />
                          </div>
                          <button onClick={() => removeCriticalError(ce.id)} className="p-2 text-brand-muted opacity-30 hover:opacity-100 hover:text-error transition-colors opacity-0 group-hover:opacity-100 cursor-pointer"><X className="w-5 h-5" /></button>
                        </div>
                      ))}
                      
                      {(!editingForm.critical_errors || editingForm.critical_errors.length === 0) && (
                        <div className="py-20 text-center border-2 border-dashed border-surface-border rounded-[40px] bg-surface-bg">
                          <AlertOctagon className="w-12 h-12 text-brand-muted opacity-20 mx-auto mb-4" />
                          <p className="text-[10px] font-black text-brand-muted uppercase tracking-widest">Nenhum erro crítico foi configurado para este formulário</p>
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </div>
              
              <footer className="p-6 border-t border-surface-border bg-surface-card flex items-center justify-between sticky bottom-0 z-10">
                {/* EXTREMA ESQUERDA: Status/Alerta do Peso */}
                <div className="flex-1 flex items-center justify-start min-w-[200px]">
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

                {/* CENTRO: Navegação entre etapas */}
                <div className="flex items-center justify-center gap-2">
                  <Button 
                    variant="ghost" 
                    onClick={() => setActiveTab(activeTab === 'criticos' ? 'pilares' : activeTab === 'pilares' ? 'geral' : 'geral')} 
                    disabled={activeTab === 'geral'}
                    className="px-4 text-brand-primary font-bold transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4 mr-1" /> Anterior
                  </Button>
                  <Button 
                    variant="ghost" 
                    onClick={() => setActiveTab(activeTab === 'geral' ? 'pilares' : 'criticos')} 
                    disabled={activeTab === 'criticos'}
                    className="px-4 text-brand-primary font-bold transition-colors"
                  >
                    Próximo <ChevronRight className="w-4 h-4 ml-1" />
                  </Button>
                </div>

                {/* EXTREMA DIREITA: Ações definitivas */}
                <div className="flex-1 flex items-center justify-end gap-3 min-w-[200px]">
                  <Button 
                    onClick={handleSaveForm} 
                    disabled={saving || !isValid} 
                    variant="primary"
                    className="py-2.5 px-8 shadow-premium transition-all duration-200 font-bold uppercase tracking-wider cursor-pointer hover:bg-opacity-90 dark:hover:bg-neutral-200 disabled:bg-slate-200 disabled:text-slate-400 dark:disabled:bg-[#31352A] dark:disabled:text-[#A3A69A]/40 disabled:opacity-100 disabled:cursor-not-allowed"
                  >
                    {saving ? 'SALVANDO...' : 'SALVAR'}
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
