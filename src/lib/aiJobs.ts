import { isMockMode, supabase } from './supabase';
import { AIEvaluationResult, ChildTicketAiEvaluation } from '../types';

export interface AIEvaluationJob {
  ticket_id: string;
  job_id: string;
  evaluation_type: 'atendimento' | 'chamado_filho';
  status: 'running' | 'completed' | 'failed';
  started_by: string;
  result: AIEvaluationResult | ChildTicketAiEvaluation | null;
}

const mockJobs = new Map<string, AIEvaluationJob>();

export async function fetchAIJobs(ticketIds: string[]): Promise<Record<string, AIEvaluationJob>> {
  if (ticketIds.length === 0) return {};
  if (isMockMode || !supabase) {
    return Object.fromEntries(ticketIds.flatMap(id => mockJobs.has(id) ? [[id, mockJobs.get(id)!]] : []));
  }
  const { data, error } = await supabase.from('ai_evaluation_jobs')
    .select('ticket_id, job_id, evaluation_type, status, started_by, result')
    .in('ticket_id', ticketIds);
  if (error) throw new Error(error.message);
  return Object.fromEntries((data as AIEvaluationJob[] || []).map(job => [job.ticket_id, job]));
}

export async function claimAIJob(
  ticketId: string,
  evaluationType: AIEvaluationJob['evaluation_type'],
  userId?: string,
): Promise<{ jobId: string; claimed: boolean }> {
  if (isMockMode || !supabase) {
    if (mockJobs.get(ticketId)?.status === 'running') return { jobId: mockJobs.get(ticketId)!.job_id, claimed: false };
    const jobId = crypto.randomUUID();
    mockJobs.set(ticketId, { ticket_id: ticketId, job_id: jobId, evaluation_type: evaluationType, status: 'running', started_by: userId || '', result: null });
    return { jobId, claimed: true };
  }
  const { data, error } = await supabase.rpc('claim_ai_evaluation_job', {
    p_ticket_id: ticketId, p_evaluation_type: evaluationType,
  });
  if (error) throw new Error(error.message);
  const row = (data || [])[0] as { job_id: string; claimed: boolean } | undefined;
  if (!row) throw new Error('O servidor não retornou o job de IA.');
  return { jobId: row.job_id, claimed: row.claimed };
}

export async function completeAIJob(
  ticketId: string,
  jobId: string,
  result: AIEvaluationResult | ChildTicketAiEvaluation,
): Promise<void> {
  if (isMockMode || !supabase) {
    const job = mockJobs.get(ticketId);
    if (!job || job.job_id !== jobId || job.status !== 'running') throw new Error('Job de IA já concluído.');
    mockJobs.set(ticketId, { ...job, status: 'completed', result });
    return;
  }
  throw new Error('Em produção, somente a Edge Function pode concluir um job de IA.');
}

export async function failAIJob(ticketId: string, jobId: string, message: string): Promise<void> {
  if (isMockMode || !supabase) {
    const job = mockJobs.get(ticketId);
    if (job?.job_id === jobId) mockJobs.set(ticketId, { ...job, status: 'failed' });
    return;
  }
  const { error } = await supabase.rpc('fail_ai_evaluation_job', {
    p_job_id: jobId, p_error: message,
  });
  if (error) throw new Error(error.message);
}
