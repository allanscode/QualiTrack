export type UserRole = 'admin' | 'gestor_suporte' | 'gestor_qualidade' | 'qualidade' | 'suporte';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  team_ids?: string[];
  active: boolean;
  must_change_password?: boolean;
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
  team_id: string; 
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
  deadline_at?: string;
  evaluator_note?: string;
  client_contact_log?: string;
  client_contact_success?: boolean;
  question_observations?: Record<string, string>;
  critical_error_observations?: Record<string, string>;
  team_id?: string;
  satisfaction_record_text?: string;
  selected_critical_errors?: string[];
  active?: boolean;
  display_id?: number;
  history: MonitoriaHistoryEntry[];
  created_at: string;
  updated_at: string;
}

export interface Team {
  id: string;
  name: string;
  active: boolean;
  description?: string;
}

export interface AccessRequest {
  id: string;
  name: string;
  email: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
}
