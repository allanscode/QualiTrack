export type UserRole = 'admin' | 'gestor_suporte' | 'gestor_qualidade' | 'qualidade' | 'suporte';

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Administrador',
  gestor_qualidade: 'Supervisor de Qualidade',
  qualidade: 'Monitor de Qualidade',
  gestor_suporte: 'Supervisor de Atendimento',
  suporte: 'Agente de Atendimento'
};

export interface UserPreferences {
  theme?: 'light' | 'dark' | 'system';
  sidebar_color?: string;
  avatar_url?: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  team_ids?: string[];
  primary_team_id?: string;
  active: boolean;
  must_change_password?: boolean;
  preferences?: UserPreferences;
  /** Identificador do atendente na plataforma de origem (ex.: id do agente no Zendesk). Agnóstico de provider. */
  external_id?: string;
  /** Sistema de origem do vínculo (ex.: "zendesk"). Ausente = conta criada nativamente no QualiTrack. */
  source_system?: string;
  /** true = conta criada automaticamente pela triagem a partir do e-mail do atendente, sem onboarding formal. */
  is_provisional?: boolean;
  created_at: string;
}

export interface UserTeam {
  id: string;
  user_id: string;
  team_id: string;
  created_at: string;
}

export interface Ticket {
  id: string;
  external_id: string;
  subject: string;
  channel: string;
  agent_id: string;
  customer_name: string;
  ticket_date: string;
  status: string;
}

export interface Question {
  id: string;
  text: string;
  description?: string;
  type: 'yes_no_na';
  weight?: number;
  is_critical?: boolean;
}

export interface FormSection {
  id: string;
  title: string;
  weight?: number;
  questions: Question[];
}

export interface EvaluationForm {
  id: string;
  title: string;
  description: string;
  /** @deprecated Mantido por compatibilidade; use team_ids (vínculo N:N via form_teams). */
  team_id: string;
  /** IDs das equipes vinculadas. Vazio/ausente = formulário geral (todas as equipes). */
  team_ids?: string[];
  sections: FormSection[];
  critical_errors?: Question[];
  active: boolean;
  createdBy: string;
  created_at: string;
}

export type MonitoriaStatus =
  | 'pendente_revisao'
  | 'em_contestacao'
  | 'aguardando_gestor_suporte'
  | 'aguardando_gestor_qualidade'
  | 'concluida'
  | 'contestacao_aceita'
  | 'contestacao_negada'
  | 'finalizada_alterada'
  | 'reavaliacao_solicitada';

export interface MonitoriaHistoryEntry {
  action: string;
  by_id: string;
  by_name: string;
  at: string;
  note?: string;
}

export interface Monitoria {
  id: string;
  form_id: string;
  evaluator_id: string;
  evaluated_id: string;
  ticket_id: string;
  channel: 'Chat' | 'Email' | 'Telefone' | 'WhatsApp';
  ticket_date: string;
  analysis_date: string;
  satisfaction_result: 'Positiva' | 'Negativa' | 'Sem pesquisa' | null;
  satisfaction_has_record: boolean;
  answers: Record<string, 'SIM' | 'NAO' | 'NA'>;
  score: number;
  status: MonitoriaStatus;
  contestation_reason?: string;
  action_deadline_at?: string;
  evaluator_note?: string;
  client_contact_log?: string;
  client_contact_success?: boolean;
  question_observations?: Record<string, string>;
  critical_error_observations?: Record<string, string>;
  team_id?: string;
  satisfaction_record_text?: string;
  selected_critical_errors?: string[];
  form_snapshot?: EvaluationForm;
  active?: boolean;
  display_id?: number;
  history: MonitoriaHistoryEntry[];
  dissatisfaction_answers?: Record<string, string[]>;
  resolution_type?: 'human' | 'automatic';
  contestation_result?: 'approved' | 'rejected' | 'pending';
  evaluator_name?: string;
  evaluated_name?: string;
  form_name?: string;
  team_name?: string;
  started_at?: string;
  finished_at?: string;
  concluded_at?: string;
  applied_config?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface Team {
  id: string;
  name: string;
  active: boolean;
  description?: string;
  sigla?: string;
  icon?: string;
}

export interface AccessRequest {
  id: string;
  name: string;
  email: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  rejection_reason?: string;
}

export interface DissatisfactionField {
  id: string;
  title: string;
  type: 'cliente' | 'qualidade';
  options: string[];
  active: boolean;
  created_at: string;
  form_id?: string;
}

// ---------------------------------------------------------------------
// Integração com helpdesk (Fase 1: Zendesk, mas os tipos aqui são
// deliberadamente neutros — nenhum provider específico deve vazar para a
// UI. Ver SPEC-integracao-helpdesk.md: "Tipos de domínio neutros, nunca
// tipos da API do provider vazando para a UI".
// ---------------------------------------------------------------------

/** Provider de helpdesk configurado no backend. Hoje só 'zendesk' existe. */
export type HelpdeskProvider = string;

/** Resultado da avaliação, no vocabulário neutro usado pela Edge Function. */
export type EvaluationOutcome = 'positiva' | 'negativa';

/** Retorno da Edge Function `helpdesk-publish-evaluation`, em dry_run ou não. */
export type PublishResult =
  | { success: true; preview_html: string; ticket_id: string; external_comment_id?: string }
  | { success: false; error: string; stage: 'auth' | 'not_found' | 'provider' | 'validation' };

/** Linha da tabela `helpdesk_submissions` — histórico de tentativas de envio. */
export interface HelpdeskSubmission {
  id: string;
  monitoria_id: string;
  provider: HelpdeskProvider;
  external_ticket_id: string;
  outcome: EvaluationOutcome;
  status: 'sent' | 'failed';
  external_comment_id?: string;
  error_message?: string;
  created_by?: string;
  created_at: string;
}

// ---------------------------------------------------------------------
// Filas de Triagem e Auditoria Inteligente (CSAT Negativas, Proativas e Positivas)
// ---------------------------------------------------------------------

export type AuditingQueueType = 'negativas' | 'proativas' | 'positivas';

export interface AuditingQueueTicket {
  ticket_id: string;
  subject: string;
  requester_name?: string;
  agent_name?: string;
  agent_email?: string;
  agent_id?: string;
  team_id?: string;
  csat_status: 'bad' | 'good' | 'unrated' | 'offered';
  csat_comment?: string;
  channel?: string;
  ticket_date: string;
  status: string;
  url?: string;
  already_audited?: boolean;
  /** true = atendente já atingiu o máximo de 2 avaliações positivas no mês. */
  positive_cap_reached?: boolean;
}

export interface AgentQueueSummary {
  agent_id: string;
  agent_name: string;
  agent_email: string;
  team_name?: string;
  team_id?: string;
  total_audits_month: number;
  ai_audits_month: number;
  last_audited_at?: string;
  days_since_last_audit: number;
  priority_score: number;
}

export interface TicketCommentMessage {
  id: number;
  author_name: string;
  author_role: 'agent' | 'end_user' | 'system';
  created_at: string;
  body: string;
  is_public: boolean;
}

/** Manual de padrões de atendimento usado como contexto extra pela IA. */
export interface AIEvaluationGuideline {
  id: string;
  title: string;
  content: string;
  file_name?: string;
  file_path?: string;
  active: boolean;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface AIEvaluationResult {
  score: number;
  summary: string;
  strengths: string[];
  improvements: string[];
  suggested_answers: Record<string, 'SIM' | 'NAO' | 'NA'>;
  suggested_observations: Record<string, string>;
  suggested_critical_errors: Record<string, boolean>;
}

