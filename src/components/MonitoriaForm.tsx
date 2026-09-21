import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { User, Monitoria, AIEvaluationResult, ChildTicketAiEvaluation, TicketCommentMessage } from '../types';
import { useStaticData } from '../lib/StaticDataContext';
import { useTheme } from '../providers/ThemeProvider';
import {
  ChevronRight,
  ChevronLeft,
  Save,
  X,
  AlertOctagon,
  Info,
  CheckCircle2,
  CheckCircle,
  XCircle,
  AlertCircle,
  Bot,
  RotateCcw,
  MessageSquare,
  Hash,
  Clock,
  User as UserIcon,
  Tag,
  Calendar,
  AlertTriangle,
  History,
  Target,
  Lock,
  Send,
  ExternalLink,
  UserPlus,
  FileText,
  Quote,
  Search,
  Copy,
  Check
} from 'lucide-react';
import { m, AnimatePresence, useReducedMotion } from 'motion/react';
import { useQualityConfig } from '../lib/useQualityConfig';
import { toast } from 'sonner';
import { supabase, mockDb, isMockMode } from '../lib/supabase';
import { resolveManualAgent, lookupTicketAgent, TicketAgentLookup, fetchTicketDialogue } from '../lib/helpdeskQueue';
import { normalizeTicketDialogue } from '../lib/zendeskChatParser';
import { useMonitoriaFormState } from '../hooks/useMonitoriaFormState';
import { useMonitoriaSave } from '../hooks/useMonitoriaSave';
import Card from './ui/Card';
import Button from './ui/Button';
import Badge from './ui/Badge';
import Select from './ui/Select';
import CustomSelect from './ui/CustomSelect';
import CustomDatepicker from './ui/CustomDatepicker';
import HelpdeskSendModal from './HelpdeskSendModal';
import TicketMessageBubble from './TicketMessageBubble';
import { EvaluationOutcome, MonitoriaStatus } from '../types';

const CHANNELS = ['Chat', 'Email', 'Telefone', 'WhatsApp'] as const;

// Estados considerados "concluídos" para fins de envio ao helpdesk — a
// monitoria já tem um veredito final, mesmo que tenha passado por
// contestação. Estados intermediários (pendente_revisao, em_contestacao,
// aguardando_gestor_*, reavaliacao_solicitada) ainda podem mudar de
// resultado, então não fazem sentido enviar ainda.
const HELPDESK_ELIGIBLE_STATUSES: MonitoriaStatus[] = [
  'concluida',
  'contestacao_aceita',
  'contestacao_negada',
  'finalizada_alterada',
];

