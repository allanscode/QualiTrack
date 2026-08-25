import React, { useEffect, useMemo, useRef, useState } from 'react';
import { User, Monitoria } from '../types';
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
  UserPlus
} from 'lucide-react';
import { m, AnimatePresence, useReducedMotion } from 'motion/react';
import { useQualityConfig } from '../lib/useQualityConfig';
import { toast } from 'sonner';
import { supabase, mockDb, isMockMode } from '../lib/supabase';
import { resolveManualAgent, lookupTicketAgent, TicketAgentLookup } from '../lib/helpdeskQueue';
import { useMonitoriaFormState } from '../hooks/useMonitoriaFormState';
import { useMonitoriaSave } from '../hooks/useMonitoriaSave';
import Card from './ui/Card';
import Button from './ui/Button';
import Badge from './ui/Badge';
import Select from './ui/Select';
import CustomSelect from './ui/CustomSelect';
import CustomDatepicker from './ui/CustomDatepicker';
import HelpdeskSendModal from './HelpdeskSendModal';
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

  // Card do score encolhe ao rolar para baixo na etapa de avaliação, para
  // ocupar menos espaço e não poluir a tela enquanto se responde as perguntas.
  const [scoreCompact, setScoreCompact] = useState(false);
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const onScroll = () => setScoreCompact(el.scrollTop > 40);
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

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
    }
  }, [step]);

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
    // Só agora — com o modal já fechado — o formulário é liberado para
    // fechar. Se chamássemos onSaved antes, o componente pai desmontaria o
    // MonitoriaForm (e o modal, seu filho) antes do auditor ver o preview.
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
      // Envio automático só faz sentido para a conclusão de uma avaliação
      // pelo auditor: em edição administrativa ou reavaliação, o comentário
      // já foi publicado antes e reenviar duplicaria o comentário no ticket
      // real do cliente — esses fluxos continuam só com o botão manual.
      const ticketIdTrimmed = header.ticket_id?.trim() || '';
      const shouldAutoSend = !isMockMode
        && /^\d+$/.test(ticketIdTrimmed)
        && !isAdminEdit
        && !isReevaluating;

      if (shouldAutoSend) {
        setHelpdeskModal({ monitoriaId: savedMonitoriaId, fromConclusion: true });
      } else {
        onSaved(savedMonitoriaId);
      }
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

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 md:p-8 overflow-y-auto">
      <m.div
        initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.98, y: 10 }}
        animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
        className="bg-surface-bg rounded-2xl shadow-2xl w-full max-w-4xl mx-auto flex flex-col overflow-hidden"
        style={{ height: '90vh' }}
      >
        {/* Top Header */}
        <div className="p-6 border-b border-surface-border flex items-center justify-between bg-surface-card">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-brand-subtle flex items-center justify-center text-brand-primary">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xl font-black text-brand-primary tracking-tight uppercase">
                  {isViewOnly ? 'Visualizar' : isAdminEdit ? 'Editar (Admin)' : isReevaluating ? 'Reavaliar' : 'Nova'} Monitoria
                </h2>
                {isViewOnly && (
                  <Badge variant="warning" className="flex items-center gap-1">
                    <Lock className="w-3 h-3" /> Somente leitura
                  </Badge>
                )}
              </div>
              {isViewOnly && (
                <p className="text-[11px] text-brand-muted mt-1.5 max-w-md leading-relaxed">
                  Monitorias salvas não podem ser editadas. Para alterar, use <span className="text-brand-primary font-bold">Reavaliar</span> — disponível quando o suporte contesta.
                </p>
              )}
              {initialData?.display_id && <Badge variant="info" className="mt-1">Mon: {initialData.display_id}</Badge>}
            </div>
          </div>
          <button onClick={onCancel} className="p-2 hover:bg-surface-subtle rounded-xl transition-all text-brand-muted"><X className="w-6 h-6" /></button>
        </div>

        {/* Form Content */}
        <div ref={contentRef} className="flex-1 overflow-y-auto p-8 space-y-10 no-scrollbar">
          {/* Stepper Progress */}
          <div className="flex items-center justify-center gap-6 md:gap-10">
            {[
              { n: 1, label: 'Identificação' },
              { n: 2, label: 'Pesquisa' },
              { n: 3, label: 'Avaliação' },
              { n: 4, label: 'Registro/Log' }
            ].map(s => (
              <div key={s.n} className="flex flex-col items-center gap-1.5 group">
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs font-black transition-all ${step >= s.n ? 'bg-brand-primary text-brand-on-primary shadow-sm' : 'bg-surface-subtle text-brand-muted'}`}>
                  {s.n}
                </div>
                <span className={`text-[9px] font-black uppercase tracking-[0.15em] ${step >= s.n ? 'text-brand-primary' : 'text-brand-muted hidden md:block'}`}>{s.label}</span>
              </div>
            ))}
          </div>

          {step === 1 && (
            <section className="animate-fade-in space-y-8 max-w-4xl mx-auto">
              <div className="text-center mb-8">
                <h3 className="text-xl font-black text-brand-primary uppercase tracking-tight">Dados da Avaliação</h3>
                <p className="text-xs font-bold text-brand-muted uppercase tracking-widest mt-1">Preencha as informações básicas do ticket</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-brand-muted uppercase tracking-widest ml-1">Ficha de Avaliação *</label>
                  <CustomSelect
                    value={header.form_id}
                    onChange={val => setHeader({...header, form_id: val})}
                    options={[{ value: '', label: 'Selecione a ficha...' }, ...forms.map(f => ({ value: f.id, label: f.title }))]}
                    className="w-full"
                    disabled={isViewOnly || isReevaluating}
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
                      Zendesk deste ticket, ainda não cadastrado no QualiTrack. Clique em
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
            </section>
          )}

          {step === 2 && (
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

          {step === 3 && selectedForm && (
            <section className="space-y-10 animate-fade-in max-w-4xl mx-auto">
              {(() => {
                const level = getLevelForScore(score);
                const isTarget = isAboveTarget(score);

                const getSubtleBgClass = (textColor: string) => {
                  if (textColor.includes('excelente')) return 'bg-level-excelente/10 text-level-excelente';
                  if (textColor.includes('aceitavel')) return 'bg-level-aceitavel/10 text-level-aceitavel';
                  if (textColor.includes('atencao')) return 'bg-level-atencao/10 text-level-atencao';
                  if (textColor.includes('ruim')) return 'bg-level-ruim/10 text-level-ruim';
                  if (textColor.includes('roxo')) return 'bg-level-roxo/10 text-level-roxo';
                  return 'bg-brand-subtle/10 text-brand-primary';
                };

                const subtleClass = getSubtleBgClass(level.color);
                const [bgClass, textClass] = subtleClass.split(' ');

                return (
                  // sticky top-0: mantém o score fixo no topo da área de
                  // rolagem enquanto o avaliador desce respondendo as
                  // perguntas, acompanhando a nota subir/descer em tempo real.
                  // z-30 fica acima dos cards de pergunta; bg sólido + shadow
                  // impedem o conteúdo de aparecer atrás ao rolar.
                  <div className={`sticky top-0 z-30 rounded-2xl border border-surface-border flex items-center justify-between bg-surface-card shadow-premium gap-4 transition-all duration-300 ${scoreCompact ? 'flex-row p-3' : 'flex-col sm:flex-row p-6'}`}>
                    <div className="flex items-center gap-4">
                      <div className={`rounded-xl flex items-center justify-center transition-all duration-300 ${bgClass} ${scoreCompact ? 'w-9 h-9' : 'w-12 h-12'}`}>
                        <Target className={`transition-all duration-300 ${textClass} ${scoreCompact ? 'w-4 h-4' : 'w-6 h-6'}`} />
                      </div>
                      <div>
                        {!scoreCompact && (
                          <p className="text-[10px] font-black uppercase text-brand-muted tracking-[0.2em]">Score de Avaliação</p>
                        )}
                        <div className={`flex items-baseline gap-2 ${scoreCompact ? '' : 'mt-1'}`}>
                          <span className={`font-black tabular-nums transition-all duration-300 ${textClass} ${scoreCompact ? 'text-xl' : 'text-3xl'}`}>
                            {score.toFixed(2)}%
                          </span>
                          <span className="text-[10px] font-black text-brand-muted uppercase tracking-wider">
                            - {level.label}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="text-center sm:text-right">
                      <Badge variant={isTarget ? 'success' : 'error'} className={`font-black uppercase tracking-wider ${scoreCompact ? 'px-2.5 py-0.5 text-[9px]' : 'px-3.5 py-1 text-[10px]'}`}>
                        {isTarget ? 'Meta Atingida' : 'Abaixo da Meta'}
                      </Badge>
                      {!scoreCompact && (
                        <p className="text-[9px] font-bold text-brand-muted uppercase tracking-widest mt-1.5">Calculado em tempo real</p>
                      )}
                    </div>
                  </div>
                );
              })()}

              {selectedForm.sections.map((section, sIdx) => (
                <div key={section.id} className="space-y-6">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl bg-brand-primary text-white flex items-center justify-center text-xs font-black">{sIdx + 1}</div>
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
                        <textarea value={observations[q.id] || ''} onChange={e => !isViewOnly && setObservations({...observations, [q.id]: e.target.value})} placeholder="Adicionar observação específica para este item..." className="w-full mt-4 bg-surface-subtle border border-surface-border rounded-lg p-3 text-xs font-medium focus:border-brand-accent focus:outline-none transition-all" disabled={isViewOnly} />
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

          {step === 4 && (
            <section className="space-y-10 animate-fade-in max-w-4xl mx-auto w-full">
              <div className="space-y-4">
                <p className="text-[10px] font-black uppercase text-brand-muted tracking-widest ml-1">Registro do Auditor</p>
                <textarea
                  value={header.evaluator_note}
                  onChange={e => setHeader({...header, evaluator_note: e.target.value})}
                  disabled={isViewOnly || isReevaluating}
                  className="w-full bg-surface-card border border-surface-border rounded-xl p-5 text-xs font-medium min-h-[150px] focus:border-brand-accent focus:outline-none shadow-premium-sm"
                  placeholder="Escreva aqui as observações gerais da auditoria..."
                />
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
        <div className="p-8 bg-surface-card border-t border-surface-border flex items-center justify-between">
          <Button variant="ghost" onClick={() => setStep(s => Math.max(1, s - 1))} disabled={step === 1} icon={<ChevronLeft className="w-4 h-4 transition-transform duration-200 group-hover:-translate-x-0.5" />}>
            {isViewOnly ? 'Anterior' : 'Voltar'}
          </Button>

          <div className="flex gap-4">
            {step < 4 ? (
              <Button
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
                  className="action-primary group inline-flex items-center justify-center gap-2 px-8 py-2.5 text-xs font-bold uppercase tracking-wider rounded-lg transition-all duration-200 active:scale-[0.98]"
                >
                  <Send className="w-4 h-4 transition-transform duration-200 group-hover:scale-110" />
                  Enviar ao Zendesk
                </button>
              )
            ) : (
              <Button onClick={handleSave} disabled={isPending} variant="primary" className="px-12" icon={<Save className="w-4 h-4 transition-transform duration-200 group-hover:scale-110" />}>
                {isPending ? 'Processando...' : 'Finalizar Monitoria'}
              </Button>
            )}
          </div>
        </div>
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
                Para um atendente do Zendesk que ainda não tem conta formal no QualiTrack. Cria um registro
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
    </div>
  );
}
