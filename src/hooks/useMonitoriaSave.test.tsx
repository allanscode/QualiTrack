import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useMonitoriaSave } from './useMonitoriaSave';

const db = vi.hoisted(() => ({ insert: vi.fn(), update: vi.fn() }));
vi.mock('../lib/supabase', () => ({
  supabase: { from: () => ({ insert: db.insert, update: db.update }) },
  mockDb: {},
}));
vi.mock('../lib/helpdeskQueue', () => ({
  backfillAgentTeam: vi.fn(),
  getZendeskClosureWindow: vi.fn().mockResolvedValue({ applies: false }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

describe('useMonitoriaSave', () => {
  beforeEach(() => vi.clearAllMocks());

  it('salva monitoria concluída sem enviar a coluna concluded_at ausente da base migrada', async () => {
    const onSaved = vi.fn();
    db.insert.mockImplementation(() => ({ select: () => ({ single: async () => ({ data: { id: 'monitoria-1' }, error: null }) }) }));
    const deps = {
      user: { id: 'auditor-1', name: 'Auditor', role: 'qualidade' },
      initialData: undefined,
      isReevaluating: false,
      isAdminEdit: false,
      header: {
        form_id: 'form-1', evaluated_id: 'agente-1', team_id: 'equipe-1', ticket_id: '170445',
        ticket_date: '2026-09-28', channel: 'chat', satisfaction_result: 'Sem pesquisa',
      },
      scores: { pergunta: 'SIM' }, observations: {}, criticalErrors: {}, criticalErrorObservations: {},
      dissatisfactionAnswers: {}, score: 100,
      selectedForm: { id: 'form-1', sections: [{ questions: [{ id: 'pergunta' }] }] },
      qualityConfig: { action_deadline: {}, businessHours: {} },
      allUsers: [{ id: 'agente-1', name: 'Agente PJ', primary_team_id: 'equipe-pj' }],
      forms: [], teams: [{ id: 'equipe-pj', name: 'PJs' }],
      dissatisfactionFields: [], clientFieldsToShow: [], qualityFieldsToShow: [],
      onSaved,
    } as unknown as Parameters<typeof useMonitoriaSave>[0];

    const { result } = renderHook(() => useMonitoriaSave(deps));
    act(() => result.current.handleSave());

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith('monitoria-1', 'concluida'));
    expect(db.insert).toHaveBeenCalledOnce();
    const payload = db.insert.mock.calls[0][0][0];
    expect(payload.status).toBe('concluida');
    expect(payload.team_id).toBe('equipe-pj');
    expect(payload.team_name).toBe('PJs');
    expect(payload.ticket_group_team_id).toBe('equipe-1');
    expect(payload).not.toHaveProperty('concluded_at');
  });

  const pjDeps = (score: number, onSaved: ReturnType<typeof vi.fn>) => ({
      user: { id: 'auditor-1', name: 'Auditor', role: 'qualidade' },
      initialData: undefined,
      isReevaluating: false,
      isAdminEdit: false,
      header: {
        form_id: 'form-1', evaluated_id: 'agente-1', team_id: 'grupo-revenda', ticket_id: '175475',
        ticket_date: '2026-10-05', channel: 'chat', satisfaction_result: 'Sem pesquisa',
      },
      scores: { pergunta: 'SIM' }, observations: {}, criticalErrors: {}, criticalErrorObservations: {},
      dissatisfactionAnswers: {}, score,
      selectedForm: { id: 'form-1', sections: [{ questions: [{ id: 'pergunta' }] }] },
      qualityConfig: { action_deadline: {}, businessHours: {} },
      allUsers: [{ id: 'agente-1', name: 'Agente PJ', primary_team_id: 'equipe-pj' }],
      forms: [], teams: [{ id: 'equipe-pj', name: 'PJ Bruno', requires_pj_review: true }],
      dissatisfactionFields: [], clientFieldsToShow: [], qualityFieldsToShow: [],
      onSaved,
    } as unknown as Parameters<typeof useMonitoriaSave>[0]);

  it('conclui uma monitoria PJ com nota positiva mesmo que o ticket tenha outro grupo', async () => {
    const onSaved = vi.fn();
    db.insert.mockImplementation(() => ({ select: () => ({ single: async () => ({ data: { id: 'monitoria-pj' }, error: null }) }) }));
    const deps = pjDeps(75, onSaved);

    const { result } = renderHook(() => useMonitoriaSave(deps));
    act(() => result.current.handleSave());

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith('monitoria-pj', 'concluida'));
    const payload = db.insert.mock.calls[0][0][0];
    expect(payload).toMatchObject({
      status: 'concluida', team_id: 'equipe-pj', team_name: 'PJ Bruno',
      ticket_group_team_id: 'grupo-revenda',
      resolution_type: 'human',
    });
    expect(payload.history[0].action).toBe('Monitoria Criada e Concluída');
    expect(payload.action_deadline_at).toBeNull();
  });

  it('usa a fila padrão do gestor para nota abaixo de 75 e não cria etapa PJ', async () => {
    const onSaved = vi.fn();
    db.insert.mockImplementation(() => ({ select: () => ({ single: async () => ({ data: { id: 'monitoria-pj' }, error: null }) }) }));
    const { result } = renderHook(() => useMonitoriaSave(pjDeps(74.99, onSaved)));
    act(() => result.current.handleSave());

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith('monitoria-pj', 'aguardando_gestor_suporte'));
    const payload = db.insert.mock.calls[0][0][0];
    expect(payload.status).toBe('aguardando_gestor_suporte');
    expect(payload).not.toHaveProperty('pj_review_required');
    expect(payload.resolution_type).toBeNull();
    expect(payload.history[0].action).toBe('Monitoria Criada e encaminhada ao Gestor de Suporte');
    expect(payload.action_deadline_at).toBeTruthy();
  });

  it.each([
    ['reavaliação', true, false],
    ['edição administrativa', false, true],
  ])('preserva o prazo da monitoria durante %s', async (_, isReevaluating, isAdminEdit) => {
    const onSaved = vi.fn();
    const deadline = '2026-10-15T15:00:00.000Z';
    db.update.mockImplementation(() => ({ eq: async () => ({ error: null }) }));
    const deps = {
      ...pjDeps(60, onSaved),
      initialData: {
        id: 'monitoria-pj', status: 'em_contestacao', score: 55,
        evaluator_note: 'Registro anterior.', action_deadline_at: deadline, history: [], pj_review_required: true,
      },
      isReevaluating, isAdminEdit,
    } as unknown as Parameters<typeof useMonitoriaSave>[0];
    deps.header.reevaluation_justification = 'Justificativa da reavaliação';
    deps.header.evaluator_note = 'Registro revisado para o resultado atual.';
    const { result } = renderHook(() => useMonitoriaSave(deps));
    act(() => result.current.handleSave());

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith('monitoria-pj', isAdminEdit ? 'em_contestacao' : 'aguardando_gestor_suporte'));
    expect(db.update.mock.calls[0][0].action_deadline_at).toBe(deadline);
    if (isAdminEdit) expect(db.update.mock.calls[0][0].history[0].note).toContain('Critério “pergunta”');
  });

  it('impede salvar uma ficha com novo score e Registro do Auditor antigo', () => {
    const onSaved = vi.fn();
    db.update.mockImplementation(() => ({ eq: async () => ({ error: null }) }));
    const deps = {
      ...pjDeps(60, onSaved),
      initialData: {
        id: 'monitoria-pj', status: 'em_contestacao', score: 55,
        evaluator_note: 'Registro antigo com o resultado anterior.', history: [],
      },
      isAdminEdit: true,
    } as unknown as Parameters<typeof useMonitoriaSave>[0];
    deps.header.evaluator_note = 'Registro antigo com o resultado anterior.';

    const { result } = renderHook(() => useMonitoriaSave(deps));
    act(() => result.current.handleSave());

    expect(db.update).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('permite salvar o novo score depois de atualizar o Registro do Auditor', async () => {
    const onSaved = vi.fn();
    db.update.mockImplementation(() => ({ eq: async () => ({ error: null }) }));
    const deps = {
      ...pjDeps(60, onSaved),
      initialData: {
        id: 'monitoria-pj', status: 'em_contestacao', score: 55,
        evaluator_note: 'Registro antigo com o resultado anterior.', history: [],
      },
      isAdminEdit: true,
    } as unknown as Parameters<typeof useMonitoriaSave>[0];
    deps.header.evaluator_note = 'Registro atualizado para o novo resultado.';

    const { result } = renderHook(() => useMonitoriaSave(deps));
    act(() => result.current.handleSave());

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith('monitoria-pj', 'em_contestacao'));
    expect(db.update.mock.calls[0][0].evaluator_note).toBe('Registro atualizado para o novo resultado.');
  });

  it('registra edição feita por gestor de qualidade com a autoria funcional correta', async () => {
    const onSaved = vi.fn();
    db.update.mockImplementation(() => ({ eq: async () => ({ error: null }) }));
    const deps = {
      ...pjDeps(60, onSaved),
      user: { id: 'allan-id', name: 'Allan Simões de Amorim', role: 'gestor_qualidade' },
      initialData: {
        id: 'monitoria-pj', status: 'em_contestacao', score: 60,
        evaluator_note: 'Registro anterior.', action_deadline_at: null,
        history: [], answers: { pergunta: 'NÃO' },
      },
      isAdminEdit: true,
    } as unknown as Parameters<typeof useMonitoriaSave>[0];
    deps.scores.pergunta = 'SIM';
    deps.header.evaluator_note = 'Registro atualizado após revisão de qualidade.';

    const { result } = renderHook(() => useMonitoriaSave(deps));
    act(() => result.current.handleSave());

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith('monitoria-pj', 'em_contestacao'));
    expect(db.update.mock.calls[0][0].history[0]).toMatchObject({
      action: 'Edição pela Gestão da Qualidade',
      by_id: 'allan-id',
      by_name: 'Allan Simões de Amorim',
    });
  });

  it('concludes a quality contest after the quality manager makes the score valid', async () => {
    const onSaved = vi.fn();
    db.update.mockImplementation(() => ({ eq: async () => ({ error: null }) }));
    const deps = {
      ...pjDeps(80, onSaved),
      user: { id: 'quality-manager', name: 'Quality Manager', role: 'gestor_qualidade' },
      initialData: {
        id: 'monitoria-contestada', status: 'aguardando_gestor_qualidade', score: 60,
        evaluator_note: 'Previous record.', action_deadline_at: null,
        history: [], answers: { pergunta: 'NAO' }, contestation_result: 'pending',
      },
      isAdminEdit: true,
      auditorRecordRegenerated: true,
    } as unknown as Parameters<typeof useMonitoriaSave>[0];
    deps.header.evaluator_note = 'New AI record for the updated result.';

    const { result } = renderHook(() => useMonitoriaSave(deps));
    act(() => result.current.handleSave());

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith('monitoria-contestada', 'concluida'));
    expect(db.update.mock.calls[0][0]).toMatchObject({
      status: 'concluida',
      contestation_result: 'approved',
      resolution_type: 'human',
      action_deadline_at: null,
    });
    expect(db.update.mock.calls[0][0].history[0].action).toContain('Contesta');
  });
});
