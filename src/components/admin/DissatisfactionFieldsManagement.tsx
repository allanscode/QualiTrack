import React, { useState, useEffect, useMemo } from 'react';
import { supabase, mockDb } from '../../lib/supabase';
import { DissatisfactionField } from '../../types';
import { 
  Search, 
  Plus, 
  Trash2, 
  Edit2, 
  X, 
  Save, 
  RefreshCw,
  Sliders,
  ListPlus
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import CustomSelect from '../ui/CustomSelect';

export default function DissatisfactionFieldsManagement() {
  const [fields, setFields] = useState<DissatisfactionField[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'active' | 'inactive'>('active');
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Form State
  const [editingField, setEditingField] = useState<Partial<DissatisfactionField>>({
    title: '',
    type: 'cliente',
    options: [],
    active: true
  });
  const [newOption, setNewOption] = useState('');

  const loadFields = async () => {
    setLoading(true);
    try {
      if (!supabase) {
        const res = await mockDb.get('dissatisfaction_fields');
        setFields(res.data || []);
      } else {
        const { data, error } = await supabase
          .from('dissatisfaction_fields')
          .select('*')
          .order('created_at', { ascending: false });
        if (error?.code === 'PGRST205') { setFields([]); return; }
        if (error) throw error;
        setFields(data || []);
      }
    } catch (e: any) {
      console.error('Erro ao carregar campos de insatisfação:', e);
      toast.error('Não foi possível carregar os campos extras.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFields();
  }, []);

  const filteredFields = useMemo(() => {
    return fields
      .filter(f => statusFilter === 'active' ? f.active !== false : f.active === false)
      .filter(f => typeFilter === '' ? true : f.type === typeFilter)
      .filter(f => f.title.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [fields, statusFilter, typeFilter, searchTerm]);

  const handleAddOption = () => {
    const trimmed = newOption.trim();
    if (!trimmed) return;
    if (editingField.options?.includes(trimmed)) {
      return toast.warning('Esta opção já foi adicionada.');
    }
    setEditingField(prev => ({
      ...prev,
      options: [...(prev.options || []), trimmed]
    }));
    setNewOption('');
  };

  const handleRemoveOption = (index: number) => {
    setEditingField(prev => ({
      ...prev,
      options: (prev.options || []).filter((_, i) => i !== index)
    }));
  };

  const handleSaveField = async () => {
    if (!editingField.title?.trim()) {
      return toast.error('Por favor, informe o título do campo.');
    }
    if (!editingField.options || editingField.options.length === 0) {
      return toast.error('Por favor, adicione pelo menos uma opção para o campo.');
    }

    setSaving(true);
    try {
      const payload = {
        title: editingField.title.trim(),
        type: editingField.type || 'cliente',
        options: editingField.options,
        active: editingField.active !== false
      };

      if (!supabase) {
        if (editingField.id) {
          await mockDb.update('dissatisfaction_fields', editingField.id, payload);
        } else {
          await mockDb.insert('dissatisfaction_fields', payload);
        }
      } else {
        if (editingField.id) {
          const { error } = await supabase
            .from('dissatisfaction_fields')
            .update(payload)
            .eq('id', editingField.id);
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from('dissatisfaction_fields')
            .insert([payload]);
          if (error) throw error;
        }
      }

      toast.success(editingField.id ? 'Campo atualizado com sucesso!' : 'Campo criado com sucesso!');
      setIsModalOpen(false);
      loadFields();
    } catch (e: any) {
      console.error('Erro ao salvar campo de insatisfação:', e);
      toast.error('Não foi possível salvar o campo.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = async (id: string, active: boolean) => {
    try {
      if (!supabase) {
        await mockDb.update('dissatisfaction_fields', id, { active });
      } else {
        const { error } = await supabase
          .from('dissatisfaction_fields')
          .update({ active })
          .eq('id', id);
        if (error) throw error;
      }
      toast.success(active ? 'Campo ativado!' : 'Campo desativado!');
      setDeleteConfirmId(null);
      loadFields();
    } catch (e: any) {
      console.error('Erro ao alterar status do campo:', e);
      toast.error('Não foi possível alterar o status do campo.');
    }
  };

  const handleOpenNew = () => {
    setEditingField({
      title: '',
      type: 'cliente',
      options: [],
      active: true
    });
    setNewOption('');
    setIsModalOpen(true);
  };

  const handleOpenEdit = (field: DissatisfactionField) => {
    setEditingField({ ...field });
    setNewOption('');
    setIsModalOpen(true);
  };

  if (loading && fields.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <RefreshCw className="w-8 h-8 animate-spin text-brand-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="relative w-64 h-10">
            <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-brand-muted" />
            <input
              type="text"
              placeholder="Buscar campo..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full h-full bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 rounded-xl pl-11 pr-4 text-xs font-medium text-slate-900 dark:text-slate-50 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-slate-400 dark:focus:border-slate-600 focus:outline-none focus:ring-0 transition-all shadow-sm"
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
              value={typeFilter}
              onChange={val => setTypeFilter(val as string)}
              options={[
                { value: '', label: 'Todos os Tipos' }, 
                { value: 'cliente', label: 'Visão do Cliente' },
                { value: 'qualidade', label: 'Visão do Monitor' }
              ]}
              className="w-56"
            />
          </div>
        </div>
        <Button onClick={handleOpenNew} icon={<Plus className="w-4 h-4" />}>
          Adicionar Campo Extra
        </Button>
      </div>

      <Card padding="none" className="overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-surface-bg border-b border-surface-border">
              <th className="px-6 py-4 text-[10px] font-black uppercase text-brand-muted tracking-widest">Título do Campo</th>
              <th className="px-6 py-4 text-[10px] font-black uppercase text-brand-muted tracking-widest">Tipo / Exibição</th>
              <th className="px-6 py-4 text-[10px] font-black uppercase text-brand-muted tracking-widest">Opções Cadastradas</th>
              <th className="px-6 py-4 text-right text-[10px] font-black uppercase text-brand-muted tracking-widest">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-subtle">
            {filteredFields.map(f => (
              <tr key={f.id} className="hover:bg-surface-bg/50 transition-colors group">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-brand-subtle flex items-center justify-center text-brand-primary">
                      <Sliders className="w-4 h-4" />
                    </div>
                    <div>
                      <p className={`text-sm font-black tracking-tight ${f.active === false ? 'text-error' : 'text-brand-primary'}`}>
                        {f.title}
                      </p>
                      {f.active === false && <Badge variant="error" className="scale-75 origin-left mt-0.5">Desativado</Badge>}
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <Badge variant="neutral" className="bg-surface-subtle text-brand-primary uppercase text-[9px] tracking-wider font-extrabold">
                    {f.type === 'cliente' ? 'Visão do Cliente' : 'Visão do Monitor'}
                  </Badge>
                </td>
                <td className="px-6 py-4 max-w-xs md:max-w-md">
                  <div className="flex flex-wrap gap-1.5">
                    {f.options.map((opt, i) => (
                      <span key={i} className="text-[10px] bg-surface-card border border-surface-border text-brand-primary font-bold px-2 py-0.5 rounded-lg">
                        {opt}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex justify-end gap-1">
                    {f.active === false ? (
                      <Button variant="outline" size="sm" onClick={() => handleToggleStatus(f.id, true)} icon={<RefreshCw className="w-3.5 h-3.5" />}>Reativar</Button>
                    ) : (
                      <>
                        <button 
                          onClick={() => handleOpenEdit(f)} 
                          className="p-2.5 rounded-xl hover:bg-surface-subtle text-brand-muted hover:text-brand-primary transition-all animate-in fade-in"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        {deleteConfirmId === f.id ? (
                          <div className="flex items-center gap-1 animate-in fade-in slide-in-from-right-2">
                            <button onClick={() => handleToggleStatus(f.id, false)} className="px-2.5 py-1.5 rounded-lg bg-error text-white text-[10px] font-black uppercase">Sim</button>
                            <button onClick={() => setDeleteConfirmId(null)} className="px-2.5 py-1.5 rounded-lg bg-surface-subtle text-brand-muted text-[10px] font-black uppercase tracking-widest">Não</button>
                          </div>
                        ) : (
                          <button onClick={() => setDeleteConfirmId(f.id)} className="p-2.5 rounded-xl hover:bg-red-50 text-brand-muted hover:text-error transition-all"><Trash2 className="w-4 h-4" /></button>
                        )}
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {filteredFields.length === 0 && (
              <tr>
                <td colSpan={4} className="px-6 py-12 text-center text-xs font-bold text-brand-muted uppercase tracking-widest opacity-40">
                  Nenhum campo de insatisfação encontrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <Card className="max-w-lg w-full animate-in zoom-in-95 duration-200">
              <header className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-black text-brand-primary tracking-tight uppercase">
                  {editingField.id ? 'Editar Campo Extra' : 'Novo Campo Extra'}
                </h3>
                <button onClick={() => setIsModalOpen(false)} className="text-brand-muted hover:text-brand-primary">
                  <X className="w-6 h-6" />
                </button>
              </header>

              <div className="space-y-4">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-black text-brand-muted uppercase tracking-widest ml-1">Título do Campo *</label>
                  <input 
                    type="text" 
                    placeholder="Ex: Motivo da Insatisfação - Cliente"
                    className="w-full bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 rounded-xl py-2.5 px-4 text-sm font-semibold text-slate-900 dark:text-slate-50 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-slate-400 dark:focus:border-slate-600 focus:outline-none focus:ring-0 transition-all shadow-sm" 
                    value={editingField.title} 
                    onChange={e => setEditingField({ ...editingField, title: e.target.value })} 
                  />
                </div>

                <CustomSelect 
                  label="Tipo / Onde exibir"
                  value={editingField.type}
                  onChange={val => setEditingField({ ...editingField, type: val as any })}
                  options={[
                    { value: 'cliente', label: 'Visão do Cliente' },
                    { value: 'qualidade', label: 'Visão do Monitor' }
                  ]}
                />

                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-black text-brand-muted uppercase tracking-widest ml-1">Adicionar Opções *</label>
                  <div className="flex gap-2">
                    <input 
                      type="text" 
                      placeholder="Adicione uma opção (ex: Processo)"
                      className="flex-1 bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 rounded-xl py-2.5 px-4 text-sm font-semibold text-slate-900 dark:text-slate-50 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-slate-400 dark:focus:border-slate-600 focus:outline-none focus:ring-0 transition-all shadow-sm" 
                      value={newOption}
                      onChange={e => setNewOption(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddOption();
                        }
                      }}
                    />
                    <Button onClick={handleAddOption} variant="outline" icon={<Plus className="w-4 h-4" />}>
                      Adicionar
                    </Button>
                  </div>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-black text-brand-muted uppercase tracking-widest ml-1">Opções Adicionadas</label>
                  <div className="flex flex-wrap gap-2 p-4 bg-white dark:bg-slate-900/20 border border-slate-200 dark:border-slate-800 rounded-xl min-h-[80px] max-h-[160px] overflow-y-auto no-scrollbar">
                    {editingField.options?.map((opt, i) => (
                      <span 
                        key={i} 
                        className="inline-flex items-center gap-1.5 text-[10px] bg-slate-900 dark:bg-slate-50 text-white dark:text-slate-900 font-bold uppercase tracking-tight px-3 py-1.5 rounded-lg shadow-sm"
                      >
                        {opt}
                        <button 
                          type="button" 
                          onClick={() => handleRemoveOption(i)} 
                          className="hover:text-error transition-colors ml-0.5"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                    {(!editingField.options || editingField.options.length === 0) && (
                      <p className="text-[10px] font-bold text-brand-muted uppercase italic p-2 w-full text-center">Nenhuma opção adicionada ainda.</p>
                    )}
                  </div>
                </div>

                <Button className="w-full mt-4" onClick={handleSaveField} disabled={saving} icon={<Save className="w-4 h-4" />}>
                  {saving ? 'Salvando...' : 'Salvar Campo'}
                </Button>
              </div>
            </Card>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
