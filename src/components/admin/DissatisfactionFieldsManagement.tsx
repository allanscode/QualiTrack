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
      <div className="flex items-center justify-between w-full gap-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="relative w-64 h-10">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Buscar campo..."
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
        <Button onClick={handleOpenNew} icon={<Plus className="w-4 h-4" />} className="h-10 !rounded-lg !py-0 flex items-center shrink-0">
          Adicionar Campo Extra
        </Button>
      </div>

      <Card padding="none" className="overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-surface-bg border-b border-surface-border">
              <th className="px-6 py-4 text-left text-[10px] font-semibold tracking-wider uppercase text-slate-500 dark:text-zinc-500">Título do Campo</th>
              <th className="px-6 py-4 text-left text-[10px] font-semibold tracking-wider uppercase text-slate-500 dark:text-zinc-500">Tipo / Exibição</th>
              <th className="px-6 py-4 text-left text-[10px] font-semibold tracking-wider uppercase text-slate-500 dark:text-zinc-500">Opções Cadastradas</th>
              <th className="px-6 py-4 text-right text-[10px] font-semibold tracking-wider uppercase text-slate-500 dark:text-zinc-500">Ações</th>
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
                  <span className="inline-flex items-center text-xs font-medium text-slate-500 dark:text-zinc-400 bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 px-2.5 py-1 rounded-md">
                    {f.type === 'cliente' ? 'Visão do Cliente' : 'Visão do Monitor'}
                  </span>
                </td>
                <td className="px-6 py-4 max-w-xs md:max-w-md">
                  <div className="flex flex-row items-center gap-1 overflow-x-auto whitespace-nowrap scrollbar-none">
                    {f.options.slice(0, 4).map((opt, i) => (
                      <span key={i} className="bg-slate-50 dark:bg-zinc-900/50 border border-slate-200 dark:border-zinc-800/80 text-slate-500 dark:text-zinc-300 text-xs px-2 py-0.5 rounded-md font-normal shrink-0">
                        {opt}
                      </span>
                    ))}
                    {f.options.length > 4 && (
                      <span className="bg-slate-50 dark:bg-zinc-900/50 border border-slate-200 dark:border-zinc-800/80 text-slate-500 dark:text-zinc-300 text-xs px-2 py-0.5 rounded-md font-normal shrink-0">
                        +{f.options.length - 4}
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex justify-end items-center gap-1.5">
                    {f.active === false ? (
                      <Button variant="outline" size="sm" onClick={() => handleToggleStatus(f.id, true)} icon={<RefreshCw className="w-3.5 h-3.5" />} className="!rounded-lg h-8 text-xs font-normal">Reativar</Button>
                    ) : (
                      <>
                        <button 
                          onClick={() => handleOpenEdit(f)} 
                          className="p-1.5 rounded-md text-slate-400 hover:text-slate-900 dark:text-zinc-500 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800/40 transition-colors duration-150"
                          title="Editar"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        {deleteConfirmId === f.id ? (
                          <div className="flex items-center gap-1 animate-in fade-in slide-in-from-right-2">
                            <button onClick={() => handleToggleStatus(f.id, false)} className="px-2 py-1 rounded bg-error text-white text-[10px] font-semibold uppercase">Sim</button>
                            <button onClick={() => setDeleteConfirmId(null)} className="px-2 py-1 rounded bg-surface-subtle text-brand-muted text-[10px] font-semibold uppercase">Não</button>
                          </div>
                        ) : (
                          <button 
                            onClick={() => setDeleteConfirmId(f.id)} 
                            className="p-1.5 rounded-md text-slate-400 hover:text-error dark:text-zinc-500 dark:hover:text-error hover:bg-slate-100 dark:hover:bg-zinc-800/40 transition-colors duration-150"
                            title="Excluir"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {filteredFields.length === 0 && (
              <tr>
                <td colSpan={4} className="px-6 py-12 text-center text-xs font-normal text-slate-500 dark:text-slate-500">
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
            <Card className="max-w-md w-full animate-in zoom-in-95 duration-200" padding="lg">
              <header className="flex items-center justify-between mb-6">
                <h3 className="text-base font-bold text-brand-primary tracking-tight uppercase">
                  {editingField.id ? 'Editar Campo Extra' : 'Novo Campo Extra'}
                </h3>
                <button onClick={() => setIsModalOpen(false)} className="text-brand-muted hover:text-brand-primary transition-colors cursor-pointer">
                  <X className="w-5 h-5" />
                </button>
              </header>

              <div className="space-y-4">
                <div className="flex flex-col gap-1">
                  <label className="uppercase text-[10px] font-medium text-slate-400 dark:text-slate-500 tracking-wide mb-1.5 ml-0.5 block">Título do Campo *</label>
                  <input 
                    type="text" 
                    placeholder="Ex: Motivo da Insatisfação - Cliente"
                    className="w-full h-10 bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 rounded-lg px-3 text-sm font-normal text-slate-900 dark:text-slate-50 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-slate-400 dark:focus:border-slate-600 focus:outline-none focus:ring-0 transition-all shadow-sm" 
                    value={editingField.title} 
                    onChange={e => setEditingField({ ...editingField, title: e.target.value })} 
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="uppercase text-[10px] font-medium text-slate-400 dark:text-slate-500 tracking-wide mb-1.5 ml-0.5 block">Tipo / Onde Exibir</label>
                  <CustomSelect 
                    value={editingField.type}
                    onChange={val => setEditingField({ ...editingField, type: val as any })}
                    options={[
                      { value: 'cliente', label: 'Visão do Cliente' },
                      { value: 'qualidade', label: 'Visão do Monitor' }
                    ]}
                    className="[&>div>div]:!rounded-lg [&_span]:!text-sm [&_span]:!font-normal [&_input]:!text-sm [&_input]:!font-normal [&>div>div]:h-10 [&_svg]:w-4 [&_svg]:h-4"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="uppercase text-[10px] font-medium text-slate-400 dark:text-slate-500 tracking-wide mb-1.5 ml-0.5 block">Adicionar Opções *</label>
                  <div className="flex items-center gap-2">
                    <input 
                      type="text" 
                      placeholder="Adicione uma opção (ex: Processo)"
                      className="flex-1 h-10 bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 rounded-lg px-3 text-sm font-normal text-slate-900 dark:text-slate-50 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-slate-400 dark:focus:border-slate-600 focus:outline-none focus:ring-0 transition-all shadow-sm" 
                      value={newOption}
                      onChange={e => setNewOption(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddOption();
                        }
                      }}
                    />
                    <Button 
                      onClick={handleAddOption} 
                      variant="outline" 
                      icon={<Plus className="w-4 h-4" />} 
                      className="h-10 !rounded-lg !py-0 px-4 flex items-center justify-center shrink-0 text-sm font-normal"
                    >
                      Adicionar
                    </Button>
                  </div>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="uppercase text-[10px] font-medium text-slate-400 dark:text-slate-500 tracking-wide mb-1.5 ml-0.5 block">Opções Adicionadas</label>
                  <div className={`flex flex-wrap gap-1.5 bg-white dark:bg-slate-900/20 border border-slate-200 dark:border-slate-800 rounded-lg min-h-[50px] max-h-[160px] overflow-y-auto no-scrollbar transition-all ${
                    (!editingField.options || editingField.options.length === 0) ? 'py-2 px-3' : 'p-3'
                  }`}>
                    {editingField.options?.map((opt, i) => (
                      <span 
                        key={i} 
                        className="inline-flex items-center gap-1 bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 border-none shadow-sm animate-in fade-in zoom-in-95 duration-150"
                      >
                        {opt}
                        <button 
                          type="button" 
                          onClick={() => handleRemoveOption(i)} 
                          className="hover:text-error hover:bg-error/10 rounded-full p-0.5 transition-all ml-1 inline-flex items-center justify-center text-brand-muted"
                        >
                          <X className="w-2.5 h-2.5" />
                        </button>
                      </span>
                    ))}
                    {(!editingField.options || editingField.options.length === 0) && (
                      <p className="text-sm font-normal text-slate-500 dark:text-slate-500 py-1 w-full text-center">Nenhuma opção adicionada ainda.</p>
                    )}
                  </div>
                </div>

                <Button 
                  className="w-full h-10 !rounded-lg mt-4 flex items-center justify-center text-sm font-medium" 
                  onClick={handleSaveField} 
                  disabled={saving} 
                  icon={<Save className="w-4 h-4" />}
                >
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
