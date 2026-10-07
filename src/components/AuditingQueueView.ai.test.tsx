import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AuditingQueueView from './AuditingQueueView';
import type { AuditingQueueTicket, ChildTicketAiEvaluation } from '../types';
import type { ComponentProps } from 'react';
import { CHILD_TICKET_FORM_ID } from '../lib/childTicketForm';
import { useMonitoriaFormState } from '../hooks/useMonitoriaFormState';
import type { EvaluationForm, Monitoria } from '../types';
import type { AIEvaluationDraft } from '../lib/aiDrafts';

const mocks = vi.hoisted(() => ({
  fetchQueueTickets: vi.fn(), evaluateChildTicketWithAI: vi.fn(), completeAIJob: vi.fn(),
  claimAIJob: vi.fn(), cancelAIJob: vi.fn(),
  startNewChild: vi.fn(),
  fetchOpenAIDrafts: vi.fn(), fetchAIDrafts: vi.fn(),
}));
vi.mock('../lib/queueDistribution', async importOriginal => ({
  ...await importOriginal<typeof import('../lib/queueDistribution')>(),
  fetchQueueAssignments: vi.fn().mockImplementation(async (_queue, ids: string[]) => Object.fromEntries(ids.map(id => [id, {
    ticket_id: id, queue_type: 'filhos', assigned_to: 'admin', status: id === '179525' ? 'completed' : 'pending', assignment_source: 'automatic', started_at: null, started_by: null,
  }]))),
  startChildTicketNewEvaluation: mocks.startNewChild,
}));
vi.mock('../lib/supabase', () => ({ supabase: null, isMockMode: true }));
vi.mock('../providers/PresenceProvider', () => ({ usePresence: () => ({ onlineUsers: [] }) }));
vi.mock('../hooks/useQueueUpdateNotice', () => ({ useQueueUpdateNotice: () => ({ hasUpdates: false, rememberPage: vi.fn() }) }));
vi.mock('../lib/helpdeskQueue', async importOriginal => ({
  ...await importOriginal<typeof import('../lib/helpdeskQueue')>(),
  fetchQueueTickets: mocks.fetchQueueTickets,
  evaluateChildTicketWithAI: mocks.evaluateChildTicketWithAI,
  fetchTicketDialogue: vi.fn().mockResolvedValue({ comments: [], ticketFields: [] }),
}));
vi.mock('../lib/aiDrafts', () => ({
  fetchOpenAIDrafts: mocks.fetchOpenAIDrafts, fetchAIDrafts: mocks.fetchAIDrafts,
  saveAIDraft: vi.fn(), deleteAIDraft: vi.fn(), removeAIDraft: vi.fn(),
}));
vi.mock('../lib/aiJobs', () => ({
  fetchAIJobs: vi.fn().mockResolvedValue({}), claimAIJob: mocks.claimAIJob,
  completeAIJob: mocks.completeAIJob, failAIJob: vi.fn(), cancelAIJob: mocks.cancelAIJob,
}));
vi.mock('../lib/aiGuidelines', () => ({
  fetchAIGuidelines: vi.fn().mockResolvedValue([]), DEFAULT_CHILD_TICKET_GUIDELINE: 'Verifique a conformidade.',
}));
vi.mock('./HelpdeskSendModal', () => ({ default: () => null }));

const result: ChildTicketAiEvaluation = {
  detected_type: 'nova_demanda', status: 'conforme', score: 100,
  summary: 'A abertura atende aos requisitos.', checks: [], recommendations: [],
};
const ticket = (id: string): AuditingQueueTicket => ({
  ticket_id: id, subject: `Chamado filho ${id}`, csat_status: 'unrated',
  ticket_date: '2026-10-07T10:00:00Z', status: 'open', child_macro_type: 'nova_demanda',
});
function renderQueue(props: Partial<ComponentProps<typeof AuditingQueueView>> = {}) {
  return render(<AuditingQueueView agents={[]} teams={[]} forms={[]} monitorias={[]}
    currentUserId="admin" currentUserRole="admin" activeSubTab="filhos" onStartAudit={vi.fn()} {...props} />);
}

