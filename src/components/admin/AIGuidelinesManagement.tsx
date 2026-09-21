import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import ReactMarkdown from 'react-markdown';
import { AIEvaluationGuideline, GuidelineVersion, User } from '../../types';
import {
  fetchAIGuidelines,
  saveAIGuideline,
  updateAIGuideline,
  proposeGuidelineUpdate,
  approveGuidelineUpdate,
  rejectGuidelineUpdate,
  toggleAIGuidelineActive,
  deleteAIGuideline,
  downloadAIGuidelineFile,
  extractPdfText,
  extractPlainText,
  isPlainTextFile
} from '../../lib/aiGuidelines';
import {
  Brain,
  Plus,
  Trash2,
  X,
  Save,
  RefreshCw,
  Upload,
  FileText,
  Download,
  ToggleLeft,
  ToggleRight,
  Eye,
  CheckCircle2,
  History,
  ShieldCheck,
  AlertTriangle,
  Check,
  RotateCcw,
  Sparkles,
  Send,
  GitCommit
} from 'lucide-react';
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
  const [reviewGuideline, setReviewGuideline] = useState<AIEvaluationGuideline | null>(null);
  const [historyGuideline, setHistoryGuideline] = useState<AIEvaluationGuideline | null>(null);
  const [selectedHistoryVersion, setSelectedHistoryVersion] = useState<GuidelineVersion | null>(null);
  const [approving, setApproving] = useState(false);

  const isAdmin = currentUser?.role === 'admin';

  useEffect(() => {
    const isAnyOpen = isModalOpen || !!reviewGuideline || !!historyGuideline;
    window.dispatchEvent(new CustomEvent('qualitrack:modal', { detail: { open: isAnyOpen } }));
    return () => {
      if (isAnyOpen) {
        window.dispatchEvent(new CustomEvent('qualitrack:modal', { detail: { open: false } }));
      }
    };
  }, [isModalOpen, reviewGuideline, historyGuideline]);

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
        if (isAdmin) {
          // Administrador edita direto com arquivamento da versão anterior
          await updateAIGuideline(
            editingGuideline.id,
            { title: title.trim(), content: contentToSave },
            editingGuideline,
            currentUser || undefined
          );
          toast.success('Manual atualizado com sucesso — a IA usa o novo conteúdo já na próxima avaliação.');
        } else {
          // Monitor ou Gestor de Qualidade propõe alteração para verificação do Admin
          await proposeGuidelineUpdate(
            editingGuideline,
            { title: title.trim(), content: contentToSave },
            { id: currentUser?.id, name: currentUser?.name, role: currentUser?.role }
          );
          toast.success('Proposta enviada para verificação do administrador. O manual ativo segue em uso até a aprovação.');
        }
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

  const handleApprove = async (g: AIEvaluationGuideline) => {
    setApproving(true);
    try {
      await approveGuidelineUpdate(g, { id: currentUser?.id, name: currentUser?.name || 'Administrador' });
      toast.success('Alteração verificada e aprovada! O novo manual agora está ativo para as avaliações da IA.');
      setReviewGuideline(null);
      load();
    } catch (e: any) {
      toast.error(e.message || 'Falha ao aprovar alteração.');
    } finally {
      setApproving(false);
    }
  };

  const handleReject = async (g: AIEvaluationGuideline) => {
    setApproving(true);
    try {
      await rejectGuidelineUpdate(g, 'Rejeitado pelo Administrador após verificação de impacto na IA');
      toast.info('Proposta de alteração rejeitada. O manual oficial segue inalterado.');
      setReviewGuideline(null);
      load();
    } catch (e: any) {
      toast.error(e.message || 'Falha ao rejeitar proposta.');
    } finally {
      setApproving(false);
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
        {guidelines.map(g => {
          const isPending = g.status === 'pending_approval' && Boolean(g.pending_content);
          return (
            <Card key={g.id} className={`p-4 transition-all ${isPending ? 'border-amber-500/40 bg-amber-500/5' : ''}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="text-xs font-black text-brand-primary">{g.title}</h4>
                    <span className="text-[10px] font-mono font-bold text-brand-muted px-1.5 py-0.5 rounded bg-surface-subtle border border-surface-border">
                      v{g.version || 1}
                    </span>
                    <Badge variant={g.active ? 'success' : 'neutral'} size="xs">
                      {g.active ? 'Ativo na IA' : 'Inativo'}
                    </Badge>
                    {isPending && (
                      <span className="flex items-center gap-1 text-[10px] font-bold text-amber-700 dark:text-amber-300 bg-amber-500/15 border border-amber-500/30 rounded-full px-2 py-0.5">
                        <AlertTriangle className="w-3 h-3 text-amber-500" />
                        <span>Alteração Proposta (Aguardando Verificação)</span>
                      </span>
                    )}
                    <span className="text-[10px] font-bold text-brand-muted bg-surface-subtle border border-surface-border rounded px-1">.md</span>
                  </div>

                  {/* Alerta e Detalhes da Proposta Pendente */}
                  {isPending && (
                    <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-800 dark:text-amber-200 space-y-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-[11px] font-bold">
                          Modificado por: {g.pending_modified_by_name || 'Monitor de Qualidade'} {g.pending_modified_at && `em ${new Date(g.pending_modified_at).toLocaleDateString('pt-BR')}`}
                        </span>
                        {isAdmin && (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => setReviewGuideline(g)}
                            className="flex items-center gap-1.5 text-xs font-bold border-amber-500/40 text-amber-700 dark:text-amber-300 bg-amber-500/15 hover:bg-amber-500/25 cursor-pointer shadow-xs"
                          >
                            <ShieldCheck className="w-3.5 h-3.5 text-amber-500" />
                            <span>Verificar Alterações</span>
                          </Button>
                        )}
                      </div>
                      <p className="text-[10px] text-amber-700/80 dark:text-amber-300/80">
                        O conteúdo atual segue ativo para a IA até a aprovação do Administrador.
                      </p>
                    </div>
                  )}

                  {/* Arquivo fonte */}
                  {g.file_name && (
                    <div className="flex items-center gap-1.5 mt-1">
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
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setHistoryGuideline(g);
                      setSelectedHistoryVersion(null);
                    }}
                    title="Histórico de Versões e Auditoria"
                    className="cursor-pointer"
                  >
                    <History className="w-3.5 h-3.5 text-brand-muted hover:text-brand-primary" />
                  </Button>
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
          );
        })}
      </div>

      {/* Modal: Cadastro / Edição de Manual com Governança */}
      {isModalOpen && createPortal(
        <div className="fixed inset-0 bg-black/75 backdrop-blur-xs flex items-center justify-center z-[9999] p-2 sm:p-4 md:p-6 animate-fade-in" onClick={() => { setIsModalOpen(false); resetForm(); }}>
          <div onClick={(e: React.MouseEvent) => e.stopPropagation()} className="w-full max-w-2xl">
          <Card className="p-6 space-y-4 max-h-[92vh] overflow-y-auto no-scrollbar shadow-2xl border border-surface-border">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Brain className="w-4 h-4 text-brand-highlight" />
                <h3 className="text-sm font-black text-brand-primary">
                  {editingGuideline ? 'Gerenciar / Editar Manual' : 'Novo Manual de Padrões'}
                </h3>
              </div>
              <Button variant="ghost" size="sm" onClick={() => { setIsModalOpen(false); resetForm(); }}><X className="w-4 h-4" /></Button>
            </div>

            {/* Aviso de Governança para Monitores e Gestores de Qualidade */}
            {!isAdmin && editingGuideline && (
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-700 dark:text-amber-300 text-xs space-y-1">
                <div className="flex items-center gap-1.5 font-bold">
                  <ShieldCheck className="w-4 h-4 text-amber-500" />
                  <span>Fluxo de Governança de Padrões da IA</span>
                </div>
                <p className="text-[11px] leading-relaxed text-brand-muted">
                  Como monitor de qualidade, sua proposta de edição será salva e encaminhada para o Administrador verificar se afeta as avaliações da IA. O manual atual permanece ativo até a validação formal.
                </p>
              </div>
            )}

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

            {/* Abas do Modal */}
            <div className="flex border-b border-surface-border gap-2">
              <button
                type="button"
                onClick={() => setModalTab('file')}
                className={`py-2 px-3 text-xs font-bold border-b-2 transition-all cursor-pointer ${
                  modalTab === 'file'
                    ? 'border-brand-highlight text-brand-highlight'
                    : 'border-transparent text-brand-muted hover:text-brand-primary'
                }`}
              >
                📎 Arquivo / Fonte
              </button>
              <button
                type="button"
                onClick={() => setModalTab('preview')}
                className={`py-2 px-3 text-xs font-bold border-b-2 transition-all cursor-pointer ${
                  modalTab === 'preview'
                    ? 'border-brand-highlight text-brand-highlight'
                    : 'border-transparent text-brand-muted hover:text-brand-primary'
                }`}
              >
                👁️ Visualizar Markdown Extraído
              </button>
            </div>

            {/* Conteúdo da Aba */}
            <div>
              {modalTab === 'file' && (
                <div className="space-y-3">
                  <div className="space-y-1">
                    <label className="text-[11px] font-black uppercase tracking-wider text-brand-muted">Arquivo do Manual (.pdf, .md, .txt)</label>
                    <label className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-surface-border rounded-xl cursor-pointer hover:border-brand-highlight hover:bg-surface-subtle/50 transition-all">
                      <Upload className="w-8 h-8 text-brand-muted mb-2" />
                      <span className="text-xs font-bold text-brand-primary">
                        {file ? file.name : (editingGuideline?.file_name ? `Substituir ${editingGuideline.file_name}` : 'Selecionar arquivo...')}
                      </span>
                      <span className="text-[10px] text-brand-muted mt-1">PDF, Markdown ou Texto puro (máx. 10MB)</span>
                      <input
                        type="file"
                        accept=".pdf,.md,.markdown,.txt"
                        className="hidden"
                        onChange={e => handleFileChange(e.target.files?.[0] || null)}
                      />
                    </label>
                  </div>

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
                {isAdmin ? <Save className="w-3.5 h-3.5" /> : <Send className="w-3.5 h-3.5" />}
                <span>
                  {saving ? 'Processando...' : isAdmin ? (editingGuideline ? 'Salvar e Publicar' : 'Salvar Manual') : 'Submeter Proposta de Alteração'}
                </span>
              </Button>
            </div>
          </Card>
          </div>
        </div>,
        document.body
      )}

      {/* Modal: Verificação de Alteração pelo Administrador */}
      {reviewGuideline && createPortal(
        <div className="fixed inset-0 bg-black/75 backdrop-blur-xs flex items-center justify-center z-[9999] p-2 sm:p-4 md:p-6 animate-fade-in" onClick={() => setReviewGuideline(null)}>
          <div onClick={(e: React.MouseEvent) => e.stopPropagation()} className="w-full max-w-4xl">
            <Card className="p-6 space-y-4 max-h-[92vh] overflow-y-auto no-scrollbar shadow-2xl border border-surface-border">
              <div className="flex items-center justify-between pb-3 border-b border-surface-border">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-amber-500/15 text-amber-500 flex items-center justify-center flex-shrink-0">
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-brand-primary">
                      Verificação de Impacto na IA — {reviewGuideline.title}
                    </h3>
                    <p className="text-[11px] font-semibold text-brand-muted">
                      Proposta submetida por {reviewGuideline.pending_modified_by_name || 'Monitor de Qualidade'} ({reviewGuideline.pending_modified_by_role || 'qualidade'}) em {new Date(reviewGuideline.pending_modified_at || reviewGuideline.updated_at).toLocaleString('pt-BR')}
                    </p>
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setReviewGuideline(null)}><X className="w-4 h-4" /></Button>
              </div>

              <div className="p-3 rounded-xl bg-surface-subtle border border-surface-border text-xs text-brand-muted">
                💡 <strong className="text-brand-primary">Avaliação de Impacto:</strong> Ao aprovar, o novo conteúdo entrará em produção imediatamente e será consultado pela IA em todas as próximas avaliações. A versão anterior (v{reviewGuideline.version || 1}) será arquivada no histórico.
              </div>

              {/* Comparativo Lado a Lado */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black uppercase tracking-wider text-brand-primary">Versão Oficial Ativa (v{reviewGuideline.version || 1})</span>
                    <Badge variant="success" size="xs">Ativo na IA</Badge>
                  </div>
                  <div className="p-3 rounded-xl border border-surface-border bg-surface-subtle max-h-[340px] overflow-y-auto text-xs text-brand-muted">
                    <ReactMarkdown>{reviewGuideline.content}</ReactMarkdown>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black uppercase tracking-wider text-amber-600 dark:text-amber-400">Nova Proposta (v{(reviewGuideline.version || 1) + 1})</span>
                    <span className="text-[10px] font-bold text-amber-700 dark:text-amber-300 bg-amber-500/20 px-2 py-0.5 rounded-full">Aguardando Aprovação</span>
                  </div>
                  <div className="p-3 rounded-xl border border-amber-500/30 bg-amber-500/5 max-h-[340px] overflow-y-auto text-xs text-brand-primary">
                    <ReactMarkdown>{reviewGuideline.pending_content || ''}</ReactMarkdown>
                  </div>
                </div>
              </div>

              {/* Ações do Administrador */}
              <div className="flex items-center justify-between pt-3 border-t border-surface-border">
                <Button
                  variant="danger"
                  size="sm"
                  disabled={approving}
                  onClick={() => handleReject(reviewGuideline)}
                  className="flex items-center gap-1.5"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>Rejeitar Proposta</span>
                </Button>

                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setReviewGuideline(null)}>Cancelar</Button>
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={approving}
                    onClick={() => handleApprove(reviewGuideline)}
                    className="flex items-center gap-1.5 font-bold"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>{approving ? 'Aprovando...' : 'Aprovar e Ativar na IA'}</span>
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        </div>,
        document.body
      )}

      {/* Modal: Histórico de Versões e Auditoria */}
      {historyGuideline && createPortal(
        <div className="fixed inset-0 bg-black/75 backdrop-blur-xs flex items-center justify-center z-[9999] p-2 sm:p-4 md:p-6 animate-fade-in" onClick={() => setHistoryGuideline(null)}>
          <div onClick={(e: React.MouseEvent) => e.stopPropagation()} className="w-full max-w-3xl">
            <Card className="p-6 space-y-4 max-h-[92vh] overflow-y-auto no-scrollbar shadow-2xl border border-surface-border">
              <div className="flex items-center justify-between pb-3 border-b border-surface-border">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-brand-highlight/15 text-brand-highlight flex items-center justify-center flex-shrink-0">
                    <History className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-brand-primary">
                      Histórico de Versões — {historyGuideline.title}
                    </h3>
                    <p className="text-[11px] font-semibold text-brand-muted">
                      Rastreabilidade completa de todas as alterações normativas do manual
                    </p>
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setHistoryGuideline(null)}><X className="w-4 h-4" /></Button>
              </div>

              {/* Lista Cronológica de Versões */}
              <div className="space-y-3">
                {/* Versão Atual em Produção */}
                <div className="p-3.5 rounded-xl border border-brand-accent/40 bg-brand-accent/5 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-black text-brand-primary font-mono">v{historyGuideline.version || 1}</span>
                      <Badge variant="success" size="xs">Versão Atual em Produção</Badge>
                      <span className="text-[10px] text-brand-muted font-semibold">
                        Atualizado em {new Date(historyGuideline.updated_at).toLocaleString('pt-BR')}
                      </span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedHistoryVersion({
                        version: historyGuideline.version || 1,
                        title: historyGuideline.title,
                        content: historyGuideline.content,
                        created_at: historyGuideline.updated_at,
                        status: 'approved'
                      })}
                    >
                      Visualizar Texto
                    </Button>
                  </div>
                </div>

                {/* Histórico Gravado */}
                {Array.isArray(historyGuideline.history) && historyGuideline.history.length > 0 ? (
                  historyGuideline.history.map((h, idx) => (
                    <div key={idx} className="p-3.5 rounded-xl border border-surface-border bg-surface-subtle/60 space-y-2">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-black text-brand-primary font-mono">v{h.version}</span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                            h.status === 'approved'
                              ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30'
                              : h.status === 'pending_approval'
                              ? 'bg-amber-500/10 text-amber-600 border-amber-500/30'
                              : 'bg-rose-500/10 text-rose-600 border-rose-500/30'
                          }`}>
                            {h.status === 'approved' ? 'Aprovada' : h.status === 'pending_approval' ? 'Pendente' : 'Rejeitada'}
                          </span>
                          <span className="text-[11px] text-brand-muted">
                            {h.modified_by_name ? `Por ${h.modified_by_name}` : 'Revisão'} · {new Date(h.created_at).toLocaleString('pt-BR')}
                          </span>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedHistoryVersion(h)}
                        >
                          Visualizar Texto
                        </Button>
                      </div>
                      {h.rejection_reason && (
                        <p className="text-[10px] text-functional-error italic">
                          Motivo da rejeição: {h.rejection_reason}
                        </p>
                      )}
                    </div>
                  ))
                ) : (
                  <p className="text-center py-4 text-xs text-brand-muted italic">
                    Nenhuma versão anterior arquivada ainda. As próximas alterações serão registradas aqui automaticamente.
                  </p>
                )}
              </div>

              {/* Preview da Versão Selecionada no Histórico */}
              {selectedHistoryVersion && (
                <div className="mt-4 pt-4 border-t border-surface-border space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-brand-primary">
                      Conteúdo da Versão v{selectedHistoryVersion.version}
                    </span>
                    <Button variant="ghost" size="sm" onClick={() => setSelectedHistoryVersion(null)}>Fechar Preview</Button>
                  </div>
                  <div className={MARKDOWN_PREVIEW_CLASSES}>
                    <ReactMarkdown>{selectedHistoryVersion.content}</ReactMarkdown>
                  </div>
                </div>
              )}

              <div className="flex justify-end pt-3 border-t border-surface-border">
                <Button variant="outline" size="sm" onClick={() => setHistoryGuideline(null)}>Fechar</Button>
              </div>
            </Card>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
