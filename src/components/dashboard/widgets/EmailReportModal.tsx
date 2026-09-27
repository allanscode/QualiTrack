import React, { useState, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Mail,
  CheckCircle,
  Copy,
  ExternalLink,
  AlertTriangle,
  Info,
  Check,
  Send,
  Loader2,
} from 'lucide-react';
import { User } from '../../../types';
import Button from '../../ui/Button';
import Badge from '../../ui/Badge';
import { toast } from 'sonner';
import { useDialogAccessibility } from '../../../hooks/useDialogAccessibility';
import { useQualityConfig } from '../../../lib/useQualityConfig';
import { supabase, isMockMode } from '../../../lib/supabase';

interface EmailReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  teamTitle: string;
  periodLabel: string;
  kpiSummary: {
    avgScore: number;
    targetScore: number;
    totalAudits: number;
    criticalRate: number;
  };
  teamManager: User | null;
  users: User[];
  currentUser: User | null;
  reportNotes?: string;
}

const MAX_MAILTO_SAFE_LENGTH = 1900;

export default function EmailReportModal({
  isOpen,
  onClose,
  teamTitle,
  periodLabel,
  kpiSummary,
  teamManager,
  users,
  currentUser,
  reportNotes = '',
}: EmailReportModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const initialFocusRef = useRef<HTMLInputElement>(null);

  const { dialogProps } = useDialogAccessibility({
    isOpen,
    onClose,
    dialogRef,
    initialFocusRef,
    ariaLabelledBy: 'email-report-title',
    ariaDescribedBy: 'email-report-subtitle',
  });

  // Lista de gestores disponíveis para seleção rápida
  const managers = useMemo(() => {
    return users.filter(
      u => (['gestor_suporte', 'gestor_qualidade', 'admin'].includes(u.role) || u.id === teamManager?.id) && u.active
    );
  }, [users, teamManager]);

  const { config } = useQualityConfig();
  const canDispatchDirectly = ['admin', 'gestor_qualidade'].includes(currentUser?.role || '');

  const defaultSubject = useMemo(() => {
    const template = config.emailReportConfig?.subjectTemplate || '[Qualidade WP] Relatório Executivo de Qualidade · {{team}} ({{period}})';
    return template.replace('{{team}}', teamTitle).replace('{{period}}', periodLabel);
  }, [config.emailReportConfig?.subjectTemplate, teamTitle, periodLabel]);

  // Destinatários selecionados (por padrão inclui o gestor da equipe se houver)
  const [selectedRecipients, setSelectedRecipients] = useState<string[]>(() => {
    if (teamManager?.email) return [teamManager.email];
    return [];
  });

  const [additionalEmails, setAdditionalEmails] = useState('');
  const [subject, setSubject] = useState(defaultSubject);
  const [customMessage, setCustomMessage] = useState(
    `Prezados,\n\nSegue o Relatório Executivo Consolidado de Qualidade para alinhamento e acompanhamento dos indicadores operacionais da equipe ${teamTitle}.\n\nAtenciosamente,\n${currentUser?.name || 'Gestão da Qualidade'}`
  );
  const [copyToSelf, setCopyToSelf] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [directSending, setDirectSending] = useState(false);
  const [copiedSummary, setCopiedSummary] = useState(false);

  // Validação de formato de e-mail seguro (RFC sanitizado, prevenindo caracteres de controle)
  const isValidEmail = (email: string) => {
    return /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email.trim());
  };

  const handleToggleRecipient = (email: string) => {
    setSelectedRecipients(prev =>
      prev.includes(email) ? prev.filter(e => e !== email) : [...prev, email]
    );
  };

  const allRecipients = useMemo(() => {
    const list = [...selectedRecipients];
    if (additionalEmails.trim()) {
      const extras = additionalEmails
        .split(/[,;\r\n]+/)
        .map(e => e.trim())
        .filter(e => e.length > 0);
      list.push(...extras);
    }
    if (copyToSelf && currentUser?.email && !list.includes(currentUser.email)) {
      list.push(currentUser.email);
    }
    return Array.from(new Set(list));
  }, [selectedRecipients, additionalEmails, copyToSelf, currentUser]);

  const sanitizedSubject = useMemo(() => {
    return subject.replace(/[\r\n]+/g, ' ').trim();
  }, [subject]);

  const generatedBodyText = useMemo(() => {
    return (
      `${customMessage}\n\n` +
      `--- RESUMO DE INDICADORES ---\n` +
      `• Equipe: ${teamTitle}\n` +
      `• Período: ${periodLabel}\n` +
      `• Média de Qualidade: ${kpiSummary.avgScore}% (Meta: ${kpiSummary.targetScore}%)\n` +
      `• Amostra Auditada: ${kpiSummary.totalAudits} atendimentos\n` +
      `• Índice de Erros Críticos: ${kpiSummary.criticalRate}%\n` +
      (reportNotes ? `\n• Parecer da Gestão:\n"${reportNotes}"\n` : '') +
      `\n\nRelatório gerado via Qualidade WP • Sistema Integrado de Gestão da Qualidade`
    );
  }, [customMessage, teamTitle, periodLabel, kpiSummary, reportNotes]);

  const fullSummaryForClipboard = useMemo(() => {
    const toLine = allRecipients.length > 0 ? `Para: ${allRecipients.join(', ')}\n` : '';
    return `${toLine}Assunto: ${sanitizedSubject}\n\n${generatedBodyText}`;
  }, [allRecipients, sanitizedSubject, generatedBodyText]);

  const mailtoUrl = useMemo(() => {
    const recipientsString = allRecipients.map(e => encodeURIComponent(e.trim())).join(',');
    return `mailto:${recipientsString}?subject=${encodeURIComponent(sanitizedSubject)}&body=${encodeURIComponent(generatedBodyText)}`;
  }, [allRecipients, sanitizedSubject, generatedBodyText]);

  const isMailtoTooLong = mailtoUrl.length > MAX_MAILTO_SAFE_LENGTH;

  const handleCopySummary = async () => {
    try {
      await navigator.clipboard.writeText(fullSummaryForClipboard);
      setCopiedSummary(true);
      toast.success('Resumo completo copiado para a área de transferência! Cole no seu cliente de e-mail.');
      setTimeout(() => setCopiedSummary(false), 3000);
    } catch {
      toast.error('Não foi possível copiar o texto automaticamente. Selecione e copie manualmente.');
    }
  };

  const handleSendDirectEmail = async () => {
    if (directSending || processing) return;

    if (allRecipients.length === 0) {
      toast.error('Selecione ou insira ao menos um destinatário para o envio.');
      return;
    }

    const invalid = allRecipients.filter(email => !isValidEmail(email));
    if (invalid.length > 0) {
      toast.error(`E-mail(s) com formato inválido: ${invalid.join(', ')}`);
      return;
    }

    setDirectSending(true);
    try {
      if (isMockMode || !supabase) {
        await new Promise(r => setTimeout(r, 600));
        toast.success(`[Simulação] Relatório executivo enviado com sucesso para ${allRecipients.length} destinatário(s)!`);
        onClose();
        return;
      }

      const { data, error } = await supabase.functions.invoke('send-email', {
        body: {
          type: 'executive_report',
          recipients: allRecipients,
          subject: sanitizedSubject,
          teamTitle,
          periodLabel,
          customMessage,
          kpiSummary,
          reportNotes,
          senderName: config.emailReportConfig?.senderName || 'Qualidade WP - Gestão da Qualidade',
        }
      });

      if (error || !data?.success) {
        throw new Error(data?.error || error?.message || 'Falha ao disparar relatório por e-mail.');
      }

      toast.success(`Relatório executivo disparado com sucesso para ${allRecipients.length} destinatário(s)!`);
      onClose();
    } catch (err: any) {
      console.error('[EmailReportModal] Erro ao disparar e-mail:', err);
      toast.error(err.message || 'Erro ao disparar e-mail pelo sistema.');
    } finally {
      setDirectSending(false);
    }
  };

  const handleOpenEmailClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (processing) return;

    if (allRecipients.length === 0) {
      toast.error('Selecione ou insira ao menos um destinatário para preparar o e-mail.');
      return;
    }

    const invalid = allRecipients.filter(email => !isValidEmail(email));
    if (invalid.length > 0) {
      toast.error(`E-mail(s) com formato inválido: ${invalid.join(', ')}`);
      return;
    }

    setProcessing(true);

    try {
      if (isMailtoTooLong) {
        // Fallback proativo: copia para clipboard e alerta sobre tamanho
        try {
          await navigator.clipboard.writeText(fullSummaryForClipboard);
          toast.warning(
            `O texto atingiu ${mailtoUrl.length} caracteres (limite recomendado: ${MAX_MAILTO_SAFE_LENGTH}). O resumo foi copiado para sua área de transferência para evitar truncamento no cliente de e-mail.`,
            { duration: 7000 }
          );
        } catch {
          // Continua para tentar abrir mailto mesmo assim
        }
      } else {
        toast.info(
          'Abrindo seu aplicativo de e-mail padrão (Outlook, Thunderbird, etc.) com o rascunho preenchido. Lembre-se de revisar antes do envio final.'
        );
      }

      // Dispara abertura no cliente local do usuário
      window.location.href = mailtoUrl;

      // Fecha o modal após disparar a abertura do aplicativo
      setTimeout(() => {
        onClose();
      }, 500);
    } catch {
      toast.error('Não foi possível acionar o cliente de e-mail local.');
    } finally {
      setProcessing(false);
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center p-3 sm:p-6 bg-black/60 backdrop-blur-sm animate-fade-in overflow-y-auto"
      onClick={e => {
        if (e.target === e.currentTarget && !processing) {
          onClose();
        }
      }}
    >
      <div
        ref={dialogRef}
        {...dialogProps}
        className="relative w-full max-w-xl bg-surface-bg border border-surface-border rounded-2xl shadow-2xl overflow-hidden my-auto flex flex-col max-h-[90vh] focus:outline-none"
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-surface-border flex items-center justify-between bg-surface-card flex-shrink-0 gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
              <Mail className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2
                id="email-report-title"
                className="text-sm font-black text-brand-primary uppercase tracking-wider truncate"
              >
                Preparar E-mail do Relatório
              </h2>
              <p
                id="email-report-subtitle"
                className="text-xs text-brand-muted font-medium truncate"
              >
                Gere o rascunho com o resumo dos indicadores para envio via seu aplicativo de e-mail
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={processing}
            className="p-2.5 rounded-xl text-brand-muted hover:text-brand-primary hover:bg-surface-subtle transition-colors cursor-pointer shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent disabled:opacity-50"
            aria-label="Fechar janela de preparação de e-mail"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Formulário com Scroll */}
        <form onSubmit={handleOpenEmailClient} className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 text-xs font-medium text-brand-primary">
          {/* Card de Resumo Textual dos Indicadores */}
          <div className="p-3.5 rounded-xl border border-surface-border bg-surface-card flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <span className="text-[10px] uppercase font-bold text-brand-muted block">Resumo Textual Incluído</span>
              <p className="text-xs font-bold text-brand-primary truncate">{teamTitle} — {periodLabel}</p>
              <div className="flex items-center gap-2 mt-0.5 text-[10px] text-brand-muted flex-wrap">
                <span>Nota Média: <strong>{kpiSummary.avgScore}%</strong></span>
                <span>•</span>
                <span>Amostra: <strong>{kpiSummary.totalAudits} auditorias</strong></span>
                <span>•</span>
                <span>Erros Críticos: <strong>{kpiSummary.criticalRate}%</strong></span>
              </div>
            </div>
            <Badge variant={kpiSummary.avgScore >= kpiSummary.targetScore ? 'success' : 'warning'} size="sm" className="self-start sm:self-center shrink-0">
              {kpiSummary.avgScore >= kpiSummary.targetScore ? 'Na Meta' : 'Abaixo da Meta'}
            </Badge>
          </div>

          {/* Nota Transparente sobre Anexo PDF */}
          <div className="p-3 rounded-xl bg-surface-subtle/50 border border-surface-border flex items-start gap-2.5 text-[11px] text-brand-muted">
            <Info className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
            <p className="leading-relaxed">
              <strong>Nota sobre anexos:</strong> O aplicativo prepara o texto formatado no seu cliente de e-mail. Para anexar o documento visual completo em PDF, gere o PDF pelo botão &ldquo;Salvar PDF&rdquo; do relatório executivo e anexe-o ao rascunho.
            </p>
          </div>

          {/* Seleção de Destinatários Gestores */}
          <div>
            <label className="block text-[10px] font-black uppercase tracking-wider text-brand-muted mb-1.5 flex items-center justify-between">
              <span>Destinatários Sugeridos (Liderança)</span>
              <span className="text-brand-accent">{selectedRecipients.length} selecionado(s)</span>
            </label>
            <div
              role="group"
              aria-label="Destinatários sugeridos da liderança"
              className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-36 overflow-y-auto p-1.5 bg-surface-card rounded-xl border border-surface-border custom-scrollbar"
            >
              {managers.map(m => {
                const isSelected = selectedRecipients.includes(m.email);
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => handleToggleRecipient(m.email)}
                    aria-pressed={isSelected}
                    aria-label={`Selecionar destinatário ${m.name} (${m.email})`}
                    className={`p-2 rounded-lg border text-left flex items-center justify-between gap-2 transition-all cursor-pointer min-h-[44px] ${
                      isSelected
                        ? 'border-brand-accent bg-brand-accent/10 text-brand-primary'
                        : 'border-surface-border/60 hover:bg-surface-subtle text-brand-muted'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold truncate text-brand-primary">{m.name}</p>
                      <p className="text-[10px] text-brand-muted truncate">{m.email}</p>
                    </div>
                    {isSelected && <CheckCircle className="w-3.5 h-3.5 text-brand-accent flex-shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* E-mails Adicionais */}
          <div>
            <label
              htmlFor="email-report-additional-emails"
              className="block text-[10px] font-black uppercase tracking-wider text-brand-muted mb-1.5"
            >
              Outros E-mails (opcional, separados por vírgula ou ponto-e-vírgula)
            </label>
            <input
              id="email-report-additional-emails"
              type="text"
              value={additionalEmails}
              onChange={e => setAdditionalEmails(e.target.value)}
              placeholder="diretoria@empresa.com, coordenacao@empresa.com"
              className="w-full bg-surface-card border border-surface-border rounded-xl px-3 py-2.5 text-base sm:text-xs text-brand-primary placeholder:text-brand-muted focus:outline-none focus:border-brand-accent font-semibold min-h-[44px] sm:min-h-0"
            />
          </div>

          {/* Assunto */}
          <div>
            <label
              htmlFor="email-report-subject"
              className="block text-[10px] font-black uppercase tracking-wider text-brand-muted mb-1.5"
            >
              Assunto do E-mail *
            </label>
            <input
              id="email-report-subject"
              ref={initialFocusRef}
              type="text"
              required
              value={subject}
              onChange={e => setSubject(e.target.value)}
              className="w-full bg-surface-card border border-surface-border rounded-xl px-3 py-2.5 text-base sm:text-xs text-brand-primary focus:outline-none focus:border-brand-accent font-semibold min-h-[44px] sm:min-h-0"
            />
          </div>

          {/* Mensagem / Corpo */}
          <div>
            <label
              htmlFor="email-report-message"
              className="block text-[10px] font-black uppercase tracking-wider text-brand-muted mb-1.5"
            >
              Mensagem de Acompanhamento (Parecer da Gestão) *
            </label>
            <textarea
              id="email-report-message"
              required
              rows={4}
              value={customMessage}
              onChange={e => setCustomMessage(e.target.value)}
              className="w-full bg-surface-card border border-surface-border rounded-xl p-3 text-base sm:text-xs text-brand-primary focus:outline-none focus:border-brand-accent resize-none font-medium leading-relaxed"
            />
          </div>

          {/* Opção CC */}
          <div className="flex items-center gap-2.5">
            <input
              type="checkbox"
              id="email-report-copy-to-self"
              checked={copyToSelf}
              onChange={e => setCopyToSelf(e.target.checked)}
              className="w-4 h-4 rounded border-surface-border text-brand-accent focus:ring-0 cursor-pointer"
            />
            <label
              htmlFor="email-report-copy-to-self"
              className="text-xs text-brand-muted cursor-pointer font-medium"
            >
              Enviar uma cópia (CC) para meu e-mail ({currentUser?.email || 'meu endereço'})
            </label>
          </div>

          {/* Alerta de Tamanho de URL Mailto */}
          {isMailtoTooLong && (
            <div
              role="status"
              className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-start gap-2.5 text-xs text-amber-800 dark:text-amber-300"
            >
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
              <div className="leading-relaxed">
                <span className="font-bold">Aviso sobre o tamanho do link:</span> O conteúdo formatado atingiu {mailtoUrl.length} caracteres (o limite recomendado para links mailto é de aprox. {MAX_MAILTO_SAFE_LENGTH} caracteres). Recomendamos clicar em <strong>&ldquo;Copiar Resumo&rdquo;</strong> para colar o texto integral diretamente no seu cliente de e-mail sem risco de corte.
              </div>
            </div>
          )}

          {/* Rodapé / Botões */}
          <div className="pt-4 border-t border-surface-border flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 flex-shrink-0">
            <span className="text-[11px] text-brand-muted text-center sm:text-left">
              Total: <strong>{allRecipients.length}</strong> destinatário(s)
            </span>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <button
                type="button"
                onClick={handleCopySummary}
                className="px-3.5 py-2 text-xs font-bold rounded-xl border border-surface-border hover:bg-surface-subtle text-brand-primary transition-colors cursor-pointer flex items-center justify-center gap-1.5 min-h-[44px] sm:min-h-0"
                aria-label="Copiar resumo textual para área de transferência"
              >
                {copiedSummary ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-500" />
                    <span className="text-emerald-600 dark:text-emerald-400">Copiado!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-brand-muted" />
                    <span>Copiar</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={onClose}
                disabled={processing || directSending}
                className="px-3 py-2 text-xs font-bold text-brand-muted hover:text-brand-primary rounded-xl hover:bg-surface-subtle transition-colors cursor-pointer min-h-[44px] sm:min-h-0 disabled:opacity-50"
              >
                Cancelar
              </button>

              <button
                type="submit"
                disabled={processing || directSending || allRecipients.length === 0}
                className="px-3 py-2 text-xs font-bold rounded-xl border border-surface-border hover:bg-surface-subtle text-brand-muted hover:text-brand-primary transition-colors cursor-pointer flex items-center justify-center gap-1.5 min-h-[44px] sm:min-h-0"
                title="Abrir no cliente de e-mail local (Outlook, Thunderbird, etc.)"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>{processing ? 'Abrindo...' : 'App Local'}</span>
              </button>

              {canDispatchDirectly && (
                <Button
                  type="button"
                  variant="primary"
                  onClick={handleSendDirectEmail}
                  disabled={directSending || processing || allRecipients.length === 0}
                  className="px-4 py-2 text-xs font-bold flex items-center justify-center gap-1.5 min-h-[44px] sm:min-h-0 bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-500/20"
                >
                  {directSending ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Disparando...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-3.5 h-3.5" />
                      <span>Disparar pelo Sistema</span>
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