export default function MonitoriaForm({
  user,
  onCancel,
  onSaved,
  initialData
}: {
  user: User | null;
  onCancel: () => void;
  onSaved: (monitoriaId: string) => void;
  initialData?: Monitoria;
}) {
  const { resolvedTheme } = useTheme();
  const { config: qualityConfig, getLevelForScore, isAboveTarget } = useQualityConfig();
  const staticData = useStaticData();
  const isAdmin = user?.role === 'admin';
  // Só é "somente leitura" quando initialData é uma monitoria JÁ SALVA (tem
  // id) — dados de pré-preenchimento vindos da Central de Filas (ticket_id,
  // sugestões da IA etc.) não têm id ainda e precisam continuar editáveis.
  const isViewOnly = !!(initialData as any)?.id && !(initialData as any)?._reevaluate && !(initialData as any)?._adminEdit;
  const isReevaluating = !!(initialData as any)?._reevaluate;
  const isAdminEdit = !!(initialData as any)?._adminEdit;

  const aiEval: AIEvaluationResult | undefined =
    (initialData as any)?.aiEvaluation ||
    (initialData as any)?.form_snapshot?.ai_evaluation;

  const childAiEval: ChildTicketAiEvaluation | undefined =
    (initialData as any)?.childAiEvaluation ||
    (initialData as any)?.form_snapshot?.child_ai_evaluation;

  const shouldReduceMotion = useReducedMotion();
  const contentRef = useRef<HTMLDivElement>(null);

  // Popup de cadastro rápido de agente do helpdesk ainda não formalizado
  // no QualiTrack (conta provisória por e-mail — ver lib/helpdeskQueue).
  const [newAgentModalOpen, setNewAgentModalOpen] = useState(false);
  const [newAgentName, setNewAgentName] = useState('');
  const [newAgentEmail, setNewAgentEmail] = useState('');
  const [creatingAgent, setCreatingAgent] = useState(false);
  // Preview do agente encontrado no Zendesk pelo número do ticket, quando
  // ele ainda não tem conta no QualiTrack (ver efeito de lookup abaixo).
  const [unregisteredAgentPreview, setUnregisteredAgentPreview] = useState<TicketAgentLookup | null>(null);

  // Card do score encolhe ao rolar para baixo na etapa de avaliação e acopla no topo
  const [scoreCompact, setScoreCompact] = useState(false);
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const onScroll = () => setScoreCompact(el.scrollTop > 45);
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  // Diálogo e evidências do atendimento
  const [dialogue, setDialogue] = useState<TicketCommentMessage[]>(() => {
    const raw = (initialData as any)?.dialogue ||
      (initialData as any)?.aiEvaluation?.dialogue ||
      [];
    const agentName = (initialData as any)?.evaluated_name || (initialData as any)?.agent_name;
    return normalizeTicketDialogue(raw, agentName);
  });
  const [loadingDialogue, setLoadingDialogue] = useState(false);
  const [showDialogueDrawer, setShowDialogueDrawer] = useState(false);
  const [dialogueSearch, setDialogueSearch] = useState('');
  const [dialogueFilter, setDialogueFilter] = useState<'all' | 'end_user' | 'agent' | 'system' | 'internal'>('all');
  const [selectedQuestionForDialogue, setSelectedQuestionForDialogue] = useState<string | null>(null);
  const [showStep4Dialogue, setShowStep4Dialogue] = useState(false);
  const [expandedDialogueMsgIds, setExpandedDialogueMsgIds] = useState<Record<string, boolean>>({});

  const toggleDialogueMsgExpand = (id: string | number) => {
    setExpandedDialogueMsgIds(prev => ({ ...prev, [String(id)]: !prev[String(id)] }));
  };

  const forms = useMemo(() =>
    staticData.forms.filter(f => f.active !== false).sort((a, b) => a.title.localeCompare(b.title)),
    [staticData.forms]
  );
  const allUsers = staticData.users;
  const agents = useMemo(() =>
    staticData.users.filter(u => u.role === 'suporte' && u.active === true).sort((a, b) => a.name.localeCompare(b.name)),
    [staticData.users]
  );
  const teams = useMemo(() =>
    staticData.teams.filter(t => t.active !== false).sort((a, b) => a.name.localeCompare(b.name)),
    [staticData.teams]
  );
  const dissatisfactionFields = staticData.dissatisfactionFields;

  const {
    step, setStep,
    header, setHeader,
    scores, setScores,
    observations, setObservations,
    criticalErrors, setCriticalErrors,
    criticalErrorObservations, setCriticalErrorObservations,
    dissatisfactionAnswers,
    selectedForm,
    score,
    clientFieldsToShow,
    qualityFieldsToShow,
    handleCheckboxChange,
  } = useMonitoriaFormState(initialData, forms, dissatisfactionFields);

  useEffect(() => {
    if (contentRef.current) {
      contentRef.current.scrollTop = 0;
      setScoreCompact(false);
    }
  }, [step]);

  const evaluatedAgent = useMemo(() => agents.find(a => a.id === header.evaluated_id), [agents, header.evaluated_id]);
  const evaluatedTeam = useMemo(() => teams.find(t => t.id === header.team_id), [teams, header.team_id]);
  const specializedTeamLabel = useMemo(() => {
    if ((initialData as any)?.specializedTeamLabel) return (initialData as any).specializedTeamLabel as string;
    const teamName = (evaluatedTeam?.name || '').toLowerCase();
    if (/cont[aá]bil/i.test(teamName)) return 'Contábil';
    if (/fiscal/i.test(teamName)) return 'Fiscal';
    if (/\btef\b/i.test(teamName)) return 'TEF';
    return null;
  }, [initialData, evaluatedTeam]);
  const headerSubtitle = evaluatedAgent?.name
    ? `Resolvido por ${evaluatedAgent.name}${evaluatedTeam?.name ? ` da equipe ${evaluatedTeam.name}` : ''}`
    : ((initialData as any)?.ticket_subject || '');

  // Carregamento resiliente do diálogo: se o ticket_id existe mas ainda não temos mensagens, busca no Helpdesk
  useEffect(() => {
    const ticketId = header.ticket_id?.trim();
    if (!ticketId || dialogue.length > 0) return;

    let cancelled = false;
    setLoadingDialogue(true);
    fetchTicketDialogue(ticketId)
      .then(res => {
        if (!cancelled && res?.comments && res.comments.length > 0) {
          setDialogue(normalizeTicketDialogue(res.comments, evaluatedAgent?.name));
        }
      })
      .catch(err => {
        console.warn('[MonitoriaForm] Diálogo não carregado automaticamente:', err);
      })
      .finally(() => {
        if (!cancelled) setLoadingDialogue(false);
      });

    return () => { cancelled = true; };
  }, [header.ticket_id, dialogue.length, evaluatedAgent?.name]);

  // Se o agente for selecionado ou alterado, revalida papéis no diálogo existente
  useEffect(() => {
    if (dialogue.length > 0 && evaluatedAgent?.name) {
      setDialogue(prev => normalizeTicketDialogue(prev, evaluatedAgent.name));
    }
  }, [evaluatedAgent?.name]);

  const scoreLevel = useMemo(() => getLevelForScore(score), [getLevelForScore, score]);
  const isScoreTarget = useMemo(() => isAboveTarget(score), [isAboveTarget, score]);

  const subtleScoreClass = useMemo(() => {
    const textColor = scoreLevel.color;
    if (textColor.includes('excelente')) return 'bg-level-excelente/10 text-level-excelente';
    if (textColor.includes('aceitavel')) return 'bg-level-aceitavel/10 text-level-aceitavel';
    if (textColor.includes('atencao')) return 'bg-level-atencao/10 text-level-atencao';
    if (textColor.includes('ruim')) return 'bg-level-ruim/10 text-level-ruim';
    if (textColor.includes('roxo')) return 'bg-level-roxo/10 text-level-roxo';
    return 'bg-brand-subtle/10 text-brand-primary';
  }, [scoreLevel.color]);
  const [scoreBgClass, scoreTextClass] = subtleScoreClass.split(' ');

  const filteredDialogue = useMemo(() => {
    return dialogue.filter(msg => {
      if (dialogueFilter === 'end_user' && msg.author_role !== 'end_user') return false;
      if (dialogueFilter === 'agent' && msg.author_role !== 'agent' && msg.author_role !== 'admin') return false;
      if (dialogueFilter === 'system' && (msg.author_role !== 'system' || !msg.is_public)) return false;
      if (dialogueFilter === 'internal' && msg.is_public) return false;
      if (dialogueSearch.trim()) {
        const query = dialogueSearch.toLowerCase();
        const inBody = (msg.body || '').toLowerCase().includes(query);
        const inAuthor = (msg.author_name || '').toLowerCase().includes(query);
        return inBody || inAuthor;
      }
      return true;
    });
  }, [dialogue, dialogueFilter, dialogueSearch]);

  const handleCiteInObservation = (commentText: string, authorName: string, questionId?: string) => {
    const targetQId = questionId || selectedQuestionForDialogue;
    const citation = `"${commentText.trim()}" (${authorName})`;
    if (targetQId) {
      setObservations(prev => {
        const current = prev[targetQId] || '';
        return {
          ...prev,
          [targetQId]: current ? `${current}\n${citation}` : citation
        };
      });
      toast.success('Trecho citado inserido na observação do critério!');
    } else {
      navigator.clipboard.writeText(citation);
      toast.success('Trecho copiado para a área de transferência!');
    }
  };

  // Aviso (não bloqueio) de ticket já avaliado. Não há UNIQUE em
  // monitorias.ticket_id nem checagem alguma hoje — confirmado no banco:
  // já existem 2 monitorias reais com o mesmo ticket_id avaliando pessoas
  // diferentes. A decisão de negócio foi permitir isso (pode ser
  // reavaliação legítima), só sinalizando quando acontecer.
  //
  // Limitação conhecida: a policy de SELECT em monitorias restringe o
  // papel 'qualidade' a ver apenas as PRÓPRIAS avaliações (evaluator_id =
  // auth.uid()). Então esta checagem, para esse papel, só enxerga
  // duplicidade criada pelo mesmo auditor — não pega o caso de dois
  // auditores diferentes avaliarem o mesmo ticket. Para admin e
  // gestor_qualidade, que veem tudo, a checagem é completa. Resolver o
  // caso geral exigiria uma função SECURITY DEFINER dedicada; não fizemos
  // isso aqui para manter a mudança pequena e sem tocar em RLS.
  const lastWarnedTicketRef = useRef<string | null>(null);
  useEffect(() => {
    if (isViewOnly) return;
    const ticketId = header.ticket_id?.trim();
    if (!ticketId) { lastWarnedTicketRef.current = null; return; }
    if (lastWarnedTicketRef.current === ticketId) return;

    const timer = setTimeout(async () => {
      try {
        let existentes: { evaluated_name?: string; score?: number; status?: string }[] = [];
        if (isMockMode) {
          const { data } = await mockDb.get('monitorias');
          existentes = (data || []).filter((m: any) =>
            m.ticket_id === ticketId && m.active !== false && m.id !== initialData?.id
          );
        } else if (supabase) {
          let query = supabase
            .from('monitorias')
            .select('evaluated_name, score, status')
            .eq('ticket_id', ticketId)
            .eq('active', true);
          if (initialData?.id) query = query.neq('id', initialData.id);
          const { data, error } = await query;
          if (error) throw error;
          existentes = data || [];
        }

        if (existentes.length > 0) {
          lastWarnedTicketRef.current = ticketId;
          const resumo = existentes
            .slice(0, 3)
            .map(m => `${m.evaluated_name || '—'} (${m.score ?? '—'}%)`)
            .join(', ');
          const resto = existentes.length > 3 ? ` e mais ${existentes.length - 3}` : '';
          toast.warning(
            `Este ticket já possui ${existentes.length === 1 ? 'uma monitoria avaliada' : `${existentes.length} monitorias avaliadas`}: ${resumo}${resto}. Você pode continuar mesmo assim.`,
            { duration: 8000 }
          );
        }
      } catch (e) {
        // Falha na checagem não deve bloquear o preenchimento — é só um
        // aviso a mais, não uma validação obrigatória.
        console.error('[MonitoriaForm] Falha ao checar monitorias existentes para o ticket:', e);
      }
    }, 600);

    return () => clearTimeout(timer);
  }, [header.ticket_id, isViewOnly, initialData?.id]);

  // Ao digitar o número do ticket manualmente (fora da Central de Filas),
  // busca no Zendesk quem é o atendente responsável e já preenche o campo
  // de Agente — mesmo que ele ainda não tenha conta no QualiTrack, caso em
  // que mostramos um aviso com asterisco em vez do id (que não existe).
  const lastLookedUpTicketRef = useRef<string | null>(null);
  // Sempre reflete o ticket_id do render mais recente — usado para
  // descartar uma resposta de busca que chegou tarde, depois que o auditor
  // já trocou o número do ticket (senão o agente de um ticket antigo podia
  // ser aplicado por cima do ticket novo, avaliando a pessoa errada).
  const latestTicketIdRef = useRef<string | undefined>(header.ticket_id);
  latestTicketIdRef.current = header.ticket_id;

  // Nome/e-mail de um lookup anterior não podem sobreviver à troca do
  // ticket — senão o popup "Agente não cadastrado?" reabre pré-cheio com os
  // dados de outro ticket (mesmo que o ticket novo já tenha agente
  // cadastrado) e o auditor pode associar a pessoa errada sem perceber.
  // Efeito separado, disparado só por ticket_id em si — não pelo resto do
  // header — pra não limpar o que o auditor está digitando à toa.
  const agentModalTicketRef = useRef(header.ticket_id);
  useEffect(() => {
    if (agentModalTicketRef.current !== header.ticket_id) {
      agentModalTicketRef.current = header.ticket_id;
      setNewAgentName('');
      setNewAgentEmail('');
    }
  }, [header.ticket_id]);

  useEffect(() => {
    if (isViewOnly || isReevaluating) return;
    const ticketId = header.ticket_id?.trim();
    if (!ticketId || !/^\d+$/.test(ticketId)) {
      lastLookedUpTicketRef.current = null;
      setUnregisteredAgentPreview(null);
      return;
    }
    if (lastLookedUpTicketRef.current === ticketId) return;
    // Já tem um agente selecionado manualmente — não sobrescreve.
    if (header.evaluated_id) return;

    const timer = setTimeout(async () => {
      lastLookedUpTicketRef.current = ticketId;
      const found = await lookupTicketAgent(ticketId);
      // O ticket_id pode ter mudado enquanto a busca estava em voo — se
      // mudou, essa resposta já não corresponde ao que está na tela.
      if (ticketId !== latestTicketIdRef.current?.trim()) return;
      if (!found || header.evaluated_id) return;

      if (found.existing_id) {
        // Agente já cadastrado — preenche a ficha automaticamente, igual já
        // acontece vindo da Central de Filas.
        setHeader(prev => (prev.evaluated_id || prev.ticket_id?.trim() !== ticketId) ? prev : ({
          ...prev,
          evaluated_id: found.existing_id!,
          team_id: prev.team_id || found.existing_team_id || prev.team_id,
        }));
        setUnregisteredAgentPreview(null);
      } else {
        setUnregisteredAgentPreview(found);
        // Atendente ainda não cadastrado, mas o grupo dele no Zendesk (ex.:
        // "Suporte Interno") já existe como Equipe no QualiTrack (importado
        // via Admin > Equipes > Importar do Zendesk) — casa por nome e
        // pré-seleciona, pra não depender do monitor escolher certo na mão.
        if (found.team_name && !header.team_id) {
          const matchedTeam = teams.find(t => t.name.trim().toLowerCase() === found.team_name!.trim().toLowerCase());
          if (matchedTeam) {
            setHeader(prev => (prev.team_id || prev.ticket_id?.trim() !== ticketId) ? prev : ({ ...prev, team_id: matchedTeam.id }));
          }
        }
      }
    }, 700);

    return () => clearTimeout(timer);
  }, [header.ticket_id, header.evaluated_id, header.team_id, isViewOnly, isReevaluating, teams]);

  // Envio ao Zendesk: só faz sentido para monitorias com veredito final e
  // com ticket_id preenchido (a Edge Function exige um ticket numérico).
  //
  // O modal pode abrir de duas formas: manualmente (botão "Enviar ao
  // Zendesk" na visualização de uma monitoria já concluída) ou
  // automaticamente logo após "Finalizar Monitoria". `fromConclusion`
  // distingue as duas para o HelpdeskSendModal ajustar os textos, e também
  // decide o que fazer quando o modal fecha: no fluxo manual só fecha o
  // modal; no fluxo de conclusão, fechar o modal precisa também avisar o
  // componente pai (via onSaved) para fechar o formulário — é por isso que
  // o modal é mantido montado dentro do MonitoriaForm até esse momento, em
  // vez de o form fechar (e desmontar o modal) assim que o save termina.
  const [helpdeskModal, setHelpdeskModal] = useState<{ monitoriaId: string; fromConclusion: boolean } | null>(null);
  // Estado pós-salvamento: apresenta modal com a macro formatada para cópia manual em 1 clique
  const [saveSuccessData, setSaveSuccessData] = useState<{
    monitoriaId: string;
    outcome: EvaluationOutcome;
    macroText: string;
  } | null>(null);
  const [copiedSuccessMacro, setCopiedSuccessMacro] = useState(false);

  const canSendToHelpdesk = isViewOnly
    && !!initialData?.status
    && HELPDESK_ELIGIBLE_STATUSES.includes(initialData.status)
    && !!header.ticket_id?.trim();
  // Sugestão inicial do preview: Invalidado quando há erro crítico marcado,
  // Válido caso contrário. O auditor pode trocar livremente no modal.
  const suggestedOutcome: EvaluationOutcome =
    (initialData?.selected_critical_errors?.length ?? 0) > 0 ? 'negativa' : 'positiva';

  const handleHelpdeskModalClose = () => {
    const wasFromConclusion = helpdeskModal?.fromConclusion;
    const savedMonitoriaId = helpdeskModal?.monitoriaId;
    setHelpdeskModal(null);
    if (wasFromConclusion && savedMonitoriaId) onSaved(savedMonitoriaId);
  };

  const { isPending, validateStep, handleSave } = useMonitoriaSave({
    user,
    initialData,
    isReevaluating,
    isAdminEdit,
    header,
    scores,
    observations,
    criticalErrors,
    criticalErrorObservations,
    dissatisfactionAnswers,
    score,
    selectedForm,
    qualityConfig,
    allUsers,
    forms,
    teams,
    dissatisfactionFields,
    clientFieldsToShow,
    qualityFieldsToShow,
    onSaved: (savedMonitoriaId: string) => {
      // O envio automático direto ao Zendesk foi desativado conforme alinhado:
      // os testes práticos com os monitores iniciam em outubro. Por enquanto,
      // a monitoria fica 100% salva no QWP e apresentamos a macro formatada
      // para cópia manual imediata em 1 clique.
      const hasCritical = Object.values(criticalErrors).some(Boolean);
      const outcome: EvaluationOutcome = hasCritical ? 'negativa' : 'positiva';

      const isPositiva = outcome === 'positiva';
      const macroHeader = isPositiva
        ? '✅ Ticket validado pela Qualidade'
        : '❌ Ticket invalidado pela Qualidade';

      const macroIntro = isPositiva
        ? 'Após análise realizada pela equipe de Qualidade, identificamos que o chamado atende aos critérios estabelecidos.\nDessa forma, o ticket foi validado.'
        : 'Após análise realizada pela equipe de Qualidade, identificamos que o chamado não atende aos critérios estabelecidos para validação.\nDessa forma, o ticket foi invalidado e seguirá para tratativa do Gestor responsável.\n\nOrientamos a revisão das informações conforme os padrões definidos.';

      let macroText = `${macroHeader}\n\n${macroIntro}\n\nRegistro do analista:\n${header.evaluator_note?.trim() || '(Sem observações adicionais)'}`;

      if (header.satisfaction_has_record && header.satisfaction_record_text?.trim()) {
        macroText += `\n\nRetorno do cliente:\n${header.satisfaction_record_text.trim()}`;
      }

      setSaveSuccessData({
        monitoriaId: savedMonitoriaId,
        outcome,
        macroText,
      });
    },
  });

  // Cadastro rápido de agente do helpdesk que ainda não tem conta no
  // QualiTrack — cria uma conta provisória por e-mail (mesmo mecanismo da
  // triagem automática) e já seleciona o agente recém-criado na ficha.
  const handleCreateAgent = async () => {
    if (!newAgentName.trim() || !newAgentEmail.trim()) {
      toast.error('Preencha nome e e-mail do agente.');
      return;
    }
    setCreatingAgent(true);
    try {
      const agent = await resolveManualAgent(newAgentEmail.trim(), newAgentName.trim(), header.team_id || undefined);
      toast.success(`Agente "${newAgentName.trim()}" cadastrado — já pode ser selecionado.`);
      setHeader(prev => ({
        ...prev,
        evaluated_id: agent.id,
        team_id: agent.team_id || prev.team_id,
      }));
      setNewAgentModalOpen(false);
      setNewAgentName('');
      setNewAgentEmail('');
      staticData.refreshAll();
    } catch (e: any) {
      console.error('Erro ao cadastrar agente:', e);
      toast.error(e?.message || 'Falha ao cadastrar o agente.');
    } finally {
      setCreatingAgent(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[9999] bg-black/75 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 md:p-6 overflow-hidden animate-fade-in">
      <m.div
        initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.98, y: 10 }}
        animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
        className="bg-surface-bg rounded-2xl shadow-2xl w-full max-w-5xl mx-auto flex flex-col h-[94vh] max-h-[94vh] overflow-hidden border border-surface-border relative"
      >
        {/* Top Header */}
        <div className="px-5 py-3 border-b border-surface-border flex items-center justify-between bg-surface-card flex-shrink-0 gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-brand-subtle flex items-center justify-center text-brand-primary flex-shrink-0">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-black text-brand-primary tracking-tight uppercase truncate">
                  {isViewOnly ? 'Visualizar' : isAdminEdit ? 'Editar (Admin)' : isReevaluating ? 'Reavaliar' : 'Nova'} Monitoria
                </h2>
                {isViewOnly && (
                  <Badge variant="warning" className="flex items-center gap-1 flex-shrink-0">
                    <Lock className="w-3 h-3" /> Somente leitura
                  </Badge>
                )}
              </div>
              {isViewOnly && (
                <p className="text-[11px] text-brand-muted mt-0.5 max-w-md leading-relaxed">
                  Monitorias salvas não podem ser editadas. Para alterar, use <span className="text-brand-primary font-bold">Reavaliar</span> — disponível quando o suporte contesta.
                </p>
              )}
              {initialData?.display_id && <Badge variant="info" className="mt-0.5">Mon: {initialData.display_id}</Badge>}
              {headerSubtitle && (
                <p className="text-xs font-bold text-brand-primary mt-0.5 max-w-md truncate" title={headerSubtitle}>
                  {headerSubtitle}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3 flex-shrink-0">
            {/* Docked Score Badge in Top Header (appears on scroll in step 2 - exact area marked by red rectangle in user screenshot) */}
            <AnimatePresence>
              {scoreCompact && step === 2 && selectedForm && (
                <m.div
                  key="header-docked-score"
                  initial={{ opacity: 0, scale: 0.72, y: -4 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.72, y: -4 }}
                  transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                  className="flex items-center gap-2 sm:gap-2.5 px-3 py-1.5 rounded-xl border border-surface-border bg-surface-subtle shadow-premium-sm"
                >
                  <div className={`w-6 h-6 rounded-lg flex items-center justify-center ${scoreBgClass}`}>
                    <Target className={`w-3.5 h-3.5 ${scoreTextClass}`} />
                  </div>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-[10px] font-black uppercase tracking-wider text-brand-muted hidden md:inline">Score:</span>
                    <span className={`text-sm sm:text-base font-black tabular-nums ${scoreTextClass}`}>
                      {score.toFixed(2)}%
                    </span>
                    <span className="text-[9px] sm:text-[10px] font-black uppercase text-brand-muted tracking-wider">
                      - {scoreLevel.label}
                    </span>
                  </div>
                  <Badge
                    variant={isScoreTarget ? 'success' : 'error'}
                    size="sm"
                    className="font-black uppercase tracking-wider text-[9px] px-2 py-0.5 ml-0.5 sm:ml-1"
                  >
                    {isScoreTarget ? 'Meta Atingida' : 'Abaixo da Meta'}
                  </Badge>
                </m.div>
              )}
            </AnimatePresence>

            <button onClick={onCancel} className="p-1.5 hover:bg-surface-subtle rounded-xl transition-all text-brand-muted cursor-pointer" title="Fechar">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Form Content */}
        <div ref={contentRef} className="flex-1 overflow-y-auto px-5 py-4 md:px-8 md:py-6 space-y-6 no-scrollbar min-h-0">
          {/* Stepper Progress */}
          <div className="flex items-center justify-center gap-4 md:gap-8 pb-3 border-b border-surface-border/50">
            {[
              { n: 1, label: 'Identificação' },
              { n: 2, label: 'Avaliação' },
              { n: 3, label: 'Pesquisa' },
              { n: 4, label: 'Registro/Log' }
            ].map(s => {
              const isCurrent = step === s.n;
              const isPast = step > s.n;
              const canClick = isViewOnly || s.n < step || (s.n === step + 1 && validateStep(step));
              return (
                <button
                  key={s.n}
                  type="button"
                  onClick={() => {
                    if (s.n < step || isViewOnly) {
                      setStep(s.n);
                    } else if (s.n === step + 1 && validateStep(step)) {
                      setStep(s.n);
                    }
                  }}
                  className={`flex flex-col items-center gap-1.5 group transition-all ${
                    canClick ? 'cursor-pointer hover:opacity-90' : 'cursor-default'
                  }`}
                  title={canClick ? `Ir para etapa ${s.n} (${s.label})` : s.label}
                >
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs font-black font-mono transition-all ${
                    isCurrent
                      ? 'bg-brand-accent text-white shadow-xs ring-2 ring-brand-accent/30'
                      : isPast
                      ? 'bg-brand-accent/20 text-brand-accent border border-brand-accent/30'
                      : 'bg-surface-subtle text-brand-muted'
                  }`}>
                    {s.n}
                  </div>
                  <span className={`text-[9px] font-black uppercase tracking-[0.15em] ${step >= s.n ? 'text-brand-primary' : 'text-brand-muted hidden md:block'}`}>{s.label}</span>
                </button>
              );
            })}
          </div>

          {step === 1 && (
            <section className="animate-fade-in space-y-8 max-w-4xl mx-auto">
              <div className="text-center mb-8">
                <h3 className="text-xl font-black text-brand-primary uppercase tracking-tight">Dados da Avaliação</h3>
                <p className="text-xs font-bold text-brand-muted uppercase tracking-widest mt-1">Preencha as informações básicas do ticket</p>
              </div>

              {specializedTeamLabel && (
                <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between gap-3 text-amber-700 dark:text-amber-300 shadow-xs">
                  <div className="flex items-center gap-2.5">
                    <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                    <span className="text-xs font-bold">
                      Observação: Atendimento da equipe <strong>{specializedTeamLabel}</strong> — avaliado utilizando a ficha ativa disponível ({selectedForm?.title || 'Ficha Padrão'}).
                    </span>
                  </div>
                  <Badge variant="warning" size="xs" className="font-black text-[10px] uppercase tracking-wider bg-amber-500/20 text-amber-800 dark:text-amber-200 border-amber-500/40 shrink-0">
                    {specializedTeamLabel}
                  </Badge>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                <div className="space-y-2">
                  <div className="flex items-center justify-between ml-1">
                    <label className="text-[10px] font-black text-brand-muted uppercase tracking-widest">Ficha de Avaliação *</label>
                    {((initialData as any)?.isAiLocked || (initialData as any)?.aiEvaluation) && (
                      <span className="flex items-center gap-1 text-[10px] font-black text-brand-highlight">
                        <Lock className="w-3 h-3" />
                        <span>Definida pela IA ({(initialData as any)?.customerType === 'revenda' ? 'Revenda' : 'Cliente Final'})</span>
                      </span>
                    )}
                  </div>
                  <CustomSelect
                    value={header.form_id}
                    onChange={val => setHeader({...header, form_id: val})}
                    options={[{ value: '', label: 'Selecione a ficha...' }, ...forms.map(f => ({ value: f.id, label: f.title }))]}
                    className="w-full"
                    disabled={isViewOnly || isReevaluating || !!((initialData as any)?.isAiLocked || (initialData as any)?.aiEvaluation)}
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between ml-1">
                    <label className="text-[10px] font-black text-brand-muted uppercase tracking-widest">Agente de Atendimento *</label>
                    {!isViewOnly && !isReevaluating && (
                      <button
                        type="button"
                        onClick={() => {
                          if (unregisteredAgentPreview) {
                            setNewAgentName(unregisteredAgentPreview.name || '');
                            setNewAgentEmail(unregisteredAgentPreview.email || '');
                          }
                          setNewAgentModalOpen(true);
                        }}
                        className="flex items-center gap-1 text-[10px] font-black text-brand-highlight hover:underline"
                      >
                        <UserPlus className="w-3 h-3" />
                        <span>Agente não cadastrado?</span>
                      </button>
                    )}
                  </div>
                  <CustomSelect
                    value={header.evaluated_id}
                    onChange={val => {
                      if (!val) {
                        setHeader(prev => ({...prev, evaluated_id: '', team_id: ''}));
                        return;
                      }
                      const selectedAgent = agents.find(a => a.id === val);
                      let autoTeamId = header.team_id;
                      if (selectedAgent) {
                        const agentTeams = selectedAgent.team_ids?.length
                          ? selectedAgent.team_ids
                          : (selectedAgent.primary_team_id ? [selectedAgent.primary_team_id] : []);

                        if (agentTeams.length === 1) {
                          autoTeamId = agentTeams[0];
                        } else if (selectedAgent.primary_team_id && agentTeams.includes(selectedAgent.primary_team_id)) {
                          autoTeamId = selectedAgent.primary_team_id;
                        } else if (!header.team_id && agentTeams.length > 0) {
                          autoTeamId = agentTeams[0];
                        } else if (header.team_id && agentTeams.length > 0 && !agentTeams.includes(header.team_id)) {
                          autoTeamId = agentTeams[0];
                        }
                      }
                      setHeader(prev => ({...prev, evaluated_id: val, team_id: autoTeamId}));
                    }}
                    options={[
                      { value: '', label: 'Selecione o agente...' },
                      ...agents
                        .filter(a => {
                          if (!header.team_id) return true;
                          const agentTeams = a.team_ids?.length
                            ? a.team_ids
                            : (a.primary_team_id ? [a.primary_team_id] : []);
                          if (!agentTeams || agentTeams.length === 0) return true;
                          return agentTeams.includes(header.team_id);
                        })
                        .map(a => ({ value: a.id, label: a.name }))
                    ]}
                    className="w-full"
                    disabled={isViewOnly || isReevaluating}
                  />
                  {unregisteredAgentPreview && !header.evaluated_id && (
                    <p className="text-[10px] font-bold text-functional-warning ml-1">
                      * {unregisteredAgentPreview.name} ({unregisteredAgentPreview.email}) — atendente do
                      Zendesk deste ticket, ainda não cadastrado no QualidadeWP. Clique em
                      "Agente não cadastrado?" acima para cadastrar.
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-brand-muted uppercase tracking-widest ml-1">Equipe *</label>
                  <CustomSelect
                    value={header.team_id}
                    onChange={val => {
                      if (!val) {
                        setHeader(prev => ({...prev, team_id: ''}));
                        return;
                      }
                      if (header.evaluated_id) {
                        const currentAgent = agents.find(a => a.id === header.evaluated_id);
                        const agentTeams = currentAgent?.team_ids?.length
                          ? currentAgent.team_ids
                          : (currentAgent?.primary_team_id ? [currentAgent.primary_team_id] : []);
                        if (agentTeams.length > 0 && !agentTeams.includes(val)) {
                          toast.info('Remova o agente antes de trocar para uma equipe diferente.');
                          return;
                        }
                      }
                      setHeader(prev => ({...prev, team_id: val}));
                    }}
                    options={[
                      { value: '', label: 'Selecione a equipe...' },
                      ...teams
                        .filter(t => {
                          if (!header.evaluated_id) return true;
                          const agent = agents.find(a => a.id === header.evaluated_id);
                          const agentTeams = agent?.team_ids?.length
                            ? agent.team_ids
                            : (agent?.primary_team_id ? [agent.primary_team_id] : []);
                          // Se o agente ainda não tiver equipes vinculadas no cadastro, exibe todas as equipes disponíveis
                          if (!agentTeams || agentTeams.length === 0) return true;
                          return agentTeams.includes(t.id);
                        })
                        .map(t => ({ value: t.id, label: t.name }))
                    ]}
                    className="w-full"
                    disabled={isViewOnly || isReevaluating}
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-black text-brand-muted uppercase tracking-widest ml-1">Número do Ticket *</label>
                    {header.ticket_id?.trim() && (
                      <a
                        href={`https://webposto.zendesk.com/agent/tickets/${header.ticket_id.trim()}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[10px] font-black text-brand-highlight hover:underline uppercase tracking-wider"
                        title={`Abrir ticket #${header.ticket_id} no Zendesk`}
                      >
                        <span>Abrir no Zendesk</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                  <div className="relative">
                    <Hash className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-brand-muted/50" />
                    <input
                      type="text"
                      value={header.ticket_id}
                      onChange={e => setHeader({...header, ticket_id: e.target.value})}
                      disabled={isViewOnly || isReevaluating}
                      className="w-full bg-surface-subtle border border-surface-border rounded-xl pl-11 pr-4 h-10 text-xs font-bold text-brand-primary placeholder:text-brand-muted/40 focus:border-brand-accent focus:ring-4 focus:ring-brand-accent/5 transition-all outline-none"
                      placeholder="Digite o número do ticket"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-brand-muted uppercase tracking-widest ml-1">Canal *</label>
                  <CustomSelect
                    value={header.channel}
                    onChange={val => setHeader({...header, channel: val as any})}
                    options={CHANNELS.map(c => ({ value: c, label: c }))}
                    className="w-full"
                    disabled={isViewOnly || isReevaluating}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-brand-muted uppercase tracking-widest ml-1">Data do Ticket *</label>
                  <CustomDatepicker
                    value={header.ticket_date}
                    onChange={(val: string) => setHeader({...header, ticket_date: val})}
                    disabled={isViewOnly}
                    placeholder="Selecione a data do ticket..."
                    className="w-full"
                    size="sm"
                  />
                </div>

                <div className="space-y-2 md:col-span-2">
                  <label className="text-[10px] font-black text-brand-muted uppercase tracking-widest ml-1 text-center block">Data Atual (Análise)</label>
                  <div className="bg-brand-subtle/30 rounded-xl py-2.5 text-center border border-brand-subtle">
                    <span className="text-xs font-black text-brand-primary uppercase tracking-widest">
                      {header.analysis_date.split('-').reverse().join('/')}
                    </span>
                  </div>
                </div>
              </div>

              {/* Campos do Formulário no Zendesk (exclusivamente campos do formulário ativo, sem campos ocultos) */}
              {Array.isArray((initialData as any)?.ticket_fields) && (initialData as any).ticket_fields.length > 0 && (
                <div className="mt-8 pt-6 border-t border-surface-border/60 animate-fade-in">
                  <div className="flex items-center gap-2 mb-4">
                    <FileText className="w-4 h-4 text-brand-highlight" />
                    <h4 className="text-xs font-black uppercase text-brand-primary tracking-wider">
                      Campos do Formulário no Zendesk ({(initialData as any).ticket_fields.length})
                    </h4>
                    <span className="text-[10px] text-brand-muted font-bold hidden sm:inline">
                      · Dados reais preenchidos no chamado para validação
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                    {(initialData as any).ticket_fields.map((field: { title: string; value: string }, idx: number) => (
                      <div key={idx} className="p-3 bg-surface-card border border-surface-border rounded-xl shadow-xs space-y-1">
                        <p className="text-[9px] font-black uppercase tracking-wider text-brand-muted line-clamp-1" title={field.title}>
                          {field.title}
                        </p>
                        <p className="text-xs font-bold text-brand-primary line-clamp-2" title={field.value}>
                          {field.value}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>
          )}

          {step === 2 && selectedForm && (
            <section className="space-y-8 animate-fade-in max-w-4xl mx-auto">
              {/* Score Banner Principal - Animação de encolher ao rolar para baixo e transferir para o topo fixo */}
              <AnimatePresence>
                {!scoreCompact && (
                  <m.div
                    key="step2-main-score-banner"
                    initial={{ opacity: 0, height: 0, scale: 0.95 }}
                    animate={{ opacity: 1, height: 'auto', scale: 1 }}
                    exit={{ opacity: 0, height: 0, scale: 0.92 }}
                    transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                    className="overflow-hidden mb-6"
                  >
                    <div className="rounded-2xl border border-surface-border flex flex-col sm:flex-row items-center justify-between bg-surface-card shadow-premium gap-4 p-6">
                      <div className="flex items-center gap-4">
                        <div className={`rounded-xl flex items-center justify-center w-12 h-12 ${scoreBgClass}`}>
                          <Target className={`w-6 h-6 ${scoreTextClass}`} />
                        </div>
                        <div>
                          <p className="text-[10px] font-black uppercase text-brand-muted tracking-[0.2em]">Score de Avaliação</p>
                          <div className="flex items-baseline gap-2 mt-1">
                            <span className={`text-3xl font-black tabular-nums ${scoreTextClass}`}>
                              {score.toFixed(2)}%
                            </span>
                            <span className="text-[10px] font-black text-brand-muted uppercase tracking-wider">
                              - {scoreLevel.label}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="text-center sm:text-right">
                        <Badge variant={isScoreTarget ? 'success' : 'error'} className="font-black uppercase tracking-wider px-3.5 py-1 text-[10px]">
                          {isScoreTarget ? 'Meta Atingida' : 'Abaixo da Meta'}
                        </Badge>
                        <p className="text-[9px] font-bold text-brand-muted uppercase tracking-widest mt-1.5">Calculado em tempo real</p>
                      </div>
                    </div>
                  </m.div>
                )}
              </AnimatePresence>

              {/* Barra de Evidências por Escrito do Atendimento */}
              <div className="rounded-2xl border border-brand-highlight/25 bg-surface-card p-4 sm:p-5 shadow-premium-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3.5">
                  <div className="w-10 h-10 rounded-xl bg-brand-highlight/10 text-brand-highlight flex items-center justify-center flex-shrink-0">
                    <MessageSquare className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="text-xs sm:text-sm font-black uppercase text-brand-primary tracking-wider">
                        Evidências por Escrito do Atendimento
                      </h4>
                      {dialogue.length > 0 ? (
                        <Badge variant="info" size="sm" className="font-mono font-bold text-[10px]">
                          {dialogue.length} {dialogue.length === 1 ? 'mensagem' : 'mensagens'}
                        </Badge>
                      ) : loadingDialogue ? (
                        <span className="text-[10px] text-brand-muted animate-pulse font-bold">Carregando mensagens...</span>
                      ) : null}
                    </div>
                    <p className="text-[11px] text-brand-muted mt-0.5">
                      Consulte as transcrições e falas registradas no ticket #{header.ticket_id || '—'} para confrontar com fatos concretos.
                    </p>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setSelectedQuestionForDialogue(null);
                    setDialogueSearch('');
                    setShowDialogueDrawer(true);
                  }}
                  className="flex items-center gap-2 text-xs font-bold w-full sm:w-auto justify-center cursor-pointer flex-shrink-0"
                >
                  <FileText className="w-4 h-4 text-brand-highlight" />
                  <span>{showDialogueDrawer ? 'Painel Aberto' : 'Ver Diálogo Completo'}</span>
                </Button>
              </div>

              {selectedForm.sections.map((section, sIdx) => (
                <div key={section.id} className="space-y-6">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl bg-brand-accent text-white flex items-center justify-center text-xs font-black font-mono shadow-xs">{sIdx + 1}</div>
                    <div>
                      <h3 className="text-lg font-black text-brand-primary tracking-tight uppercase">{section.title}</h3>
                      <p className="text-[10px] font-bold text-brand-muted uppercase tracking-widest">Peso desta seção: {section.weight}%</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-4">
                    {section.questions.map(q => (
                      <Card key={q.id} className={`bg-surface-card rounded-xl p-5 hover:border-brand-accent transition-all group ${q.is_critical && scores[q.id] === 'NAO' ? 'border-error ring-4 ring-error/5' : ''}`}>
                        <div className="flex flex-col md:flex-row justify-between gap-6">
                          <div className="flex-1">
                            <div className="flex items-start gap-3">
                              {q.is_critical && (
                                <Badge variant="error" size="sm" className="mt-1 flex-shrink-0 animate-pulse">ERRO CRÍTICO</Badge>
                              )}
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="text-sm font-bold text-brand-primary leading-relaxed">{q.text}</p>
                                {q.description && (
                                  <div className="relative z-20 hover:z-50 group/info">
                                    <Info className="w-4 h-4 text-brand-muted hover:text-brand-accent cursor-help transition-colors" />
                                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-3 bg-surface-card border border-surface-border rounded-xl shadow-premium opacity-0 invisible group-hover/info:opacity-100 group-hover/info:visible transition-all z-50 pointer-events-none group-hover/info:pointer-events-auto text-center">
                                      <p className="text-[11px] font-bold text-brand-muted leading-relaxed">{q.description}</p>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-4 mt-2">
                              <span className="text-[9px] font-black text-brand-muted uppercase tracking-widest">
                                Impacto: {((section.weight || 0) / (section.questions.filter(qu => scores[qu.id] !== 'NA').length || section.questions.length)).toFixed(1)}%
                              </span>
                            </div>
                          </div>
                          <div className="flex gap-0.5 bg-surface-subtle p-0.5 rounded-lg border border-surface-border h-fit flex-shrink-0">
                            {(['SIM', 'NAO', 'NA'] as const).map(opt => (
                              <button
                                key={opt}
                                onClick={() => !isViewOnly && setScores({...scores, [q.id]: opt})}
                                className={`px-3.5 py-1 rounded-md text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer ${scores[q.id] === opt ? (opt === 'NAO' && q.is_critical ? 'bg-error text-white shadow-sm' : 'bg-brand-primary text-brand-on-primary shadow-sm') : 'text-brand-muted hover:bg-surface-card'}`}
                                disabled={isViewOnly}
                              >
                                {opt}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Campo de Observação do Auditor */}
                        <div className="space-y-1.5 mt-4">
                          <div className="flex items-center justify-between">
                            <label className="text-[10px] font-black uppercase tracking-wider text-brand-muted">
                              Observação do Auditor para este critério
                            </label>
                            {dialogue.length > 0 && (
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedQuestionForDialogue(q.id);
                                  setShowDialogueDrawer(true);
                                }}
                                className="text-[10px] font-bold text-brand-highlight hover:underline flex items-center gap-1 cursor-pointer"
                              >
                                <MessageSquare className="w-3 h-3" />
                                <span>Ver evidências no diálogo</span>
                              </button>
                            )}
                          </div>
                          <textarea
                            value={observations[q.id] || ''}
                            onChange={e => !isViewOnly && setObservations({...observations, [q.id]: e.target.value})}
                            placeholder="Adicionar observação técnica ou justificativa do auditor para este item..."
                            className="w-full bg-surface-subtle border border-surface-border rounded-lg p-3 text-xs font-medium focus:border-brand-accent focus:outline-none transition-all"
                            disabled={isViewOnly}
                          />
                        </div>

                        {/* Base de Confronto da IA & Evidências por Escrito do Atendimento */}
                        {(() => {
                          const aiAnswer = aiEval?.suggested_answers?.[q.id];
                          const aiObs = aiEval?.suggested_observations?.[q.id];
                          const aiCrit = aiEval?.suggested_critical_errors?.[q.id];
                          if (!aiAnswer && !aiObs && aiCrit === undefined) return null;

                          const quoteMatch = aiObs ? aiObs.match(/["“]([^"”]{4,})["”]/) : null;
                          const quotedSnippet = quoteMatch ? quoteMatch[1] : null;

                          return (
                            <div className="mt-3 p-3.5 rounded-xl bg-surface-subtle/70 border border-brand-highlight/20 space-y-2.5">
                              <div className="flex items-center justify-between gap-2 flex-wrap">
                                <div className="flex items-center gap-1.5 text-xs font-black text-brand-highlight">
                                  <Bot className="w-3.5 h-3.5" />
                                  <span>Base de Confronto & Parecer da IA</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  {aiAnswer && (
                                    <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-md border ${
                                      aiAnswer === 'SIM'
                                        ? 'bg-functional-success/10 text-functional-success border-functional-success/25'
                                        : aiAnswer === 'NAO'
                                        ? 'bg-functional-error/10 text-functional-error border-functional-error/25'
                                        : 'bg-surface-subtle text-brand-muted border-surface-border'
                                    }`}>
                                      Sugestão IA: {aiAnswer}
                                    </span>
                                  )}
                                  {aiCrit && (
                                    <Badge variant="error" size="sm" className="text-[9px] font-black">
                                      Erro Crítico Apontado
                                    </Badge>
                                  )}
                                </div>
                              </div>

                              {/* Evidência Textual Extraída do Atendimento */}
                              {quotedSnippet && (
                                <div className="p-2.5 rounded-lg bg-surface-card border border-brand-highlight/30 space-y-1">
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="text-[10px] font-black uppercase tracking-wider text-brand-highlight flex items-center gap-1.5">
                                      <Quote className="w-3 h-3" />
                                      <span>Citação Extraída do Atendimento:</span>
                                    </span>
                                    {dialogue.length > 0 && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setSelectedQuestionForDialogue(q.id);
                                          const searchWords = quotedSnippet.split(' ').filter(w => w.length > 3).slice(0, 2).join(' ');
                                          setDialogueSearch(searchWords);
                                          setShowDialogueDrawer(true);
                                        }}
                                        className="text-[10px] font-bold text-brand-muted hover:text-brand-highlight underline cursor-pointer"
                                      >
                                        Localizar no diálogo
                                      </button>
                                    )}
                                  </div>
                                  <p className="font-mono text-[11px] text-brand-primary italic select-text bg-surface-subtle/60 p-2 rounded border border-surface-border/50">
                                    "{quotedSnippet}"
                                  </p>
                                </div>
                              )}

                              {/* Parecer Analítico da IA */}
                              {aiObs ? (
                                <div className="text-[11px] text-brand-muted bg-surface-card p-3 rounded-lg border border-surface-border leading-relaxed select-text space-y-1.5">
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="font-bold text-brand-primary text-[10px] uppercase tracking-wider">
                                      Análise e Motivo da IA:
                                    </span>
                                    {!isViewOnly && observations[q.id] !== aiObs && (
                                      <button
                                        type="button"
                                        onClick={() => setObservations(prev => ({ ...prev, [q.id]: aiObs }))}
                                        className="text-[10px] font-bold text-brand-highlight hover:underline flex items-center gap-1 cursor-pointer transition-colors"
                                        title="Copiar texto da IA para a observação deste critério"
                                      >
                                        <RotateCcw className="w-2.5 h-2.5" />
                                        Copiar para observação do auditor
                                      </button>
                                    )}
                                  </div>
                                  <p className="text-[11px] text-brand-primary/90 leading-relaxed font-sans">
                                    {aiObs}
                                  </p>
                                </div>
                              ) : (
                                <p className="text-[10px] text-brand-muted italic">Critério validado automaticamente sem observação adicional.</p>
                              )}

                              {/* Atalho para confrontar com o diálogo real */}
                              {dialogue.length > 0 && (
                                <div className="pt-1 flex items-center justify-between text-[10px]">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSelectedQuestionForDialogue(q.id);
                                      if (quotedSnippet) {
                                        const searchWords = quotedSnippet.split(' ').filter(w => w.length > 3).slice(0, 2).join(' ');
                                        setDialogueSearch(searchWords);
                                      } else {
                                        setDialogueSearch('');
                                      }
                                      setShowDialogueDrawer(true);
                                    }}
                                    className="text-brand-muted hover:text-brand-primary font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
                                  >
                                    <MessageSquare className="w-3.5 h-3.5 text-brand-highlight" />
                                    <span>Confrontar no Diálogo do Atendimento ({dialogue.length} mensagens gravadas)</span>
                                  </button>
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </Card>
                    ))}
                  </div>
                </div>
              ))}

              {selectedForm.critical_errors && selectedForm.critical_errors.length > 0 && (
                <div className="pt-10 border-t border-error/10">
                  <h3 className="text-sm font-black text-error flex items-center gap-1.5 mb-4 uppercase tracking-wider"><AlertOctagon className="w-4 h-4" /> Itens Fatais (Erros Críticos)</h3>
                  <div className="grid grid-cols-1 gap-3">
                    {(selectedForm.critical_errors || []).map(ce => (
                      <div key={ce.id} className="space-y-2">
                        <label className={`flex items-center gap-2.5 p-2.5 rounded-lg border transition-all cursor-pointer ${criticalErrors[ce.id] ? 'bg-error/5 border-error' : 'bg-surface-card border-surface-border hover:border-error/30'}`}>
                          <input type="checkbox" checked={!!criticalErrors[ce.id]} onChange={e => !isViewOnly && setCriticalErrors({...criticalErrors, [ce.id]: e.target.checked})} disabled={isViewOnly} className="w-4.5 h-4.5 rounded text-error focus:ring-error" />
                          <span className="text-[11px] font-black text-brand-primary uppercase tracking-wider">{ce.text}</span>
                        </label>
                        {criticalErrors[ce.id] && (
                          <textarea value={criticalErrorObservations[ce.id] || ''} onChange={e => !isViewOnly && setCriticalErrorObservations({...criticalErrorObservations, [ce.id]: e.target.value})} placeholder="Justificativa técnica obrigatória para a aplicação deste erro crítico..." className="w-full border border-error/20 rounded-lg p-3 text-xs font-medium focus:border-error focus:outline-none bg-error/5" disabled={isViewOnly} />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>
          )}

          {step === 3 && (
            <section className="animate-fade-in space-y-10 max-w-4xl mx-auto">
              <div className="space-y-4">
                <p className="text-[10px] font-black uppercase text-brand-muted tracking-[0.2em] ml-1 text-center">Pesquisa de Satisfação</p>
                <div className="grid grid-cols-3 gap-3.5">
                  {(['Positiva', 'Negativa', 'Sem pesquisa'] as const).map(opt => (
                    <button
                      key={opt}
                      onClick={() => !isViewOnly && !isReevaluating && setHeader({...header, satisfaction_result: opt})}
                      className={`py-3 px-4 rounded-xl border flex items-center justify-center transition-all text-xs font-black uppercase tracking-widest cursor-pointer ${header.satisfaction_result === opt ? 'bg-brand-primary border-brand-primary text-brand-on-primary shadow-premium-sm' : 'bg-surface-card border-surface-border text-brand-muted hover:border-brand-accent hover:text-brand-primary'}`}
                      disabled={isViewOnly || isReevaluating}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>

              {header.satisfaction_result && header.satisfaction_result !== 'Sem pesquisa' && (
                <m.div initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 10 }} animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }} className="space-y-6">
                  <Card className="bg-surface-card p-5 space-y-4 rounded-xl">
                    <div className="flex items-center justify-between gap-4">
                      <p className="text-xs font-black text-brand-primary uppercase tracking-wider">O cliente deixou algum registro (elogio/reclamação)?</p>
                      <div className="flex gap-0.5 bg-surface-subtle p-0.5 rounded-lg border border-surface-border h-fit flex-shrink-0">
                        {[true, false].map(v => (
                          <button
                            key={v ? 'y' : 'n'}
                            onClick={() => !isViewOnly && setHeader({...header, satisfaction_has_record: v})}
                            className={`px-3.5 py-1 rounded-md text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer ${header.satisfaction_has_record === v ? 'bg-brand-primary text-brand-on-primary shadow-sm' : 'text-brand-muted hover:bg-surface-card'}`}
                            disabled={isViewOnly}
                          >
                            {v ? 'SIM' : 'NÃO'}
                          </button>
                        ))}
                      </div>
                    </div>

                    {header.satisfaction_has_record && (
                      <div className="space-y-2 animate-fade-in">
                        <label className="text-[10px] font-bold text-brand-muted uppercase tracking-widest ml-1">Registro do Cliente</label>
                        <textarea
                          value={header.satisfaction_record_text}
                          onChange={e => setHeader({...header, satisfaction_record_text: e.target.value})}
                          disabled={isViewOnly}
                          className="w-full bg-surface-bg border border-surface-border rounded-xl p-4 text-xs font-medium min-h-[100px] focus:border-brand-accent focus:outline-none placeholder:text-brand-muted/40 text-brand-primary"
                          placeholder="Transcreva aqui o comentário do cliente..."
                        />
                      </div>
                    )}
                  </Card>

                  {header.satisfaction_result === 'Negativa' && (
                    <Card className="bg-error/5 border-error/20 p-5 space-y-4 rounded-xl">
                      <div className="flex items-center justify-between gap-4">
                        <p className="text-xs font-black text-error uppercase tracking-wider">Conseguimos contato com o cliente?</p>
                        <div className="flex gap-0.5 bg-surface-subtle p-0.5 rounded-lg border border-surface-border h-fit flex-shrink-0">
                          {[true, false].map(v => (
                            <button
                              key={v ? 'y' : 'n'}
                              onClick={() => !isViewOnly && setHeader({...header, client_contact_success: v})}
                              className={`px-3.5 py-1 rounded-md text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer ${header.client_contact_success === v ? 'bg-error text-white shadow-sm' : 'text-brand-muted hover:bg-surface-card'}`}
                              disabled={isViewOnly}
                            >
                              {v ? 'SIM' : 'NÃO'}
                            </button>
                          ))}
                        </div>
                      </div>
                      {header.client_contact_success && (
                        <div className="space-y-2 animate-fade-in">
                          <label className="text-[10px] font-bold text-brand-muted uppercase tracking-widest ml-1">Registro de Contato/Tentativa</label>
                          <textarea
                            value={header.client_contact_log}
                            onChange={e => setHeader({...header, client_contact_log: e.target.value})}
                            disabled={isViewOnly}
                            className="w-full bg-surface-bg border border-surface-border rounded-xl p-4 text-xs font-medium min-h-[100px] focus:border-brand-accent focus:outline-none placeholder:text-brand-muted/40 text-brand-primary"
                            placeholder="Descreva como foi o contato ou o motivo do insucesso..."
                          />
                        </div>
                      )}
                    </Card>
                  )}

                  {header.satisfaction_result === 'Negativa' && (header.satisfaction_has_record || header.client_contact_success) && clientFieldsToShow.length > 0 && (
                    <div className="space-y-6 pt-4 animate-fade-in">
                      <p className="text-[10px] font-black uppercase text-brand-muted tracking-[0.2em] ml-1 text-center">Campos Extras do Cliente</p>
                      {clientFieldsToShow.map(field => (
                        <Card key={field.id} className="bg-surface-card p-5 border border-surface-border space-y-4 shadow-premium-sm rounded-xl">
                          <p className="text-xs font-black text-brand-primary uppercase tracking-wider">{field.title}{!isViewOnly && ' *'}</p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                            {field.options.map(opt => {
                              const isChecked = (dissatisfactionAnswers[field.id] || []).includes(opt);
                              return (
                                <label
                                  key={opt}
                                  className={`flex items-center gap-2.5 py-2.5 px-3.5 rounded-lg border transition-all cursor-pointer ${
                                    isChecked
                                      ? 'bg-surface-subtle border-brand-primary/40 text-brand-primary'
                                      : 'bg-surface-card border-surface-border text-brand-muted hover:border-brand-accent hover:text-brand-primary'
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={e => handleCheckboxChange(field.id, opt, e.target.checked, isViewOnly)}
                                    disabled={isViewOnly}
                                    className="w-4.5 h-4.5 rounded text-brand-primary border-surface-border focus:ring-brand-primary"
                                  />
                                  <span className="text-[11px] font-black uppercase tracking-wider">{opt}</span>
                                </label>
                              );
                            })}
                          </div>
                        </Card>
                      ))}
                    </div>
                  )}
                </m.div>
              )}
            </section>
          )}

          {step === 4 && (
            <section className="space-y-10 animate-fade-in max-w-4xl mx-auto w-full">
              {specializedTeamLabel && (
                <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between gap-3 text-amber-700 dark:text-amber-300 shadow-xs">
                  <div className="flex items-center gap-2.5">
                    <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                    <span className="text-xs font-bold">
                      Observação: Atendimento da equipe <strong>{specializedTeamLabel}</strong> — avaliado utilizando a ficha ativa disponível.
                    </span>
                  </div>
                  <Badge variant="warning" size="xs" className="font-black text-[10px] uppercase tracking-wider bg-amber-500/20 text-amber-800 dark:text-amber-200 border-amber-500/40 shrink-0">
                    {specializedTeamLabel}
                  </Badge>
                </div>
              )}
              <div className="space-y-4">
                <p className="text-[10px] font-black uppercase text-brand-muted tracking-widest ml-1">Registro do Auditor</p>
                <textarea
                  value={header.evaluator_note}
                  onChange={e => setHeader({...header, evaluator_note: e.target.value})}
                  disabled={isViewOnly || isReevaluating}
                  className="w-full bg-surface-card border border-surface-border rounded-xl p-5 text-xs font-medium min-h-[150px] focus:border-brand-accent focus:outline-none shadow-premium-sm"
                  placeholder="Escreva aqui as observações gerais da auditoria..."
                />

                {/* Retorno da Base de Avaliação e Confronto da IA */}
                {(aiEval || childAiEval) && (
                  <div className="mt-4 rounded-2xl border border-brand-highlight/25 bg-surface-card p-6 shadow-premium space-y-5 animate-fade-in">
                    <div className="flex items-center justify-between pb-3 border-b border-surface-border">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-xl bg-brand-highlight/10 text-brand-highlight flex items-center justify-center flex-shrink-0">
                          <Bot className="w-4 h-4" />
                        </div>
                        <div>
                          <h4 className="text-xs font-black uppercase text-brand-primary tracking-wider">
                            Base de Confronto e Avaliação da IA
                          </h4>
                          <p className="text-[10px] text-brand-muted">
                            Retorno detalhado dos motivos, regras e evidências levantadas pela IA para confronto do auditor
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {aiEval?.score !== undefined && (
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-bold text-brand-muted uppercase">Score IA:</span>
                            <Badge variant={aiEval.score >= 85 ? 'success' : aiEval.score >= 70 ? 'warning' : 'error'} className="font-mono font-bold">
                              {Math.round(aiEval.score)}%
                            </Badge>
                          </div>
                        )}
                        {!isViewOnly && !isReevaluating && aiEval?.summary && header.evaluator_note !== aiEval.summary && (
                          <button
                            type="button"
                            onClick={() => setHeader(prev => ({ ...prev, evaluator_note: aiEval.summary }))}
                            className="text-[10px] font-bold text-brand-muted hover:text-brand-highlight underline flex items-center gap-1 cursor-pointer transition-colors"
                            title="Restaurar o parecer geral original sugerido pela IA"
                          >
                            <RotateCcw className="w-2.5 h-2.5" />
                            Restaurar parecer da IA
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Motivos Avaliados nos Confrontos (Melhorias / Falhas Apontadas) */}
                    {aiEval?.improvements && aiEval.improvements.length > 0 && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-1.5 text-xs font-black text-functional-error uppercase tracking-wider">
                          <AlertCircle className="w-3.5 h-3.5" />
                          <span>Motivos Avaliados nos Confrontos / Oportunidades de Melhoria ({aiEval.improvements.length})</span>
                        </div>
                        <div className="grid grid-cols-1 gap-2">
                          {aiEval.improvements.map((imp, idx) => (
                            <div key={idx} className="flex items-start gap-2.5 p-3 rounded-xl bg-functional-error/5 border border-functional-error/15 text-xs">
                              <span className="w-4 h-4 rounded-full bg-functional-error/10 text-functional-error flex items-center justify-center text-[10px] font-black flex-shrink-0 mt-0.5">
                                {idx + 1}
                              </span>
                              <p className="text-brand-primary leading-relaxed font-medium">{imp}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Pontos Fortes Constatados pela IA */}
                    {aiEval?.strengths && aiEval.strengths.length > 0 && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-1.5 text-xs font-black text-functional-success uppercase tracking-wider">
                          <CheckCircle className="w-3.5 h-3.5" />
                          <span>Pontos Fortes Identificados ({aiEval.strengths.length})</span>
                        </div>
                        <div className="grid grid-cols-1 gap-2">
                          {aiEval.strengths.map((st, idx) => (
                            <div key={idx} className="flex items-start gap-2.5 p-3 rounded-xl bg-functional-success/5 border border-functional-success/15 text-xs">
                              <span className="w-4 h-4 rounded-full bg-functional-success/10 text-functional-success flex items-center justify-center text-[10px] font-black flex-shrink-0 mt-0.5">
                                ✓
                              </span>
                              <p className="text-brand-primary leading-relaxed font-medium">{st}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Se for Chamado Filho: Regras e Confrontos do POP v1.1 */}
                    {childAiEval && (
                      <div className="space-y-3 pt-3 border-t border-surface-border">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-black text-brand-primary uppercase tracking-wider">
                              Confronto de Padrão do Chamado Filho
                            </span>
                            <Badge variant={childAiEval.status === 'conforme' ? 'success' : childAiEval.status === 'nao_conforme' ? 'error' : 'warning'}>
                              {childAiEval.status === 'conforme' ? 'Conforme' : childAiEval.status === 'nao_conforme' ? 'Não Conforme' : 'Atenção'}
                            </Badge>
                          </div>
                          {childAiEval.score !== undefined && (
                            <span className="text-xs font-mono font-bold text-brand-muted">
                              Conformidade: {childAiEval.score}%
                            </span>
                          )}
                        </div>

                        {childAiEval.checks && childAiEval.checks.length > 0 && (
                          <div className="grid grid-cols-1 gap-2">
                            {childAiEval.checks.map((chk, idx) => (
                              <div
                                key={idx}
                                className={`p-3 rounded-xl border text-xs flex items-start gap-2.5 ${
                                  chk.passed
                                    ? 'bg-functional-success/5 border-functional-success/20'
                                    : 'bg-functional-error/5 border-functional-error/20'
                                }`}
                              >
                                {chk.passed ? (
                                  <CheckCircle className="w-4 h-4 text-functional-success flex-shrink-0 mt-0.5" />
                                ) : (
                                  <XCircle className="w-4 h-4 text-functional-error flex-shrink-0 mt-0.5" />
                                )}
                                <div className="space-y-0.5 flex-1">
                                  <p className="font-bold text-brand-primary">{chk.rule}</p>
                                  <p className="text-[11px] text-brand-muted leading-relaxed">{chk.details}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {childAiEval.recommendations && childAiEval.recommendations.length > 0 && (
                          <div className="p-3 bg-surface-subtle rounded-xl border border-surface-border space-y-1.5">
                            <p className="text-[10px] font-black uppercase text-brand-muted tracking-wider">Orientações Práticas da IA:</p>
                            <ul className="list-disc list-inside space-y-1 text-xs text-brand-muted">
                              {childAiEval.recommendations.map((rec, idx) => (
                                <li key={idx} className="leading-relaxed">{rec}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Contexto dos Campos do Ticket Utilizados no Confronto */}
                    {Array.isArray((initialData as any)?.ticket_fields) && (initialData as any).ticket_fields.length > 0 && (
                      <div className="pt-3 border-t border-surface-border">
                        <details className="group/ticketFields">
                          <summary className="text-[10px] font-black uppercase text-brand-muted tracking-wider cursor-pointer hover:text-brand-primary flex items-center gap-1">
                            <span>Visualizar dados do formulário Zendesk confrontados ({ (initialData as any).ticket_fields.length } campos)</span>
                          </summary>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2 pt-2">
                            {(initialData as any).ticket_fields.map((f: { title: string; value: string }, idx: number) => (
                              <div key={idx} className="p-2 rounded bg-surface-subtle border border-surface-border text-xs">
                                <span className="font-semibold text-brand-primary block text-[10px]">{f.title}:</span>
                                <span className="text-brand-muted text-[11px]">{f.value || '—'}</span>
                              </div>
                            ))}
                          </div>
                        </details>
                      </div>
                    )}
                  </div>
                )}

                {/* Evidências Documentais do Atendimento (Transcrição Completa do Chamado) */}
                <div className="mt-4 rounded-2xl border border-surface-border bg-surface-card p-6 shadow-premium space-y-4 animate-fade-in">
                  <div className="flex items-center justify-between pb-3 border-b border-surface-border">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-xl bg-brand-highlight/10 text-brand-highlight flex items-center justify-center flex-shrink-0">
                        <MessageSquare className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="text-xs font-black uppercase text-brand-primary tracking-wider">
                          Evidências por Escrito do Atendimento
                        </h4>
                        <p className="text-[10px] text-brand-muted">
                          Transcrição documental das mensagens trocadas no ticket #{header.ticket_id || '—'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {dialogue.length > 0 && (
                        <Badge variant="neutral" size="sm" className="font-mono font-bold text-[10px]">
                          {dialogue.length} {dialogue.length === 1 ? 'mensagem' : 'mensagens'}
                        </Badge>
                      )}
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowStep4Dialogue(prev => !prev)}
                        className="text-xs font-bold cursor-pointer"
                      >
                        {showStep4Dialogue ? 'Ocultar Transcrição' : 'Expandir Transcrição'}
                      </Button>
                    </div>
                  </div>

                  {showStep4Dialogue && (
                    <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1 no-scrollbar animate-fade-in">
                      {loadingDialogue ? (
                        <div className="py-8 text-center text-xs text-brand-muted">
                          Carregando histórico do Helpdesk...
                        </div>
                      ) : dialogue.length === 0 ? (
                        <div className="py-6 text-center text-xs text-brand-muted">
                          Nenhuma mensagem registrada no diálogo deste ticket.
                        </div>
                      ) : (
                        dialogue.map((msg, idx) => {
                          const msgId = `step4_${msg.id || idx}`;
                          return (
                            <TicketMessageBubble
                              key={msg.id || idx}
                              msg={msg}
                              msgId={msgId}
                              isExpanded={!!expandedDialogueMsgIds[msgId]}
                              onToggleExpand={() => toggleDialogueMsgExpand(msgId)}
                              onCite={(text, author) => handleCiteInObservation(text, author)}
                            />
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
              </div>

              {(() => {
                const reevalHistoryEntry = initialData?.history?.find(h => h.action.includes('Reavaliada'));
                const showJustification = isReevaluating || (isViewOnly && !!reevalHistoryEntry);
                if (!showJustification) return null;

                const viewNote = reevalHistoryEntry?.note?.replace(/^\[DE [\d.]+% PARA [\d.]+%\]\s*/, '') || '';

                return (
                  <Card className="bg-brand-subtle/30 border-brand-highlight/20 p-6">
                    <p className="text-[10px] font-black text-brand-muted uppercase tracking-widest mb-3">
                      Justificativa da Reavaliação {isReevaluating && <span className="text-error">*</span>}
                    </p>
                    <textarea
                      value={isViewOnly ? viewNote : header.reevaluation_justification}
                      onChange={e => !isViewOnly && setHeader({...header, reevaluation_justification: e.target.value})}
                      disabled={isViewOnly}
                      className="w-full bg-surface-card border border-surface-border rounded-2xl p-4 text-sm font-medium focus:border-brand-accent focus:outline-none disabled:opacity-70 disabled:cursor-default"
                      placeholder="Explique por que os itens foram alterados..."
                    />
                  </Card>
                );
              })()}

              {initialData?.history && initialData.history.length > 0 && (
                <div className="space-y-6">
                  <div className="flex items-center gap-2 px-1">
                    <History className="w-4 h-4 text-brand-primary" />
                    <h3 className="text-sm font-black text-brand-primary uppercase tracking-widest">Histórico de Interações</h3>
                  </div>
                  <div className="space-y-4">
                    {initialData.history.map((h, i) => (
                      <div key={i} className="flex items-start gap-4 bg-surface-card p-4 rounded-xl border border-surface-border shadow-premium-sm">
                        <div className="w-8 h-8 rounded-xl bg-surface-subtle flex items-center justify-center flex-shrink-0 text-brand-muted">
                          <UserIcon className="w-5 h-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1">
                            <p className="text-xs font-black text-brand-primary uppercase tracking-tight">{h.action}</p>
                            <p className="text-[10px] font-bold text-brand-muted uppercase">{new Date(h.at).toLocaleString('pt-BR')}</p>
                          </div>
                          <p className="text-[10px] font-bold text-brand-muted uppercase mb-3">
                            {(() => {
                              if (user?.role === 'suporte' || user?.role === 'gestor_suporte') {
                                const actor = allUsers.find(u => u.id === h.by_id);
                                if (actor && ['qualidade', 'gestor_qualidade', 'admin'].includes(actor.role)) {
                                  return 'Equipe de Qualidade';
                                }
                              }
                              return h.by_name;
                            })()}
                          </p>
                          {h.note && (
                            <div className="bg-surface-bg/50 rounded-lg p-3 border border-surface-border/50">
                              <p className="text-xs text-brand-primary font-medium italic leading-relaxed">"{h.note}"</p>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-3.5 bg-surface-card border-t border-surface-border flex items-center justify-between flex-shrink-0 z-10">
          <Button variant="ghost" size="sm" onClick={() => setStep(s => Math.max(1, s - 1))} disabled={step === 1} icon={<ChevronLeft className="w-4 h-4 transition-transform duration-200 group-hover:-translate-x-0.5" />}>
            {isViewOnly ? 'Anterior' : 'Voltar'}
          </Button>

          <div className="flex gap-3">
            {step < 4 ? (
              <Button
                size="sm"
                onClick={() => {
                  // Em modo leitura os campos estão desabilitados, então validar
                  // aqui prenderia o usuário: ele não tem como corrigir o que a
                  // validação exige. Registros antigos, ou anteriores à criação
                  // de um novo campo obrigatório, ficavam impossíveis de navegar.
                  if (isViewOnly || validateStep(step)) setStep(s => Math.min(4, s + 1));
                }}
                icon={<ChevronRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-0.5" />}
              >
                {isViewOnly ? 'Próximo' : 'Continuar'}
              </Button>
            ) : isViewOnly ? (
              canSendToHelpdesk && (
                <button
                  type="button"
                  onClick={() => initialData && setHelpdeskModal({ monitoriaId: initialData.id, fromConclusion: false })}
                  className="action-primary group inline-flex items-center justify-center gap-2 px-6 py-2 text-xs font-bold uppercase tracking-wider rounded-lg transition-all duration-200 active:scale-[0.98]"
                >
                  <Send className="w-4 h-4 transition-transform duration-200 group-hover:scale-110" />
                  Enviar ao Zendesk
                </button>
              )
            ) : (
              <Button onClick={handleSave} disabled={isPending} variant="primary" size="sm" className="px-8" icon={<Save className="w-4 h-4 transition-transform duration-200 group-hover:scale-110" />}>
                {isPending ? 'Processando...' : 'Finalizar Monitoria'}
              </Button>
            )}
          </div>
        </div>

        {/* SLIDE-OVER DRAWER: EVIDÊNCIAS POR ESCRITO DO ATENDIMENTO */}
        <AnimatePresence>
          {showDialogueDrawer && (
            <>
              {/* Backdrop overlay for drawer */}
              <m.div
                key="dialogue-drawer-backdrop"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setShowDialogueDrawer(false)}
                className="absolute inset-0 bg-black/40 backdrop-blur-xs z-40"
              />

              {/* Drawer content */}
              <m.div
                key="dialogue-drawer"
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ type: 'spring', damping: 28, stiffness: 280 }}
                className="absolute top-0 right-0 bottom-0 w-full sm:w-[480px] md:w-[540px] bg-surface-card border-l border-surface-border shadow-2xl z-50 flex flex-col overflow-hidden"
              >
                {/* Drawer Header */}
                <div className="p-4 border-b border-surface-border flex items-center justify-between bg-surface-subtle/70">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-brand-highlight/10 text-brand-highlight flex items-center justify-center flex-shrink-0">
                      <MessageSquare className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-black uppercase text-brand-primary tracking-tight">
                        Evidências do Atendimento
                      </h3>
                      <p className="text-[11px] text-brand-muted font-mono">
                        Ticket #{header.ticket_id || '—'} · {dialogue.length} {dialogue.length === 1 ? 'mensagem' : 'mensagens'}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowDialogueDrawer(false)}
                    className="p-1.5 hover:bg-surface-card rounded-lg transition-colors text-brand-muted cursor-pointer"
                    title="Fechar painel"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Selected question target indicator */}
                {selectedQuestionForDialogue && (
                  <div className="px-4 py-2 bg-brand-highlight/10 border-b border-brand-highlight/20 flex items-center justify-between text-xs">
                    <span className="text-brand-highlight font-bold flex items-center gap-1.5 text-[11px]">
                      <Bot className="w-3.5 h-3.5" />
                      <span>Vinculado à observação do critério</span>
                    </span>
                    <button
                      onClick={() => setSelectedQuestionForDialogue(null)}
                      className="text-[10px] text-brand-muted hover:text-brand-primary underline"
                    >
                      Desvincular
                    </button>
                  </div>
                )}

                {/* Search & Filters */}
                <div className="p-3 border-b border-surface-border bg-surface-card space-y-2.5">
                  <div className="relative">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-brand-muted" />
                    <input
                      type="text"
                      value={dialogueSearch}
                      onChange={e => setDialogueSearch(e.target.value)}
                      placeholder="Buscar termos no diálogo (ex.: PDV, erro, webhook)..."
                      className="w-full pl-9 pr-8 py-2 text-xs bg-surface-subtle border border-surface-border rounded-lg text-brand-primary placeholder:text-brand-muted focus:outline-none focus:border-brand-accent"
                    />
                    {dialogueSearch && (
                      <button
                        onClick={() => setDialogueSearch('')}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-brand-muted hover:text-brand-primary"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 no-scrollbar text-[10px]">
                    {(() => {
                      const systemCount = dialogue.filter(d => d.author_role === 'system' && d.is_public).length;
                      const filterList = [
                        { id: 'all', label: `Todas (${dialogue.length})` },
                        { id: 'end_user', label: `Cliente (${dialogue.filter(d => d.author_role === 'end_user').length})` },
                        { id: 'agent', label: `Atendente (${dialogue.filter(d => d.author_role === 'agent' || d.author_role === 'admin').length})` },
                        ...(systemCount > 0 ? [{ id: 'system', label: `Bot / IA (${systemCount})` }] : []),
                        { id: 'internal', label: `Internas (${dialogue.filter(d => !d.is_public).length})` }
                      ];
                      return filterList.map(f => (
                        <button
                          key={f.id}
                          onClick={() => setDialogueFilter(f.id as any)}
                          className={`px-2.5 py-1 rounded-md font-bold uppercase tracking-wider transition-all whitespace-nowrap cursor-pointer ${
                            dialogueFilter === f.id
                              ? 'bg-brand-accent text-white shadow-xs'
                              : 'bg-surface-subtle text-brand-muted hover:text-brand-primary hover:bg-surface-border'
                          }`}
                        >
                          {f.label}
                        </button>
                      ));
                    })()}
                  </div>
                </div>

                {/* Message List */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3.5 no-scrollbar">
                  {loadingDialogue ? (
                    <div className="py-12 text-center space-y-3">
                      <div className="w-8 h-8 border-2 border-brand-accent border-t-transparent rounded-full animate-spin mx-auto" />
                      <p className="text-xs text-brand-muted">Carregando diálogo completo do ticket no Zendesk...</p>
                    </div>
                  ) : filteredDialogue.length === 0 ? (
                    <div className="py-12 text-center space-y-2">
                      <p className="text-xs font-bold text-brand-primary">Nenhuma mensagem encontrada</p>
                      <p className="text-[11px] text-brand-muted">
                        {dialogueSearch ? 'Nenhum trecho corresponde aos termos pesquisados.' : 'Nenhuma mensagem disponível para este ticket.'}
                      </p>
                      {header.ticket_id && (
                        <button
                          onClick={() => {
                            setLoadingDialogue(true);
                            fetchTicketDialogue(header.ticket_id.trim())
                              .then(res => { if (res?.comments) setDialogue(normalizeTicketDialogue(res.comments, evaluatedAgent?.name)); })
                              .finally(() => setLoadingDialogue(false));
                          }}
                          className="mt-2 text-xs font-bold text-brand-highlight hover:underline"
                        >
                          Recarregar mensagens do Helpdesk
                        </button>
                      )}
                    </div>
                  ) : (
                    filteredDialogue.map((msg, idx) => {
                      const msgId = `drawer_${msg.id || idx}`;
                      return (
                        <TicketMessageBubble
                          key={msg.id || idx}
                          msg={msg}
                          msgId={msgId}
                          isExpanded={!!expandedDialogueMsgIds[msgId]}
                          onToggleExpand={() => toggleDialogueMsgExpand(msgId)}
                          onCite={(text, author) => handleCiteInObservation(text, author, selectedQuestionForDialogue || undefined)}
                          hasTargetCriterion={!!selectedQuestionForDialogue}
                        />
                      );
                    })
                  )}
                </div>
              </m.div>
            </>
          )}
        </AnimatePresence>
      </m.div>

      {helpdeskModal && (
        <HelpdeskSendModal
          monitoriaId={helpdeskModal.monitoriaId}
          ticketId={header.ticket_id}
          suggestedOutcome={suggestedOutcome}
          fromConclusion={helpdeskModal.fromConclusion}
          onClose={handleHelpdeskModalClose}
        />
      )}

      {saveSuccessData && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-[10000] p-4 animate-fade-in"
          onClick={() => {}}
        >
          <div onClick={(e: React.MouseEvent) => e.stopPropagation()} className="w-full max-w-lg">
            <Card className="p-6 space-y-4 shadow-2xl border-surface-border">
              <div className="flex items-center justify-between pb-3 border-b border-surface-border">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-functional-success/10 text-functional-success flex items-center justify-center flex-shrink-0">
                    <CheckCircle2 className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-brand-primary">Monitoria Salva no QualiTrack!</h3>
                    <p className="text-[10px] font-semibold text-brand-muted">
                      Ticket #{header.ticket_id} • Score: {score.toFixed(1)}% • {saveSuccessData.outcome === 'positiva' ? 'Válido' : 'Invalidado'}
                    </p>
                  </div>
                </div>
                <Badge variant={saveSuccessData.outcome === 'positiva' ? 'success' : 'error'} size="sm">
                  {saveSuccessData.outcome === 'positiva' ? 'Ticket Válido' : 'Ticket Invalidado'}
                </Badge>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-black text-brand-muted uppercase tracking-widest">
                    Macro Formatada para o Zendesk (Envio Manual)
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(saveSuccessData.macroText);
                      setCopiedSuccessMacro(true);
                      toast.success('Macro copiada para a área de transferência!');
                      setTimeout(() => setCopiedSuccessMacro(false), 2500);
                    }}
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-brand-highlight hover:underline cursor-pointer"
                  >
                    {copiedSuccessMacro ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-functional-success" />
                        <span className="text-functional-success">Copiado!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copiar Macro</span>
                      </>
                    )}
                  </button>
                </div>
                <div className="p-3.5 rounded-xl border border-surface-border bg-surface-subtle text-xs font-mono text-brand-primary whitespace-pre-wrap max-h-56 overflow-y-auto leading-relaxed select-all">
                  {saveSuccessData.macroText}
                </div>
                <p className="text-[10px] text-brand-muted leading-relaxed">
                  O envio automático está suspenso para a fase de testes dos monitores. Cole o texto acima diretamente no ticket do Zendesk como comentário interno/público.
                </p>
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-surface-border gap-2">
                {canSendToHelpdesk && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-[10px] text-brand-muted"
                    onClick={() => {
                      const id = saveSuccessData.monitoriaId;
                      setSaveSuccessData(null);
                      setHelpdeskModal({ monitoriaId: id, fromConclusion: true });
                    }}
                  >
                    Testar Envio via API
                  </Button>
                )}
                <div className="flex items-center gap-2 ml-auto">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      navigator.clipboard.writeText(saveSuccessData.macroText);
                      setCopiedSuccessMacro(true);
                      toast.success('Macro copiada para a área de transferência!');
                      setTimeout(() => setCopiedSuccessMacro(false), 2500);
                    }}
                    icon={copiedSuccessMacro ? <Check className="w-3.5 h-3.5 text-functional-success" /> : <Copy className="w-3.5 h-3.5" />}
                  >
                    {copiedSuccessMacro ? 'Macro Copiada!' : 'Copiar Macro'}
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => {
                      const id = saveSuccessData.monitoriaId;
                      setSaveSuccessData(null);
                      onSaved(id);
                    }}
                    className="font-bold"
                  >
                    Concluir e Fechar
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        </div>
      )}

      {newAgentModalOpen && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => !creatingAgent && setNewAgentModalOpen(false)}
        >
          <div onClick={(e: React.MouseEvent) => e.stopPropagation()} className="w-full max-w-md">
            <Card className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-black text-brand-primary">Cadastrar Agente do Helpdesk</h3>
                <Button variant="ghost" size="sm" onClick={() => setNewAgentModalOpen(false)} disabled={creatingAgent}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
              <p className="text-[11px] font-semibold text-brand-muted">
                Para um atendente do Zendesk que ainda não tem conta formal no QualidadeWP. Cria um registro
                provisório vinculado ao e-mail — quando ele fizer o onboarding com o mesmo e-mail, o histórico
                é herdado automaticamente pela conta definitiva.
              </p>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-brand-muted uppercase tracking-widest ml-1">Nome *</label>
                <input
                  type="text"
                  value={newAgentName}
                  onChange={e => setNewAgentName(e.target.value)}
                  placeholder="Nome completo do agente"
                  disabled={creatingAgent}
                  className="w-full px-3 py-2 rounded-xl border border-surface-border bg-surface-subtle text-sm font-semibold"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-brand-muted uppercase tracking-widest ml-1">E-mail *</label>
                <input
                  type="email"
                  value={newAgentEmail}
                  onChange={e => setNewAgentEmail(e.target.value)}
                  placeholder="agente@empresa.com.br"
                  disabled={creatingAgent}
                  className="w-full px-3 py-2 rounded-xl border border-surface-border bg-surface-subtle text-sm font-semibold"
                />
              </div>
              <div className="flex items-center justify-end gap-2 pt-2">
                <Button variant="ghost" size="sm" onClick={() => setNewAgentModalOpen(false)} disabled={creatingAgent}>
                  Cancelar
                </Button>
                <Button variant="primary" size="sm" onClick={handleCreateAgent} disabled={creatingAgent} className="flex items-center gap-1.5">
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>{creatingAgent ? 'Cadastrando...' : 'Cadastrar e Selecionar'}</span>
                </Button>
              </div>
            </Card>
          </div>
        </div>
      )}
    </div>,
    document.body
  );
}
