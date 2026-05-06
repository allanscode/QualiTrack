export type UserRole = 'admin' | 'gestor' | 'analista' | 'tecnico' | 'assistente';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  team_id?: string;
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

export interface Monitoria {
  id: string;
  ticket_id: string;
  evaluator_id: string;
  evaluated_id: string;
  form_id: string;
  answers: { [questionId: string]: number | string | boolean };
  score: number;
  feedback: string;
  status: 'draft' | 'completed';
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