describe('IA de chamados filhos', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.fetchOpenAIDrafts.mockResolvedValue([]);
    mocks.fetchAIDrafts.mockResolvedValue({});
    mocks.fetchQueueTickets.mockResolvedValue({ tickets: [ticket('101'), ticket('102')], nextCursor: null, hasMore: false });
    mocks.claimAIJob.mockImplementation(async (id: string) => ({ claimed: true, jobId: `job-${id}` }));
    mocks.completeAIJob.mockResolvedValue(undefined);
    mocks.evaluateChildTicketWithAI.mockResolvedValue(result);
    mocks.startNewChild.mockResolvedValue({ ticket_id: '179525', queue_type: 'filhos', assigned_to: 'admin', status: 'in_progress' });
  });
  afterEach(cleanup);

  it.each(['filhos', 'filhos_invalidos'] as const)('abre nova ficha preenchida sem copiar o id anterior em %s', async activeSubTab => {
    const evaluation = { ...result, checks: [{ question_id: 'child-subject-preserved', rule: 'Assunto', passed: false, answer: 'NAO' as const, details: 'Assunto fora do padrão.' }] };
    const onStartAudit = vi.fn();
    const form: EvaluationForm = {
      id: CHILD_TICKET_FORM_ID, title: 'Filhos', description: '', team_id: '', active: true,
      sections: [], createdBy: 'admin', created_at: '2026-10-07T00:00:00Z',
    };
    mocks.fetchQueueTickets.mockResolvedValue({ tickets: [{ ...ticket('179525'), already_audited: true, monitoria_id: 'old', child_evaluation: evaluation }], hasMore: false });
    renderQueue({ activeSubTab, forms: [form], onStartAudit });
    fireEvent.click(await screen.findByRole('button', { name: 'Ver Parecer IA' }, { timeout: 5000 }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Abrir nova ficha com IA' }).at(-1)!);
    await waitFor(() => expect(onStartAudit).toHaveBeenCalledTimes(1));
    const prefill = onStartAudit.mock.calls[0][0];
    expect(prefill.id).toBeUndefined();
    expect(prefill.child_evaluation).toEqual(evaluation);
    const { result: state } = renderHook(() => useMonitoriaFormState({ ...prefill, childAiEvaluation: prefill.child_evaluation } as Monitoria, [form], []));
    expect(state.current.scores['child-subject-preserved']).toBe('NAO');
    expect(state.current.observations['child-subject-preserved']).toBe('Assunto fora do padrão.');
    expect(state.current.header.evaluator_note).toBe(evaluation.summary);
    if (activeSubTab === 'filhos') expect(mocks.startNewChild).toHaveBeenCalledWith('179525');
  });

  it.each(['filhos', 'filhos_invalidos'] as const)('abre a monitoria existente pelo card e parecer em %s sem duplicar', async activeSubTab => {
    const onOpenExistingMonitoria = vi.fn();
    const onStartAudit = vi.fn();
    mocks.fetchQueueTickets.mockResolvedValue({
      tickets: [{ ...ticket('179525'), already_audited: true, monitoria_id: 'existing-monitoria', child_evaluation: result }],
      nextCursor: null, hasMore: false,
    });
    renderQueue({ activeSubTab, onOpenExistingMonitoria, onStartAudit });
    fireEvent.click(await screen.findByRole('button', { name: 'Ver monitoria existente' }, { timeout: 5000 }));
    expect(onOpenExistingMonitoria).toHaveBeenCalledWith('existing-monitoria');
    fireEvent.click(screen.getByRole('button', { name: 'Ver Parecer IA' }));
    expect(await screen.findByText(result.summary)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Abrir ficha de monitoria' })).not.toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: 'Ver monitoria existente' }).at(-1)!);
    expect(onOpenExistingMonitoria).toHaveBeenCalledTimes(2);
    expect(screen.queryByText(result.summary)).not.toBeInTheDocument();
    expect(onStartAudit).not.toHaveBeenCalled();
    expect(mocks.claimAIJob).not.toHaveBeenCalled();
  });

  it('avalia em lote apenas os filhos selecionados e preserva o parecer na fila', async () => {
    renderQueue();
    const choices = await screen.findAllByTitle('Selecionar para avaliação');
    fireEvent.click(choices[1]);
    fireEvent.click(screen.getByRole('button', { name: /Avaliar Selecionados \(1\)/i }));
    await waitFor(() => expect(mocks.completeAIJob).toHaveBeenCalledWith('102', 'job-102', result));
    expect(mocks.evaluateChildTicketWithAI).toHaveBeenCalledTimes(1);
    expect(mocks.claimAIJob).toHaveBeenCalledWith('102', 'chamado_filho', 'admin');
    fireEvent.click(await screen.findByRole('button', { name: 'Ver Parecer IA' }));
    expect(await screen.findByText(result.summary)).toBeInTheDocument();
  });

  it('fecha a janela enquanto a IA trabalha e permite recuperar o resultado', async () => {
    let finish!: (evaluation: ChildTicketAiEvaluation) => void;
    mocks.evaluateChildTicketWithAI.mockImplementation(() => new Promise<ChildTicketAiEvaluation>(resolve => { finish = resolve; }));
    renderQueue();
    fireEvent.click((await screen.findAllByRole('button', { name: 'Conferir com IA' }))[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar Auditoria com IA' }));
    await waitFor(() => expect(mocks.evaluateChildTicketWithAI).toHaveBeenCalledTimes(1));
    const close = screen.getByRole('button', { name: /^Continuar em segundo plano$/ });
    expect(close).toBeEnabled();
    fireEvent.click(close);
    expect(screen.queryByRole('button', { name: /^Continuar em segundo plano$/ })).not.toBeInTheDocument();
    expect(mocks.cancelAIJob).not.toHaveBeenCalled();
    await act(async () => { finish(result); });
    fireEvent.click(await screen.findByRole('button', { name: 'Ver Parecer IA' }));
    expect(await screen.findByText(result.summary)).toBeInTheDocument();
  });

  it('continua o lote inteiro após minimizar a janela de progresso', async () => {
    let finishFirst!: (evaluation: ChildTicketAiEvaluation) => void;
    mocks.evaluateChildTicketWithAI.mockImplementationOnce(() => new Promise<ChildTicketAiEvaluation>(resolve => { finishFirst = resolve; }));
    renderQueue();
    fireEvent.click(await screen.findByRole('button', { name: /Avaliar Página \(2\)/i }));
    await waitFor(() => expect(mocks.evaluateChildTicketWithAI).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: 'Continuar em segundo plano' }));
    expect(screen.getByRole('button', { name: /Lote em andamento/ })).toBeInTheDocument();
    await act(async () => { finishFirst(result); });
    await waitFor(() => expect(mocks.completeAIJob).toHaveBeenCalledTimes(2), { timeout: 3000 });
    expect(mocks.evaluateChildTicketWithAI).toHaveBeenCalledTimes(2);
    expect(await screen.findAllByRole('button', { name: 'Ver Parecer IA' })).toHaveLength(2);
    expect(mocks.cancelAIJob).not.toHaveBeenCalled();
  });
});

describe('revisão persistida das positivas', () => {
  const positiveDraft: AIEvaluationDraft = {
    id: 'draft-positive', ticket_id: '765', created_by: 'gabriel', source_queue: 'positivas',
    form_id: 'positive-form', agent_id: 'agent', channel: 'email', guideline_ids: [],
    created_at: '2026-10-07T10:00:00Z', updated_at: '2026-10-07T10:00:00Z',
    ticket_snapshot: { ...ticket('765'), subject: 'Positiva fechada com falha no atendimento', csat_status: 'good', status: 'closed' },
    result: { score: 74.9, summary: 'Atendimento precisa de revisão.', strengths: [], improvements: [],
      suggested_answers: {}, suggested_observations: {}, suggested_critical_errors: {}, dialogue: [] },
  };
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.fetchQueueTickets.mockResolvedValue({ tickets: [], nextCursor: null, hasMore: false });
    mocks.fetchOpenAIDrafts.mockResolvedValue([positiveDraft]);
    mocks.fetchAIDrafts.mockResolvedValue({ '765': positiveDraft });
  });
  afterEach(cleanup);

  it.each([false, true])('recupera a positiva fechada e abre a ficha salva (Zendesk indisponível: %s)', async unavailable => {
    if (unavailable) mocks.fetchQueueTickets.mockRejectedValue(new Error('Zendesk indisponível'));
    const onStartAudit = vi.fn();
    renderQueue({ activeSubTab: 'positivas', currentUserId: 'gabriel', currentUserRole: 'qualidade', onStartAudit });
    expect(await screen.findByText('Revisão necessária · abaixo de 75%')).toBeInTheDocument();
    expect(screen.getByText('74,9%')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Verificar Avaliação' }));
    await waitFor(() => expect(onStartAudit).toHaveBeenCalledTimes(1));
    expect(onStartAudit).toHaveBeenCalledWith(expect.objectContaining({
      ticket_id: '765', form_id: 'positive-form', evaluated_id: 'agent',
      satisfaction_result: 'Positiva', aiEvaluation: positiveDraft.result, dialogue: [],
    }));
    expect(mocks.claimAIJob).not.toHaveBeenCalled();
    expect(mocks.startNewChild).not.toHaveBeenCalled();
  });
});

