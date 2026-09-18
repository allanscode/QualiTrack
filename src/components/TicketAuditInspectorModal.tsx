import React, { useState, useEffect, useMemo } from 'react';
import {
  AuditingQueueTicket,
  EvaluationForm,
  TicketCommentMessage,
  AIEvaluationResult
} from '../types';
import { fetchTicketDialogue } from '../lib/helpdeskQueue';
import { computeTicketTimeline, formatDurationMs } from '../lib/ticketAnalytics';
import { AIEvaluationDraft } from '../lib/aiDrafts';
import {
  X,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Bot,
  User as UserIcon,
  Sparkles,
  ExternalLink,
  ShieldCheck,
  Tag,
  FileText,
  MessageSquare,
  Zap,
  ArrowRight,
  Eye,
  EyeOff,
  RefreshCw,
  Building2,
  Calendar,
  Layers,
  HelpCircle
} from 'lucide-react';
import Card from './ui/Card';
import Button from './ui/Button';
import Badge from './ui/Badge';
import { toast } from 'sonner';

interface TicketAuditInspectorModalProps {
  ticket: AuditingQueueTicket;
  form?: EvaluationForm;
  aiDraft?: AIEvaluationDraft;
  onClose: () => void;
  onLaunchAudit: (ticket: AuditingQueueTicket) => void;
  onReevaluate?: (ticket: AuditingQueueTicket) => Promise<void>;
}

