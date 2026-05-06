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
  active: boolean;
  createdBy: string;
  created_at: string;
}

export type MonitoriaStatus =
  | 'pendente_revisao'
  | 'em_contestacao'
  | 'aguardando_gestor_suporte'
  | 'aguardando_gestor_qualidade'
  | 'concluida';

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
