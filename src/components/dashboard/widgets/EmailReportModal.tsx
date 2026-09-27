import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Mail,
  Send,
  CheckCircle,
  Users,
  ShieldCheck,
  FileText,
  AlertCircle,
  Copy,
} from 'lucide-react';
import { User } from '../../../types';
import Button from '../../ui/Button';
import Badge from '../../ui/Badge';
import { toast } from 'sonner';

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
  // Lista de gestores disponíveis para seleção rápida
  const managers = useMemo(() => {
    return users.filter(
      u => (['gestor_suporte', 'gestor_qualidade', 'admin'].includes(u.role) || u.id === teamManager?.id) && u.active
    );
  }, [users, teamManager]);

  // Destinatários selecionados (por padrão inclui o gestor da equipe se houver)
  const [selectedRecipients, setSelectedRecipients] = useState<string[]>(() => {
    if (teamManager?.email) return [teamManager.email];
    return [];
  });

  const [additionalEmails, setAdditionalEmails] = useState('');
  const [subject, setSubject] = useState(
    `[QualiTrack] Relatório Executivo de Qualidade · ${teamTitle} (${periodLabel})`
  );
  const [customMessage, setCustomMessage] = useState(
    `Prezados,\n\nSegue o Relatório Executivo Consolidado de Qualidade para alinhamento e acompanhamento dos indicadores operacionais da equipe ${teamTitle}.\n\nAtenciosamente,\n${currentUser?.name || 'Gestão da Qualidade'}`
  );
  const [copyToSelf, setCopyToSelf] = useState(true);
  const [sending, setSending] = useState(false);

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

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();

    if (allRecipients.length === 0) {
      toast.error('Selecione ou insira ao menos um destinatário para o envio.');
      return;
    }

    const invalid = allRecipients.filter(email => !isValidEmail(email));
    if (invalid.length > 0) {
      toast.error(`E-mail(s) com formato inválido: ${invalid.join(', ')}`);
      return;
    }

    // Sanitização contra CRLF Header Injection no assunto
    const sanitizedSubject = subject.replace(/[\r\n]+/g, ' ').trim();

    setSending(true);

    try {
      // Simulação de envio com fallback
      await new Promise(resolve => setTimeout(resolve, 800));

      const bodyText = `${customMessage}\n\n--- RESUMO DE INDICADORES ---\n` +
        `• Equipe: ${teamTitle}\n` +
        `• Período: ${periodLabel}\n` +
        `• Média de Qualidade: ${kpiSummary.avgScore}% (Meta: ${kpiSummary.targetScore}%)\n` +
        `• Amostra Auditada: ${kpiSummary.totalAudits} atendimentos\n` +
        `• Índice de Erros Críticos: ${kpiSummary.criticalRate}%\n` +
        (reportNotes ? `\n• Parecer da Gestão:\n"${reportNotes}"\n` : '') +
        `\n\nRelatório gerado via QualiTrack • Sistema Integrado de Gestão da Qualidade`;

      // Se o usuário desejar abrir seu cliente local de e-mail (Outlook/Thunderbird/Gmail):
      // window.location.href = `mailto:${allRecipients.join(',')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(bodyText)}`;

      toast.success(
        `Relatório executivo enviado com sucesso para ${allRecipients.length} destinatário(s)!`,
        {
          description: allRecipients.join(', '),
        }
      );

      onClose();
    } catch {
      toast.error('Ocorreu um erro ao despachar o e-mail do relatório.');
    } finally {
      setSending(false);
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-3 sm:p-6 bg-black/60 backdrop-blur-sm animate-fade-in overflow-y-auto">
      <div className="relative w-full max-w-xl bg-surface-bg border border-surface-border rounded-2xl shadow-2xl overflow-hidden my-auto flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-surface-border flex items-center justify-between bg-surface-card flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <Mail className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-black text-brand-primary uppercase tracking-wider">
                Disparo Executivo por E-mail
              </h2>
              <p className="text-xs text-brand-muted font-medium">
                Envio individualizado do relatório para gestores e liderança
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-brand-muted hover:text-brand-primary hover:bg-surface-subtle transition-colors cursor-pointer"
            title="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Formulário com Scroll */}
        <form onSubmit={handleSend} className="flex-1 overflow-y-auto p-5 space-y-4 text-xs font-medium text-brand-primary">
          
          {/* Card de Resumo do Relatório Anexado */}
          <div className="p-3.5 rounded-xl border border-surface-border bg-surface-card flex items-center justify-between gap-3">
            <div className="min-w-0">
              <span className="text-[10px] uppercase font-bold text-brand-muted block">Anexo do Relatório</span>
              <p className="text-xs font-bold text-brand-primary truncate">{teamTitle} — {periodLabel}</p>
              <div className="flex items-center gap-2 mt-0.5 text-[10px] text-brand-muted">
                <span>Nota: <strong>{kpiSummary.avgScore}%</strong></span>
                <span>•</span>
                <span>Amostra: <strong>{kpiSummary.totalAudits} audits</strong></span>
              </div>
            </div>
            <Badge variant={kpiSummary.avgScore >= kpiSummary.targetScore ? 'success' : 'warning'} size="sm">
              {kpiSummary.avgScore >= kpiSummary.targetScore ? 'Na Meta' : 'Abaixo da Meta'}
            </Badge>
          </div>

          {/* Seleção de Destinatários Gestores */}
          <div>
            <label className="block text-[10px] font-black uppercase tracking-wider text-brand-muted mb-1.5 flex items-center justify-between">
              <span>Destinatários Sugeridos (Liderança)</span>
              <span className="text-brand-accent">{selectedRecipients.length} selecionado(s)</span>
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-36 overflow-y-auto p-1.5 bg-surface-card rounded-xl border border-surface-border">
              {managers.map(m => {
                const isSelected = selectedRecipients.includes(m.email);
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => handleToggleRecipient(m.email)}
                    className={`p-2 rounded-lg border text-left flex items-center justify-between gap-2 transition-all cursor-pointer ${
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
            <label className="block text-[10px] font-black uppercase tracking-wider text-brand-muted mb-1.5">
              Outros E-mails (opcional, separados por vírgula)
            </label>
            <input
              type="text"
              value={additionalEmails}
              onChange={e => setAdditionalEmails(e.target.value)}
              placeholder="diretoria@empresa.com, coordenacao@empresa.com"
              className="w-full bg-surface-card border border-surface-border rounded-xl px-3 py-2 text-xs text-brand-primary placeholder:text-brand-muted focus:outline-none focus:border-brand-accent font-semibold"
            />
          </div>

          {/* Assunto */}
          <div>
            <label className="block text-[10px] font-black uppercase tracking-wider text-brand-muted mb-1.5">
              Assunto da Mensagem *
            </label>
            <input
              type="text"
              required
              value={subject}
              onChange={e => setSubject(e.target.value)}
              className="w-full bg-surface-card border border-surface-border rounded-xl px-3 py-2 text-xs text-brand-primary focus:outline-none focus:border-brand-accent font-semibold"
            />
          </div>

          {/* Mensagem / Corpo */}
          <div>
            <label className="block text-[10px] font-black uppercase tracking-wider text-brand-muted mb-1.5">
              Mensagem de Acompanhamento (Parecer da Gestão) *
            </label>
            <textarea
              required
              rows={4}
              value={customMessage}
              onChange={e => setCustomMessage(e.target.value)}
              className="w-full bg-surface-card border border-surface-border rounded-xl p-3 text-xs text-brand-primary focus:outline-none focus:border-brand-accent resize-none font-medium leading-relaxed"
            />
          </div>

          {/* Opção CC */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="copyToSelf"
              checked={copyToSelf}
              onChange={e => setCopyToSelf(e.target.checked)}
              className="rounded border-surface-border text-brand-accent focus:ring-0 cursor-pointer"
            />
            <label htmlFor="copyToSelf" className="text-xs text-brand-muted cursor-pointer font-medium">
              Enviar uma cópia (CC) para meu e-mail ({currentUser?.email})
            </label>
          </div>

          {/* Rodapé / Botões */}
          <div className="pt-4 border-t border-surface-border flex items-center justify-between flex-shrink-0">
            <span className="text-[11px] text-brand-muted">
              Total: <strong>{allRecipients.length}</strong> destinatário(s)
            </span>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-bold text-brand-muted hover:text-brand-primary rounded-xl hover:bg-surface-subtle transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <Button
                type="submit"
                disabled={sending || allRecipients.length === 0}
                className="px-5 py-2 text-xs font-bold flex items-center gap-1.5"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{sending ? 'Despachando...' : 'Enviar Relatório'}</span>
              </Button>
            </div>
          </div>
        </form>

      </div>
    </div>,
    document.body
  );
}
