import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  X,
  CheckCircle2,
  XCircle,
  Loader2,
  AlertTriangle,
  RotateCcw,
  Send
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase, isMockMode, requireAccessToken } from '../lib/supabase';
import { EvaluationOutcome, HelpdeskSubmission, PublishResult } from '../types';
import { getLatestHelpdeskSubmission, publishEvaluationToHelpdesk } from '../lib/helpdesk';
import Card from './ui/Card';
import Button from './ui/Button';

interface HelpdeskSendModalProps {
  monitoriaId: string;
  ticketId: string;
  suggestedOutcome: EvaluationOutcome;
  onClose: () => void;
  // true quando o modal abriu automaticamente logo após concluir a
  // monitoria (fluxo novo). Nesse caso a monitoria já está salva no banco
  // antes mesmo do modal aparecer, então os textos de saída precisam deixar
  // claro que fechar sem enviar não perde o trabalho — só deixa o envio
  // pendente. Quando false (abertura manual pelo botão "Enviar ao
  // Zendesk"), mantém os textos originais.
  fromConclusion?: boolean;
}

type PreviewState =
  | { status: 'loading' }
  | { status: 'ready'; html: string }
  | { status: 'error'; message: string };

type SendState =
  | { status: 'idle' }
  | { status: 'sending' }
  | { status: 'sent'; externalCommentId?: string }
  | { status: 'error'; message: string };

const OUTCOME_OPTIONS: { value: EvaluationOutcome; label: string; icon: typeof CheckCircle2 }[] = [
  { value: 'positiva', label: 'Ticket Válido', icon: CheckCircle2 },
  { value: 'negativa', label: 'Ticket Invalidado', icon: XCircle },
];