describe('revisão automática persistida dos filhos', () => {
  const childResult: ChildTicketAiEvaluation = {
    ...result, score: 0, status: 'nao_conforme', checks: [{ question_id: 'child-subject-preserved', rule: 'Assunto',
      answer: 'NAO', passed: false, details: 'Assunto alterado.' }],
  };
  const childDraft: AIEvaluationDraft = {
    id: 'child-draft', ticket_id: '777', created_by: 'gabriel', source_queue: 'filhos',
    form_id: CHILD_TICKET_FORM_ID, agent_id: 'agent', team_id: 'team', channel: 'email', guideline_ids: [],
    created_at: '2026-10-07T10:00:00Z', updated_at: '2026-10-07T10:00:00Z',
    ticket_snapshot: { ...ticket('777'), status: 'closed' },
    result: { score: 0, summary: 'Conferir filho.', strengths: [], improvements: [],
      suggested_answers: { 'child-subject-preserved': 'NAO' }, suggested_observations: {}, suggested_critical_errors: {},
      child_evaluation: childResult, automatic_child: true, dialogue: [] },
  };
  const childForm: EvaluationForm = {
    id: CHILD_TICKET_FORM_ID, title: 'Filhos', description: '', team_id: '', active: true,
    sections: [{ id: 'section', title: 'Assunto', weight: 100, questions: [{ id: 'child-subject-preserved', text: 'Assunto preservado?', type: 'yes_no_na' }] }],
    createdBy: 'admin', created_at: '2026-10-07T00:00:00Z',
  };
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.fetchQueueTickets.mockRejectedValue(new Error('Zendesk indisponível'));
    mocks.fetchOpenAIDrafts.mockResolvedValue([childDraft]);
    mocks.fetchAIDrafts.mockResolvedValue({ '777': childDraft });
  });
  afterEach(cleanup);

  it('abre o filho fechado com a ficha preenchida mesmo sem job/live view', async () => {
    const onStartAudit = vi.fn();
    renderQueue({ activeSubTab: 'filhos', currentUserId: 'admin', currentUserRole: 'qualidade', forms: [childForm], onStartAudit });
    expect(await screen.findByText('Revisão necessária · abaixo de 75%')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Abrir ficha de monitoria' }));
    await waitFor(() => expect(onStartAudit).toHaveBeenCalledTimes(1));
    const prefill = onStartAudit.mock.calls[0][0];
    expect(prefill).toMatchObject({ ticket_id: '777', form_id: CHILD_TICKET_FORM_ID, evaluated_id: 'agent',
      team_id: 'team', satisfaction_result: 'Sem pesquisa', child_evaluation: childResult, dialogue: [] });
    const { result: state } = renderHook(() => useMonitoriaFormState({ ...prefill, childAiEvaluation: prefill.child_evaluation } as Monitoria, [childForm], []));
    expect(state.current.scores['child-subject-preserved']).toBe('NAO');
    expect(state.current.observations['child-subject-preserved']).toBe('Assunto alterado.');
    expect(mocks.claimAIJob).not.toHaveBeenCalled();
  });

  it('não oferece a revisão salva para monitor que não é o responsável', async () => {
    renderQueue({ activeSubTab: 'filhos', currentUserId: 'other-monitor', currentUserRole: 'qualidade', forms: [childForm] });
    await waitFor(() => expect(mocks.fetchOpenAIDrafts).toHaveBeenCalledWith('filhos'));
    expect(screen.queryByRole('button', { name: 'Abrir ficha de monitoria' })).not.toBeInTheDocument();
  });
});
