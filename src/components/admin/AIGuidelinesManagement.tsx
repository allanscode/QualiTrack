import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { AIEvaluationGuideline, User } from '../../types';
import {
  fetchAIGuidelines,
  saveAIGuideline,
  updateAIGuideline,
  toggleAIGuidelineActive,
  deleteAIGuideline,
  downloadAIGuidelineFile,
  extractPdfText,
  extractPlainText,
  isPlainTextFile
} from '../../lib/aiGuidelines';
import { Brain, Plus, Trash2, X, Save, RefreshCw, Upload, FileText, Download, ToggleLeft, ToggleRight, Eye, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Badge from '../ui/Badge';

interface AIGuidelinesManagementProps {
  currentUser: User | null;
}

const MARKDOWN_PREVIEW_CLASSES = [
  'w-full min-h-[240px] max-h-[400px] px-4 py-3 rounded-xl border border-surface-border bg-surface-subtle overflow-y-auto',
  'text-xs text-brand-primary',
  '[&_h1]:text-sm [&_h1]:font-black [&_h1]:mb-2 [&_h1]:mt-3',
  '[&_h2]:text-xs [&_h2]:font-black [&_h2]:mb-1.5 [&_h2]:mt-2',
  '[&_h3]:text-xs [&_h3]:font-bold [&_h3]:mb-1 [&_h3]:mt-2',
  '[&_p]:mb-2 [&_p]:leading-relaxed',
  '[&_ul]:list-disc [&_ul]:pl-4 [&_ul]:mb-2',
  '[&_ol]:list-decimal [&_ol]:pl-4 [&_ol]:mb-2',
  '[&_li]:mb-0.5',
  '[&_strong]:font-bold [&_em]:italic',
  '[&_code]:bg-surface-base [&_code]:px-1 [&_code]:rounded [&_code]:text-[10px]',
  '[&_pre]:bg-surface-base [&_pre]:p-2 [&_pre]:rounded-lg [&_pre]:overflow-x-auto [&_pre]:mb-2',
  '[&_blockquote]:border-l-2 [&_blockquote]:border-surface-border [&_blockquote]:pl-3 [&_blockquote]:text-brand-muted [&_blockquote]:mb-2',
  '[&_hr]:border-surface-border [&_hr]:my-2',
].join(' ');

export default function AIGuidelinesManagement({ currentUser }: AIGuidelinesManagementProps) {
  const [guidelines, setGuidelines] = useState<AIEvaluationGuideline[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [editingGuideline, setEditingGuideline] = useState<AIEvaluationGuideline | null>(null);
  // Aba do modal: 'file' = fonte/arquivo, 'preview' = visualizar conteúdo Markdown extraído
  const [modalTab, setModalTab] = useState<'file' | 'preview'>('file');

  const [title, setTitle] = useState('');
  // Conteúdo Markdown extraído automaticamente do arquivo — NÃO editável pelo usuário
  const [extractedContent, setExtractedContent] = useState('');
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
    setExtractedContent('');
    setFile(null);
    setEditingGuideline(null);
    setModalTab('file');
  };

  const openEditModal = (g: AIEvaluationGuideline) => {
    setEditingGuideline(g);
    setTitle(g.title);
    setExtractedContent(g.content);
    setFile(null);
    setModalTab('file');
    setIsModalOpen(true);
  };

  const handleFileChange = async (selected: File | null) => {
    setFile(selected);
    setExtractedContent('');
    if (!selected) return;

    const isPdf = selected.type === 'application/pdf' || selected.name.toLowerCase().endsWith('.pdf');
    const isText = isPlainTextFile(selected);

    if (!isPdf && !isText) {
      toast.error('Formato não suportado. Use PDF, .txt, .md ou .csv.');
      setFile(null);
      return;
    }

    setExtracting(true);
    try {
      const text = isPdf ? await extractPdfText(selected) : await extractPlainText(selected);
      if (!text) {
        toast.warning('Não foi possível extrair texto do arquivo (PDF pode ser escaneado). Tente outro arquivo.');
        setFile(null);
      } else {
        setExtractedContent(text);
        toast.success(`Conteúdo extraído com sucesso — ${text.length.toLocaleString('pt-BR')} caracteres prontos para a IA.`);
      }
    } catch (e: any) {
      console.error('Erro ao extrair texto do arquivo:', e);
      toast.error('Falha ao ler o arquivo. Tente novamente ou use outro formato.');
      setFile(null);
    } finally {
      setExtracting(false);
    }
  };

  const handleSave = async () => {
    if (!title.trim()) {
      toast.error('Preencha o título do manual.');
      return;
    }
    // Ao criar: precisa de arquivo (que gera o conteúdo)
    // Ao editar sem novo arquivo: usa o conteúdo já existente do manual
    const contentToSave = extractedContent.trim() || (editingGuideline ? editingGuideline.content : '');
    if (!contentToSave) {
      toast.error('Selecione um arquivo para o manual. O conteúdo é extraído automaticamente do PDF ou arquivo.');
      return;
    }

    setSaving(true);
    try {
      if (editingGuideline) {
        // Ao editar: atualiza título e, se tiver novo arquivo, atualiza o conteúdo também
        await updateAIGuideline(editingGuideline.id, {
          title: title.trim(),
          content: contentToSave,
        });
        toast.success('Manual atualizado — a IA usa o novo conteúdo já na próxima avaliação.');
      } else {
        await saveAIGuideline({
          title: title.trim(),
          content: contentToSave,
          file: file || undefined,
          createdBy: currentUser?.id
        });
        toast.success('Manual salvo — a IA passa a usá-lo já na próxima avaliação.');
      }
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
      toast.error(e?.message || 'Falha ao gerar link do arquivo.');
    }
  };

  // Conteúdo que está disponível no preview (arquivo novo ou existente)
  const previewContent = extractedContent || (editingGuideline?.content ?? '');

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Brain className="w-4 h-4 text-brand-highlight" />
            <h3 className="text-sm font-black text-brand-primary">Manual de Padrões de Atendimento (IA)</h3>
          </div>
          <p className="text-xs font-semibold text-brand-muted mt-0.5">
            Suba um PDF ou arquivo .md — o conteúdo é extraído automaticamente e enviado para a IA ao avaliar tickets.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Button variant="primary" size="sm" onClick={() => { resetForm(); setIsModalOpen(true); }} className="flex items-center gap-1.5">
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
          <Card key={g.id} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h4 className="text-xs font-black text-brand-primary">{g.title}</h4>
                  <Badge variant={g.active ? 'success' : 'neutral'} size="xs">
                    {g.active ? 'Ativo' : 'Inativo'}
                  </Badge>
                  <span className="text-[10px] font-bold text-brand-muted bg-surface-subtle border border-surface-border rounded px-1">.md</span>
                </div>
                {/* Arquivo fonte */}
                {g.file_name && (
                  <div className="flex items-center gap-1.5 mt-1.5">
                    <FileText className="w-3 h-3 text-brand-highlight flex-shrink-0" />
                    <span className="text-[11px] font-semibold text-brand-muted">{g.file_name}</span>
                    <span className="text-[10px] text-brand-muted/60">·</span>
                    <span className="text-[10px] text-brand-muted/60">{(g.content.length / 1000).toFixed(1)}k caracteres extraídos</span>
                  </div>
                )}
                {!g.file_name && (
                  <p className="text-[11px] font-medium text-brand-muted mt-1 line-clamp-2">
                    {g.content.replace(/#{1,6}\s/g, '').replace(/\*\*/g, '').replace(/\*/g, '').replace(/`/g, '')}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                {g.file_path && (
                  <Button variant="ghost" size="sm" onClick={() => handleDownload(g)} title="Baixar arquivo original">
                    <Download className="w-3.5 h-3.5" />
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={() => openEditModal(g)} title="Editar manual">
                  <Eye className="w-3.5 h-3.5" />
                </Button>
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
          </Card>
        ))}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => { setIsModalOpen(false); resetForm(); }}>
          <div onClick={(e: React.MouseEvent) => e.stopPropagation()} className="w-full max-w-2xl">
          <Card className="p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black text-brand-primary">
                {editingGuideline ? 'Gerenciar Manual' : 'Novo Manual de Padrões'}
              </h3>
              <Button variant="ghost" size="sm" onClick={() => { setIsModalOpen(false); resetForm(); }}><X className="w-4 h-4" /></Button>
            </div>

            {/* Título */}
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

            {/* Tabs: Arquivo / Conteúdo */}
            <div className="space-y-3">
              <div className="flex items-center gap-0.5 bg-surface-subtle border border-surface-border rounded-lg p-0.5 w-fit">
                <button
                  type="button"
                  onClick={() => setModalTab('file')}
                  className={`px-3 py-1 rounded-md text-[11px] font-bold transition-colors ${modalTab === 'file' ? 'bg-white dark:bg-surface-base text-brand-primary shadow-sm' : 'text-brand-muted hover:text-brand-primary'}`}
                >
                  Arquivo Fonte
                </button>
                <button
                  type="button"
                  onClick={() => setModalTab('preview')}
                  disabled={!previewContent}
                  className={`px-3 py-1 rounded-md text-[11px] font-bold transition-colors ${modalTab === 'preview' ? 'bg-white dark:bg-surface-base text-brand-primary shadow-sm' : 'text-brand-muted hover:text-brand-primary'} disabled:opacity-40 disabled:cursor-not-allowed`}
                >
                  Conteúdo que a IA lê
                </button>
              </div>

              {modalTab === 'file' && (
                <div className="space-y-3">
                  {/* Arquivo atual (modo edição) */}
                  {editingGuideline?.file_name && (
                    <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-surface-border bg-surface-subtle">
                      <FileText className="w-5 h-5 text-brand-highlight flex-shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-black text-brand-primary">{editingGuideline.file_name}</p>
                        <p className="text-[10px] font-semibold text-brand-muted mt-0.5">
                          Arquivo atual · {(editingGuideline.content.length / 1000).toFixed(1)}k caracteres extraídos
                        </p>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => handleDownload(editingGuideline)} title="Baixar arquivo original">
                        <Download className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  )}

                  {/* Upload de novo arquivo */}
                  <div className="space-y-1">
                    <label className="text-[11px] font-black uppercase tracking-wider text-brand-muted">
                      {editingGuideline?.file_name ? 'Substituir arquivo (opcional)' : 'Arquivo do manual *'}
                    </label>
                    <label className={`flex items-center gap-3 px-4 py-3 rounded-xl border-2 border-dashed cursor-pointer transition-colors ${
                      file ? 'border-functional-success/50 bg-functional-success/5' : 'border-surface-border bg-surface-subtle hover:border-brand-highlight/50'
                    }`}>
                      {file ? (
                        <>
                          <CheckCircle2 className="w-4 h-4 text-functional-success flex-shrink-0" />
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-bold text-brand-primary">{file.name}</p>
                            <p className="text-[10px] font-semibold text-functional-success mt-0.5">
                              {extracting ? 'Extraindo conteúdo...' : `${(extractedContent.length / 1000).toFixed(1)}k caracteres extraídos`}
                            </p>
                          </div>
                        </>
                      ) : (
                        <>
                          <Upload className="w-4 h-4 text-brand-muted flex-shrink-0" />
                          <div>
                            <p className="text-xs font-bold text-brand-primary">
                              {extracting ? 'Extraindo conteúdo do arquivo...' : 'Selecionar arquivo'}
                            </p>
                            <p className="text-[10px] font-semibold text-brand-muted mt-0.5">
                              PDF, .md, .txt ou .csv — o texto é extraído automaticamente para a IA
                            </p>
                          </div>
                        </>
                      )}
                      <input
                        type="file"
                        accept="application/pdf,.pdf,text/plain,.txt,.md,.markdown,text/markdown,.csv,text/csv"
                        className="hidden"
                        disabled={extracting}
                        onChange={e => handleFileChange(e.target.files?.[0] || null)}
                      />
                    </label>
                  </div>

                  {!editingGuideline && !file && (
                    <p className="text-[10px] font-semibold text-brand-muted">
                      💡 O conteúdo do arquivo (PDF/Markdown) é convertido automaticamente e enviado para a IA como referência normativa.
                    </p>
                  )}
                </div>
              )}

              {modalTab === 'preview' && (
                <div className="space-y-2">
                  <p className="text-[10px] font-semibold text-brand-muted">
                    Conteúdo exato que a IA recebe ao avaliar um ticket com este manual ativo:
                  </p>
                  <div className={MARKDOWN_PREVIEW_CLASSES}>
                    {previewContent ? (
                      <ReactMarkdown>{previewContent}</ReactMarkdown>
                    ) : (
                      <p className="text-brand-muted italic">Nenhum conteúdo disponível.</p>
                    )}
                  </div>
                  <p className="text-[10px] font-semibold text-brand-muted text-right">
                    {previewContent.length.toLocaleString('pt-BR')} caracteres
                  </p>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button variant="ghost" size="sm" onClick={() => { setIsModalOpen(false); resetForm(); }}>Cancelar</Button>
              <Button variant="primary" size="sm" disabled={saving || extracting} onClick={handleSave} className="flex items-center gap-1.5">
                <Save className="w-3.5 h-3.5" />
                <span>{saving ? 'Salvando...' : editingGuideline ? 'Salvar Alterações' : 'Salvar Manual'}</span>
              </Button>
            </div>
          </Card>
          </div>
        </div>
      )}
    </div>
  );
}