export default function TicketAuditInspectorModal({
  ticket,
  form,
  aiDraft,
  onClose,
  onLaunchAudit,
  onReevaluate,
}: TicketAuditInspectorModalProps) {
  const [loadingDialogue, setLoadingDialogue] = useState(false);
  const [dialogue, setDialogue] = useState<TicketCommentMessage[]>([]);
  const [ticketFields, setTicketFields] = useState<{ title: string; value: string }[]>([]);
  const [useSanitized, setUseSanitized] = useState(true);
  const [activeTab, setActiveTab] = useState<'confronto' | 'dialogo_completo' | 'campos_crm'>('confronto');
  const [reevaluating, setReevaluating] = useState(false);

  // Carrega o diálogo e os campos do Zendesk quando o modal abre
  useEffect(() => {
    let isMounted = true;
    const load = async () => {
      setLoadingDialogue(true);
      try {
        const res = await fetchTicketDialogue(ticket.ticket_id);
        if (isMounted) {
          setDialogue(res.comments || []);
          setTicketFields(res.ticketFields || []);
        }
      } catch (err: any) {
        console.error('Erro ao carregar diálogo do ticket:', err);
        toast.error('Não foi possível carregar o histórico de mensagens do chamado.');
      } finally {
        if (isMounted) setLoadingDialogue(false);
      }
    };
    load();
    return () => { isMounted = false; };
  }, [ticket.ticket_id]);

  // Extrai todas as perguntas das seções da ficha de avaliação
  const allQuestions = useMemo(() => {
    if (!form?.sections) return [];
    return form.sections.flatMap(s => s.questions || []);
  }, [form]);

  // Calcula timeline com sanitização e métricas de SLA
  const timeline = useMemo(() => {
    return computeTicketTimeline(dialogue);
  }, [dialogue]);

  const aiResult = aiDraft?.result as AIEvaluationResult | undefined;

  const handleReevaluateClick = async () => {
    if (!onReevaluate) return;
    setReevaluating(true);
    try {
      await onReevaluate(ticket);
    } finally {
      setReevaluating(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-3 sm:p-6 animate-fade-in"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-7xl bg-surface-card border border-surface-border rounded-2xl shadow-2xl flex flex-col max-h-[94vh] overflow-hidden"
      >
        {/* 1. Header do Chamado */}
        <div className="px-6 py-4 border-b border-surface-border bg-surface-subtle/40 flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="font-mono text-sm font-black text-brand-primary bg-surface-subtle px-2 py-0.5 rounded-lg border border-surface-border">
                #{ticket.ticket_id}
              </span>
              <h2 className="text-sm sm:text-base font-black text-brand-primary truncate">
                {ticket.subject || `Chamado #${ticket.ticket_id}`}
              </h2>
              {ticket.url && (
                <a
                  href={ticket.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-brand-muted hover:text-brand-highlight transition-colors flex items-center gap-1 text-[11px] font-bold"
                  title="Abrir no Zendesk"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Zendesk</span>
                </a>
              )}
            </div>

            <div className="flex items-center gap-3 text-xs text-brand-muted flex-wrap">
              <span className="flex items-center gap-1 font-semibold">
                <UserIcon className="w-3.5 h-3.5 text-brand-accent" />
                <span>Atendente: <strong className="text-brand-primary">{ticket.agent_name || 'N/D'}</strong></span>
              </span>
              {ticket.organization_name && (
                <span className="flex items-center gap-1 font-semibold">
                  <Building2 className="w-3.5 h-3.5 text-brand-highlight" />
                  <span>Cliente: <strong className="text-brand-primary">{ticket.organization_name}</strong></span>
                </span>
              )}
              {ticket.channel && (
                <span className="text-[11px] font-bold uppercase tracking-wider bg-surface-subtle px-2 py-0.5 rounded border border-surface-border">
                  Canal: {ticket.channel}
                </span>
              )}
              {form && (
                <span className="text-[11px] font-bold text-brand-primary bg-brand-highlight/10 text-brand-highlight px-2 py-0.5 rounded">
                  Ficha: {form.title}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <Button variant="ghost" size="sm" onClick={onClose} className="rounded-xl p-1.5">
              <X className="w-5 h-5 text-brand-muted hover:text-brand-primary" />
            </Button>
          </div>
        </div>

        {/* 2. Barra de Métricas de SLA e Indicadores Operacionais */}
        <div className="px-6 py-2.5 bg-surface-subtle/80 border-b border-surface-border flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-4 text-xs flex-wrap">
            {/* 1ª Resposta (FRT) */}
            <div className="flex items-center gap-1.5" title="Tempo da primeira mensagem do cliente até o primeiro contato do atendente">
              <Clock className="w-3.5 h-3.5 text-brand-highlight" />
              <span className="text-brand-muted font-medium">1ª Resposta:</span>
              <span className="font-mono font-bold text-brand-primary">
                {timeline.metrics.firstResponseFormatted}
              </span>
            </div>

            <span className="text-surface-border hidden sm:inline">•</span>

            {/* Duração Total */}
            <div className="flex items-center gap-1.5" title="Tempo total do início ao encerramento do chamado">
              <Calendar className="w-3.5 h-3.5 text-brand-accent" />
              <span className="text-brand-muted font-medium">Duração Total:</span>
              <span className="font-mono font-bold text-brand-primary">
                {timeline.metrics.totalDurationFormatted}
              </span>
            </div>

            <span className="text-surface-border hidden sm:inline">•</span>

            {/* Maior Pausa de Espera */}
            <div className="flex items-center gap-1.5" title="Maior intervalo de tempo de espera do cliente">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
              <span className="text-brand-muted font-medium">Maior Espera:</span>
              <span className="font-mono font-bold text-brand-primary">
                {timeline.metrics.maxWaitTimeFormatted}
              </span>
            </div>

            <span className="text-surface-border hidden sm:inline">•</span>

            {/* Volume de Mensagens */}
            <div className="flex items-center gap-1.5">
              <MessageSquare className="w-3.5 h-3.5 text-functional-success" />
              <span className="text-brand-muted font-medium">Interações:</span>
              <span className="font-mono font-bold text-brand-primary">
                {timeline.metrics.totalMessagesCount} msgs
              </span>
              <span className="text-[10px] text-brand-muted">
                ({timeline.metrics.agentMessagesCount} atendente / {timeline.metrics.clientMessagesCount} cliente)
              </span>
            </div>
          </div>

          {/* Toggle de Sanitização */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setUseSanitized(!useSanitized)}
              className="inline-flex items-center gap-1.5 text-[11px] font-bold text-brand-muted hover:text-brand-primary bg-surface-card border border-surface-border px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
              title="Alternar entre visualização do texto limpo (sanitizado para IA) e o texto bruto original"
            >
              {useSanitized ? (
                <>
                  <Eye className="w-3.5 h-3.5 text-functional-success" />
                  <span>Sanitização Ativa (Limpo)</span>
                </>
              ) : (
                <>
                  <EyeOff className="w-3.5 h-3.5 text-brand-muted" />
                  <span>Texto Bruto (Original)</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* 3. Corpo Principal: Grid de Confronto Bilateral */}
        <div className="flex-1 overflow-y-auto p-6 min-h-0">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* ========================================================= */}
            {/* COLUNA ESQUERDA: O QUE FOI ENVIADO (EVIDÊNCIAS DO ATENDIMENTO) */}
            {/* ========================================================= */}
            <div className="lg:col-span-6 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-brand-accent" />
                  <h3 className="text-xs font-black uppercase tracking-wider text-brand-primary">
                    Evidências do Atendimento (Entrada para a IA)
                  </h3>
                </div>
                <span className="text-[10px] font-bold text-brand-muted bg-surface-subtle border border-surface-border px-2 py-0.5 rounded">
                  {timeline.items.length} mensagens processadas
                </span>
              </div>

              {/* Campos do CRM / Zendesk */}
              {ticketFields.length > 0 && (
                <Card className="p-3.5 bg-surface-subtle/50 border border-surface-border space-y-2.5">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-brand-primary">
                    <FileText className="w-3.5 h-3.5 text-brand-highlight" />
                    <span>Campos Estruturais do Ticket (CRM Zendesk)</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    {ticketFields.map((field, idx) => (
                      <div key={idx} className="p-2 rounded-lg bg-surface-card border border-surface-border/80">
                        <span className="text-[10px] font-bold text-brand-muted block uppercase tracking-wider">
                          {field.title}
                        </span>
                        <span className="font-semibold text-brand-primary text-[11px] break-words">
                          {field.value || '(não preenchido)'}
                        </span>
                      </div>
                    ))}
                  </div>

                  {ticket.tags && ticket.tags.length > 0 && (
                    <div className="flex items-center gap-1 flex-wrap pt-1">
                      <Tag className="w-3 h-3 text-brand-muted flex-shrink-0" />
                      <span className="text-[10px] font-bold text-brand-muted uppercase">Tags:</span>
                      {ticket.tags.map((tag, idx) => (
                        <span key={idx} className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-surface-card border border-surface-border text-brand-muted">
                          #{tag}
                        </span>
                      ))}
                    </div>
                  )}
                </Card>
              )}

              {/* Chat Timeline (Mensagens Tratadas) */}
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-brand-muted">Histórico de Conversação</span>
                  {loadingDialogue && (
                    <span className="text-xs text-brand-highlight flex items-center gap-1">
                      <RefreshCw className="w-3 h-3 animate-spin" /> Carregando diálogo...
                    </span>
                  )}
                </div>

                <div className="space-y-2.5 max-h-[520px] overflow-y-auto pr-1">
                  {timeline.items.map((item, idx) => {
                    const isAgent = item.authorRole === 'agent';
                    const isClient = item.authorRole === 'end_user';
                    const isInternal = !item.isPublic;

                    return (
                      <div key={item.id || idx} className="space-y-1">
                        {/* Alerta de Pausa Prolongada */}
                        {item.isLongPause && (
                          <div className="flex items-center justify-center my-2">
                            <span className="text-[10px] font-bold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 px-2.5 py-0.5 rounded-full flex items-center gap-1 shadow-xs">
                              <AlertTriangle className="w-3 h-3 text-amber-500" />
                              Pausa de {item.deltaFormatted?.replace('+', '')} entre as interações
                            </span>
                          </div>
                        )}

                        <div
                          className={`p-3 rounded-2xl border text-xs transition-all ${
                            isInternal
                              ? 'bg-amber-50/70 dark:bg-amber-950/20 border-amber-300 dark:border-amber-800/60'
                              : isAgent
                              ? 'bg-brand-highlight/5 border-brand-highlight/25 ml-4 sm:ml-8'
                              : 'bg-surface-subtle/80 border-surface-border mr-4 sm:mr-8'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2 mb-1.5 text-[11px]">
                            <div className="flex items-center gap-1.5 font-bold">
                              <span
                                className={`px-1.5 py-0.2 rounded text-[10px] font-black uppercase tracking-wider ${
                                  isInternal
                                    ? 'bg-amber-500 text-white'
                                    : isAgent
                                    ? 'bg-brand-highlight text-white'
                                    : 'bg-slate-500 text-white'
                                }`}
                              >
                                {isInternal ? 'Nota Interna' : isAgent ? 'Atendente' : 'Cliente'}
                              </span>
                              <span className="text-brand-primary truncate max-w-[180px]">
                                {item.authorName}
                              </span>
                            </div>

                            <div className="flex items-center gap-2 font-mono text-[10px] text-brand-muted">
                              {item.deltaFormatted && (
                                <span className="text-brand-muted/80">{item.deltaFormatted}</span>
                              )}
                              <span>
                                {new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                          </div>

                          <div className="text-brand-primary whitespace-pre-wrap leading-relaxed break-words font-sans">
                            {useSanitized ? item.sanitizedBody : item.rawBody}
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {timeline.items.length === 0 && !loadingDialogue && (
                    <div className="p-8 text-center text-xs text-brand-muted bg-surface-subtle rounded-xl border border-surface-border">
                      Nenhuma mensagem encontrada neste chamado.
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* ========================================================= */}
            {/* COLUNA DIREITA: O QUE A IA RETORNOU (PARECER & CONFRONTO) */}
            {/* ========================================================= */}
            <div className="lg:col-span-6 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Bot className="w-4 h-4 text-brand-highlight" />
                  <h3 className="text-xs font-black uppercase tracking-wider text-brand-primary">
                    Parecer da IA & Confronto de Critérios
                  </h3>
                </div>
                {aiResult && (
                  <Badge variant={aiResult.score >= 85 ? 'success' : aiResult.score >= 70 ? 'warning' : 'error'} size="sm" className="font-bold font-mono">
                    Score: {aiResult.score}%
                  </Badge>
                )}
              </div>

              {!aiResult ? (
                <Card className="p-8 text-center space-y-3 bg-surface-subtle/50">
                  <Bot className="w-10 h-10 text-brand-muted mx-auto" />
                  <div className="space-y-1">
                    <p className="text-xs font-bold text-brand-primary">Este chamado ainda não foi avaliado pela IA.</p>
                    <p className="text-[11px] text-brand-muted">Clique no botão abaixo para rodar a análise com IA e confrontar os critérios.</p>
                  </div>
                  {onReevaluate && (
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={handleReevaluateClick}
                      disabled={reevaluating}
                      className="mx-auto flex items-center gap-1.5"
                    >
                      <Zap className="w-3.5 h-3.5" />
                      <span>{reevaluating ? 'Avaliando com IA...' : 'Avaliar com IA Agora'}</span>
                    </Button>
                  )}
                </Card>
              ) : (
                <div className="space-y-4">
                  {/* Resumo Executivo da IA */}
                  <Card className="p-4 bg-brand-highlight/5 border border-brand-highlight/20 space-y-2">
                    <div className="flex items-center gap-2 text-xs font-black text-brand-primary">
                      <Sparkles className="w-3.5 h-3.5 text-brand-highlight" />
                      <span>Resumo Executivo da Avaliação</span>
                    </div>
                    <p className="text-xs text-brand-primary/90 leading-relaxed">
                      {aiResult.summary || 'Resumo não fornecido pela IA.'}
                    </p>

                    {/* Pontos Fortes e Oportunidades */}
                    {((aiResult.strengths && aiResult.strengths.length > 0) || (aiResult.improvements && aiResult.improvements.length > 0)) && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-surface-border/60 text-xs">
                        {aiResult.strengths && aiResult.strengths.length > 0 && (
                          <div className="space-y-1">
                            <span className="text-[10px] font-black text-functional-success uppercase tracking-wider flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" /> Pontos Fortes
                            </span>
                            <ul className="list-disc pl-4 space-y-0.5 text-[11px] text-brand-muted">
                              {aiResult.strengths.map((s, idx) => (
                                <li key={idx}><span className="text-brand-primary">{s}</span></li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {aiResult.improvements && aiResult.improvements.length > 0 && (
                          <div className="space-y-1">
                            <span className="text-[10px] font-black text-amber-500 uppercase tracking-wider flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" /> Oportunidades de Melhoria
                            </span>
                            <ul className="list-disc pl-4 space-y-0.5 text-[11px] text-brand-muted">
                              {aiResult.improvements.map((imp, idx) => (
                                <li key={idx}><span className="text-brand-primary">{imp}</span></li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}
                  </Card>

                  {/* Lista de Critérios Confrontados */}
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-brand-muted">
                        Confronto dos Critérios da Ficha ({allQuestions.length} itens)
                      </span>
                      <span className="text-[10px] text-brand-muted">Respostas e citações sugeridas pela IA</span>
                    </div>

                    <div className="space-y-2 max-h-[480px] overflow-y-auto pr-1">
                      {allQuestions.map((q) => {
                        const rawAnswers = (aiResult as any)?.answers;
                        const answer = aiResult.suggested_answers?.[q.id] || rawAnswers?.[q.id]?.answer || rawAnswers?.[q.id];
                        const justification = aiResult.suggested_observations?.[q.id] || rawAnswers?.[q.id]?.justification;

                        return (
                          <div
                            key={q.id}
                            className={`p-3 rounded-xl border space-y-2 transition-all ${
                              answer === 'SIM'
                                ? 'bg-functional-success/5 border-functional-success/20'
                                : answer === 'NAO'
                                ? 'bg-functional-error/5 border-functional-error/25'
                                : 'bg-surface-subtle/60 border-surface-border'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <span className="text-xs font-bold text-brand-primary leading-tight block">
                                  {q.text}
                                </span>
                                {q.description && (
                                  <span className="text-[10px] text-brand-muted block mt-0.5">
                                    {q.description}
                                  </span>
                                )}
                              </div>

                              <div className="flex-shrink-0">
                                {answer === 'SIM' ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-black bg-functional-success text-white">
                                    <CheckCircle2 className="w-3 h-3" /> SIM
                                  </span>
                                ) : answer === 'NAO' ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-black bg-functional-error text-white">
                                    <XCircle className="w-3 h-3" /> NÃO
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-black bg-slate-500 text-white">
                                    <HelpCircle className="w-3 h-3" /> N/A
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Justificativa e citação da IA */}
                            {justification && (
                              <div className="text-[11px] text-brand-primary/85 bg-surface-card/90 p-2.5 rounded-lg border border-surface-border/80 leading-relaxed font-sans">
                                <span className="font-bold text-brand-muted block text-[10px] uppercase tracking-wider mb-0.5">
                                  Justificativa da IA:
                                </span>
                                {justification}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 4. Rodapé com Ações */}
        <div className="px-6 py-3.5 border-t border-surface-border bg-surface-subtle/50 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onClose}>
              Fechar
            </Button>
            {onReevaluate && aiResult && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleReevaluateClick}
                disabled={reevaluating}
                className="flex items-center gap-1.5 text-brand-muted hover:text-brand-primary"
                title="Reprocessar chamada na IA para este ticket"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${reevaluating ? 'animate-spin' : ''}`} />
                <span>{reevaluating ? 'Reavaliando...' : 'Reavaliar com IA'}</span>
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                onClose();
                onLaunchAudit(ticket);
              }}
              className="flex items-center gap-1.5 shadow-md"
            >
              <span>Lançar Monitoria Oficial</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