export default function HelpdeskSendModal({ monitoriaId, ticketId, suggestedOutcome, onClose, fromConclusion = false }: HelpdeskSendModalProps) {
  const [outcome, setOutcome] = useState<EvaluationOutcome>(suggestedOutcome);
  const [preview, setPreview] = useState<PreviewState>({ status: 'loading' });
  const [sendState, setSendState] = useState<SendState>({ status: 'idle' });

  // Histórico de envios já bem-sucedidos para esta monitoria. Um segundo
  // envio posta um SEGUNDO comentário no ticket real do cliente, então
  // avisamos e exigimos confirmação explícita antes de deixar reenviar.
  const [previousSubmission, setPreviousSubmission] = useState<HelpdeskSubmission | null>(null);
  const [checkingHistory, setCheckingHistory] = useState(true);
  const [acknowledgedResend, setAcknowledgedResend] = useState(false);

  // Evita que uma resposta de preview atrasada (troca rápida de radio)
  // sobrescreva o preview de uma seleção mais recente.
  const requestSeq = useRef(0);

  const fetchPreview = useCallback(async (chosenOutcome: EvaluationOutcome) => {
    const seq = ++requestSeq.current;
    setPreview({ status: 'loading' });

    if (isMockMode || !supabase) {
      // Mock mode: preview estático instantâneo
      setPreview({
        status: 'ready',
        html: `<div style="font-family:sans-serif;padding:12px;border:1px solid #e5e7eb;border-radius:8px;"><strong>Parecer da Qualidade (Demonstração)</strong><p>Resultado: <strong>${chosenOutcome === 'positiva' ? 'Ticket Válido' : 'Ticket Invalidado'}</strong></p></div>`
      });
      return;
    }

    try {
      const accessToken = await requireAccessToken();
      const { data, error } = await supabase.functions.invoke('helpdesk-publish-evaluation', {
        headers: { Authorization: `Bearer ${accessToken}` },
        body: { monitoria_id: monitoriaId, outcome: chosenOutcome, dry_run: true }
      });
      if (error) throw error;

      const result = data as PublishResult;
      if (seq !== requestSeq.current) return;

      if (result.success && 'preview_html' in result) {
        setPreview({ status: 'ready', html: result.preview_html });
      } else {
        setPreview({ status: 'error', message: (result as any)?.error || 'Falha ao gerar o preview.' });
      }
    } catch (e: any) {
      if (seq !== requestSeq.current) return;
      setPreview({ status: 'error', message: e?.message || 'Falha ao carregar o preview do comentário.' });
    }
  }, [monitoriaId]);

  // Carrega o histórico de envios (para o aviso de reenvio) e o preview
  // inicial assim que o modal abre.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setCheckingHistory(true);
      try {
        const latest = await getLatestHelpdeskSubmission(monitoriaId);
        if (!cancelled) setPreviousSubmission(latest);
      } catch (e) {
        console.error('[HelpdeskSendModal] Falha ao checar envios anteriores:', e);
      } finally {
        if (!cancelled) setCheckingHistory(false);
      }
    })();
    return () => { cancelled = true; };
  }, [monitoriaId]);

  useEffect(() => {
    fetchPreview(outcome);
  }, [outcome, fetchPreview]);

  const handleConfirm = async () => {
    if (sendState.status === 'sending' || sendState.status === 'sent') return; // trava contra duplo clique
    if (previousSubmission && !acknowledgedResend) {
      toast.warning('Confirme que deseja reenviar antes de continuar.');
      return;
    }
    if (isMockMode || !supabase) {
      toast.error('Envio ao Zendesk indisponível no modo de demonstração.');
      return;
    }

    setSendState({ status: 'sending' });
    try {
      const result = await publishEvaluationToHelpdesk(monitoriaId, { outcome, force: true });
      if (!result?.success) {
        setSendState({ status: 'error', message: result?.error || 'Falha ao enviar ao Zendesk.' });
        return;
      }
      setSendState({ status: 'sent', externalCommentId: result.external_comment_id });
      toast.success('Comentário enviado ao Zendesk com sucesso!');
    } catch (e: any) {
      setSendState({ status: 'error', message: e?.message || 'Falha ao enviar ao Zendesk. Tente novamente.' });
    }
  };

  const isSending = sendState.status === 'sending';
  const isSent = sendState.status === 'sent';
  const radiosDisabled = isSending || isSent;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <Card className="max-w-lg w-full max-h-[90vh] flex flex-col" padding="lg">
        <header className="flex items-center justify-between mb-6 flex-shrink-0">
          <div>
            <h3 className="text-xl font-black text-brand-primary tracking-tight uppercase">Enviar ao Zendesk</h3>
            <p className="text-[10px] font-bold text-brand-muted uppercase tracking-widest mt-1">Ticket #{ticketId}</p>
            {fromConclusion && (
              <p className="text-[10px] font-bold text-success uppercase tracking-widest mt-1">
                Monitoria salva ✓ — o envio abaixo é opcional agora
              </p>
            )}
          </div>
          <button onClick={onClose} className="text-brand-muted hover:text-brand-primary transition-colors">
            <X className="w-6 h-6" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto space-y-5 no-scrollbar">
          {!checkingHistory && previousSubmission && !isSent && (
            <div className="flex items-start gap-3 bg-warning/10 border border-warning/30 rounded-xl p-4">
              <AlertTriangle className="w-5 h-5 text-warning flex-shrink-0 mt-0.5" />
              <div className="flex-1 space-y-2">
                <p className="text-xs font-bold text-brand-primary leading-relaxed">
                  Esta monitoria já foi enviada com sucesso ao Zendesk em{' '}
                  {new Date(previousSubmission.created_at).toLocaleString('pt-BR')}.
                  Enviar novamente posta um <strong>segundo comentário</strong> no ticket real do cliente.
                </p>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={acknowledgedResend}
                    onChange={e => setAcknowledgedResend(e.target.checked)}
                    className="w-4 h-4 rounded text-warning focus:ring-warning"
                    disabled={radiosDisabled}
                  />
                  <span className="text-[11px] font-bold text-brand-primary uppercase tracking-wide">Entendo, quero enviar mesmo assim</span>
                </label>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-label="Resultado da avaliação">
            {OUTCOME_OPTIONS.map(opt => {
              const Icon = opt.icon;
              const checked = outcome === opt.value;
              return (
                <label
                  key={opt.value}
                  className={`flex items-center gap-2.5 py-3 px-4 rounded-xl border transition-all cursor-pointer ${
                    checked
                      ? 'bg-brand-primary border-brand-primary text-brand-on-primary shadow-premium-sm'
                      : 'bg-surface-card border-surface-border text-brand-muted hover:border-brand-accent hover:text-brand-primary'
                  } ${radiosDisabled ? 'opacity-60 cursor-not-allowed' : ''}`}
                >
                  <input
                    type="radio"
                    name="helpdesk-outcome"
                    value={opt.value}
                    checked={checked}
                    disabled={radiosDisabled}
                    onChange={() => setOutcome(opt.value)}
                    className="sr-only"
                  />
                  <Icon className="w-4 h-4 flex-shrink-0" />
                  <span className="text-[11px] font-black uppercase tracking-wider">{opt.label}</span>
                </label>
              );
            })}
          </div>

          <div className="space-y-2">
            <p className="text-[10px] font-black uppercase text-brand-muted tracking-widest ml-1">Preview do comentário</p>

            {preview.status === 'loading' && (
              <div className="flex items-center justify-center gap-2 py-10 border border-surface-border rounded-xl bg-surface-subtle">
                <Loader2 className="w-4 h-4 animate-spin text-brand-muted" />
                <span className="text-xs font-bold text-brand-muted uppercase tracking-wider">Gerando preview...</span>
              </div>
            )}

            {preview.status === 'error' && (
              <div className="flex flex-col items-center gap-3 py-8 border border-error/30 rounded-xl bg-error/5 px-4">
                <p className="text-xs font-bold text-error text-center">{preview.message}</p>
                <Button variant="outline" size="sm" onClick={() => fetchPreview(outcome)} icon={<RotateCcw className="w-3.5 h-3.5" />}>
                  Tentar novamente
                </Button>
              </div>
            )}

            {preview.status === 'ready' && (
              // O HTML vem inteiramente do servidor (Edge Function), montado a
              // partir de um template fixo com os campos do usuário já
              // escapados — não é conteúdo arbitrário digitado pelo usuário
              // deste browser. Precisa ser renderizado como HTML para o
              // auditor conferir exatamente como o comentário vai aparecer no
              // ticket. O container abaixo controla overflow para não
              // estourar o layout do modal.
              <div
                className="border border-surface-border rounded-xl bg-white text-slate-900 p-4 max-h-64 overflow-y-auto text-xs leading-relaxed [&_p]:mb-2"
                dangerouslySetInnerHTML={{ __html: preview.html }}
              />
            )}
          </div>

          {sendState.status === 'sent' && (
            <div className="flex items-center gap-3 bg-success/10 border border-success/30 rounded-xl p-4">
              <CheckCircle2 className="w-5 h-5 text-success flex-shrink-0" />
              <p className="text-xs font-bold text-success uppercase tracking-wide">Enviado com sucesso ao Zendesk ✓</p>
            </div>
          )}

          {sendState.status === 'error' && (
            <div className="flex items-start gap-3 bg-error/10 border border-error/30 rounded-xl p-4">
              <XCircle className="w-5 h-5 text-error flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-bold text-error uppercase tracking-wide">Falha ao enviar</p>
                <p className="text-[11px] font-medium text-brand-primary mt-1">{sendState.message}</p>
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-3 mt-6 flex-shrink-0">
          {isSent ? (
            <button
              type="button"
              onClick={onClose}
              className="action-primary w-full inline-flex items-center justify-center gap-2 px-5 py-2.5 text-xs font-bold uppercase tracking-wider rounded-lg transition-all duration-200 active:scale-[0.98]"
            >
              Fechar
            </button>
          ) : (
            <>
              <Button variant="outline" className="flex-1" onClick={onClose} disabled={isSending}>
                {fromConclusion ? 'Deixar pendente' : 'Cancelar'}
              </Button>
              {/* Botão de ação primária usa a classe .action-primary (index.css)
                  diretamente, e não a variante "primary" do componente Button
                  — essa variante aplica bg-brand-primary, que inverte no tema
                  escuro e vira um bloco branco (bug já corrigido; não misturar
                  as duas para não reintroduzi-lo). */}
              <button
                type="button"
                onClick={handleConfirm}
                disabled={isSending || preview.status !== 'ready' || (!!previousSubmission && !acknowledgedResend)}
                className="action-primary group flex-1 inline-flex items-center justify-center gap-2 px-5 py-2.5 text-xs font-bold uppercase tracking-wider rounded-lg transition-all duration-200 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4 transition-transform duration-200 group-hover:scale-110" />}
                {isSending ? 'Enviando...' : sendState.status === 'error' ? 'Retentar' : 'Confirmar Envio'}
              </button>
            </>
          )}
        </div>
      </Card>
    </div>
  );
}
