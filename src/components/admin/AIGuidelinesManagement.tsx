import React, { useState, useEffect } from 'react';
import { AIEvaluationGuideline, User } from '../../types';
import {
  fetchAIGuidelines,
  saveAIGuideline,
  toggleAIGuidelineActive,
  deleteAIGuideline,
  downloadAIGuidelineFile,
  extractPdfText
} from '../../lib/aiGuidelines';
import { Brain, Plus, Trash2, X, Save, RefreshCw, Upload, FileText, Download, ToggleLeft, ToggleRight } from 'lucide-react';
import { toast } from 'sonner';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Badge from '../ui/Badge';

interface AIGuidelinesManagementProps {
  currentUser: User | null;
}

export default function AIGuidelinesManagement({ currentUser }: AIGuidelinesManagementProps) {
  const [guidelines, setGuidelines] = useState<AIEvaluationGuideline[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [file, setFile] = useState<File | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      setGuidelines(await fetchAIGuidelines());
    } catch (e) {
      console.error(e);
      toast.error('Não foi possível carregar os manuais de avaliação.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const resetForm = () => {
    setTitle('');
    setContent('');
    setFile(null);
  };

  const handleFileChange = async (selected: File | null) => {
    setFile(selected);
    if (!selected) return;
    if (selected.type !== 'application/pdf') {
      toast.error('Só PDF é aceito para extração automática de texto.');
      return;
    }
    setExtracting(true);
    try {
      const text = await extractPdfText(selected);
      if (!text) {
        toast.warning('Não foi possível extrair texto do PDF (pode ser um PDF escaneado/imagem). Cole o texto manualmente.');
      } else {
        setContent(prev => prev ? `${prev}\n\n${text}` : text);
        toast.success('Texto extraído do PDF e adicionado ao manual.');
      }
    } catch (e: any) {
      console.error('Erro ao extrair PDF:', e);
      toast.error('Falha ao ler o PDF. Cole o texto manualmente ou tente outro arquivo.');
    } finally {
      setExtracting(false);
    }
  };

  const handleSave = async () => {
    if (!title.trim() || !content.trim()) {
      toast.error('Preencha o título e o conteúdo do manual.');
      return;
    }
    setSaving(true);
    try {
      await saveAIGuideline({ title: title.trim(), content: content.trim(), file: file || undefined, createdBy: currentUser?.id });
      toast.success('Manual salvo — a IA passa a usá-lo já na próxima avaliação.');
      setIsModalOpen(false);
      resetForm();
      load();
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || 'Falha ao salvar o manual.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (g: AIEvaluationGuideline) => {
    try {
      await toggleAIGuidelineActive(g.id, !g.active);
      setGuidelines(prev => prev.map(x => x.id === g.id ? { ...x, active: !g.active } : x));
    } catch (e: any) {
      toast.error(e?.message || 'Falha ao atualizar o manual.');
    }
  };

  const handleDelete = async (g: AIEvaluationGuideline) => {
    try {
      await deleteAIGuideline(g);
      setGuidelines(prev => prev.filter(x => x.id !== g.id));
      toast.success('Manual removido.');
    } catch (e: any) {
      toast.error(e?.message || 'Falha ao remover o manual.');
    } finally {
      setDeleteConfirmId(null);
    }
  };

  const handleDownload = async (g: AIEvaluationGuideline) => {
    if (!g.file_path) return;
    try {
      const url = await downloadAIGuidelineFile(g.file_path);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (e: any) {
      toast.error(e?.message || 'Falha ao gerar link do PDF.');
    }
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Brain className="w-4 h-4 text-brand-highlight" />
            <h3 className="text-sm font-black text-brand-primary">Manual de Padrões de Atendimento (IA)</h3>
          </div>
          <p className="text-xs font-semibold text-brand-muted mt-0.5">
            Texto (colado ou extraído de PDF) usado como referência normativa adicional pela IA ao avaliar
            tickets na Fila de Positivas — além dos critérios da própria ficha.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Button variant="primary" size="sm" onClick={() => setIsModalOpen(true)} className="flex items-center gap-1.5">
            <Plus className="w-3.5 h-3.5" />
            <span>Novo Manual</span>
          </Button>
        </div>
      </div>

      {guidelines.length === 0 && !loading && (
        <Card className="p-6 text-center text-xs font-semibold text-brand-muted">
          Nenhum manual cadastrado ainda. A IA avalia só com base nos critérios da ficha até que você adicione um.
        </Card>
      )}

      <div className="space-y-3">
        {guidelines.map(g => (
          <Card key={g.id} className="p-4 space-y-2">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h4 className="text-xs font-black text-brand-primary truncate">{g.title}</h4>
                  <Badge variant={g.active ? 'success' : 'neutral'} size="xs">
                    {g.active ? 'Ativo' : 'Inativo'}
                  </Badge>
                </div>
                <p className="text-[11px] font-medium text-brand-muted mt-1 line-clamp-2">{g.content}</p>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                {g.file_path && (
                  <Button variant="ghost" size="sm" onClick={() => handleDownload(g)} title="Baixar PDF original">
                    <Download className="w-3.5 h-3.5" />
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={() => handleToggle(g)} title={g.active ? 'Desativar' : 'Ativar'}>
                  {g.active ? <ToggleRight className="w-4 h-4 text-functional-success" /> : <ToggleLeft className="w-4 h-4 text-brand-muted" />}
                </Button>
                {deleteConfirmId === g.id ? (
                  <div className="flex items-center gap-1">
                    <Button variant="danger" size="sm" onClick={() => handleDelete(g)}>Confirmar</Button>
                    <Button variant="ghost" size="sm" onClick={() => setDeleteConfirmId(null)}>Cancelar</Button>
                  </div>
                ) : (
                  <Button variant="ghost" size="sm" onClick={() => setDeleteConfirmId(g.id)} title="Remover">
                    <Trash2 className="w-3.5 h-3.5 text-functional-error" />
                  </Button>
                )}
              </div>
            </div>
            {g.file_name && (
              <div className="flex items-center gap-1 text-[10px] font-bold text-brand-muted">
                <FileText className="w-3 h-3" />
                <span>{g.file_name}</span>
              </div>
            )}
          </Card>
        ))}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setIsModalOpen(false)}>
          <div onClick={(e: React.MouseEvent) => e.stopPropagation()} className="w-full max-w-2xl">
          <Card className="p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black text-brand-primary">Novo Manual de Padrões</h3>
              <Button variant="ghost" size="sm" onClick={() => setIsModalOpen(false)}><X className="w-4 h-4" /></Button>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-black uppercase tracking-wider text-brand-muted">Título *</label>
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="Ex.: Manual de Atendimento WebPosto v2"
                className="w-full px-3 py-2 rounded-xl border border-surface-border bg-surface-subtle text-sm font-semibold"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-black uppercase tracking-wider text-brand-muted">
                Anexar PDF (opcional — extrai o texto automaticamente)
              </label>
              <label className="flex items-center gap-2 px-3 py-2 rounded-xl border border-dashed border-surface-border bg-surface-subtle text-xs font-bold text-brand-muted cursor-pointer hover:border-brand-highlight/50">
                <Upload className="w-3.5 h-3.5" />
                <span>{extracting ? 'Extraindo texto do PDF...' : (file?.name || 'Selecionar arquivo PDF')}</span>
                <input
                  type="file"
                  accept="application/pdf"
                  className="hidden"
                  disabled={extracting}
                  onChange={e => handleFileChange(e.target.files?.[0] || null)}
                />
              </label>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-black uppercase tracking-wider text-brand-muted">
                Conteúdo (o que a IA efetivamente lê) *
              </label>
              <textarea
                value={content}
                onChange={e => setContent(e.target.value)}
                rows={10}
                placeholder="Cole aqui o texto do manual, ou anexe um PDF acima para extrair automaticamente."
                className="w-full px-3 py-2 rounded-xl border border-surface-border bg-surface-subtle text-xs font-medium resize-y"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button variant="ghost" size="sm" onClick={() => setIsModalOpen(false)}>Cancelar</Button>
              <Button variant="primary" size="sm" disabled={saving || extracting} onClick={handleSave} className="flex items-center gap-1.5">
                <Save className="w-3.5 h-3.5" />
                <span>{saving ? 'Salvando...' : 'Salvar Manual'}</span>
              </Button>
            </div>
          </Card>
          </div>
        </div>
      )}
    </div>
  );
}
