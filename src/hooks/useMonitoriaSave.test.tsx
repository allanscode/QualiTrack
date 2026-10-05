import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useMonitoriaSave } from './useMonitoriaSave';

const db = vi.hoisted(() => ({ insert: vi.fn() }));
vi.mock('../lib/supabase', () => ({
  supabase: { from: () => ({ insert: db.insert }) },
  mockDb: {},
}));
vi.mock('../lib/helpdeskQueue', () => ({ backfillAgentTeam: vi.fn() }));
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
      ticket_group_team_id: 'grupo-revenda', pj_review_required: false,
      resolution_type: 'human',
    });
    expect(payload.history[0].action).toBe('Monitoria Criada e Concluída');
    expect(payload.action_deadline_at).toBeNull();
  });

  it('encaminha uma monitoria PJ abaixo de 75 para a revisão do gestor', async () => {
    const onSaved = vi.fn();
    db.insert.mockImplementation(() => ({ select: () => ({ single: async () => ({ data: { id: 'monitoria-pj' }, error: null }) }) }));
    const { result } = renderHook(() => useMonitoriaSave(pjDeps(74.99, onSaved)));
    act(() => result.current.handleSave());

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith('monitoria-pj', 'pendente_revisao'));
    const payload = db.insert.mock.calls[0][0][0];
    expect(payload.status).toBe('pendente_revisao');
    expect(payload.pj_review_required).toBe(true);
    expect(payload.resolution_type).toBeNull();
    expect(payload.history[0].action).toBe('Monitoria Criada');
    expect(payload.action_deadline_at).toBeTruthy();
  });
});
