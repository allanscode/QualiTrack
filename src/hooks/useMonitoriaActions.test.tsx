import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Monitoria, Team, User } from '../types';
import { useMonitoriaActions } from './useMonitoriaActions';

const db = vi.hoisted(() => ({ update: vi.fn() }));
vi.mock('../lib/supabase', () => ({ supabase: null, mockDb: { update: db.update } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const manager = { id: 'gestor-pj', name: 'Gestor PJ', role: 'gestor_suporte' } as User;
const monitoria = {
  id: 'monitoria-pj', team_id: 'equipe-pj', status: 'pendente_revisao',
  pj_review_required: true, score: 56.25, history: [], action_attachments: [],
} as unknown as Monitoria;
const teams = [{ id: 'equipe-pj', requires_pj_review: true }] as Team[];
const config = {
  action_deadline: { manager_quality: 25 },
  businessHours: { start: '08:00', end: '18:00', days: [1, 2, 3, 4, 5], holidays: [] },
};

describe('useMonitoriaActions: encaminhamento PJ', () => {
  beforeEach(() => {
    db.update.mockReset();
    db.update.mockResolvedValue({ data: null, error: null });
  });

  it.each([
    ['aceitar', 'approval', undefined],
    ['contestar', 'contestation', 'pending'],
  ] as const)('envia %s diretamente à Gestão da Qualidade sem revisor', async (action, kind, resultStatus) => {
    const load = vi.fn();
    const { result } = renderHook(() => useMonitoriaActions(manager, [monitoria], config, load, teams));
    act(() => {
      result.current.setActionModal({ id: monitoria.id, type: action });
      result.current.setActionNote('Parecer justificado do gestor PJ');
    });
    await act(async () => { await result.current.handleAction(); });

    await waitFor(() => expect(load).toHaveBeenCalledOnce());
    expect(db.update).toHaveBeenCalledWith('monitorias', monitoria.id, expect.objectContaining({
      status: 'aguardando_gestor_qualidade',
      pj_reviewer_id: null,
      pj_review_kind: kind,
    }));
    const payload = db.update.mock.calls[0][2];
    expect(payload.contestation_result).toBe(resultStatus);
    expect(payload.history[0].action).toContain('Gestão da Qualidade');
  });
});
