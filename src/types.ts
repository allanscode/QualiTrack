export type UserRole = 'admin' | 'gestor' | 'analista' | 'tecnico' | 'assistente';

export interface User {
  id: string; // will be email
  name: string;
  email: string;
  role: UserRole;
  teamId?: string;
  active: boolean;
  createdAt: string;
}

export interface Ticket {
  id: string;
  externalId: string;
  subject: string;
  channel: string;
  agentId: string;
  customerName: string;
  ticketDate: string;
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
  teamId: string; // Linked to a specific team
  sections: FormSection[];
  active: boolean;
  createdBy: string;
  createdAt: string;
}

export interface Monitoria {
  id: string;
  ticketId: string;
  auditorId: string;
  agentId: string;
  formId: string;
  scores: { [questionId: string]: number | string | boolean };
  finalScore: number;
  feedback: string;
  status: 'draft' | 'completed';
  createdAt: string;
  updatedAt: string;
}

export interface Team {
  id: string;
  name: string;
  active: boolean;
}

export interface AccessRequest {
  id: string;
  name: string;
  email: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
}
