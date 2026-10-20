import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from '../../types';
import { getAIAutomationControls, setAIAutomationEnabled } from '../../lib/aiAutomationControls';
import AIAutomationsManagement from './AIAutomationsManagement';

vi.mock('../../lib/aiAutomationControls', () => ({
  getAIAutomationControls: vi.fn(),
  setAIAutomationEnabled: vi.fn(),
}));

const controls = [
  { automation: 'positivas' as const, enabled: true, max_evaluations: null, executions_started: 3, auditor_ready: true, last_error: null, changed_at: null },
  { automation: 'filhos' as const, enabled: false, max_evaluations: null, executions_started: 0, auditor_ready: true, last_error: null, changed_at: null },
];

describe('automation controls', () => {
  afterEach(() => vi.unstubAllEnvs());
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAIAutomationControls).mockResolvedValue(controls);
    vi.mocked(setAIAutomationEnabled).mockResolvedValue();
  });

  it('lets an admin switch each queue independently using the displayed state', async () => {
    render(<AIAutomationsManagement currentUser={{ role: 'admin' } as User} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Desligar avaliação automática de Tickets positivos' }));
    await waitFor(() => expect(setAIAutomationEnabled).toHaveBeenCalledWith('positivas', false, true));
    expect(setAIAutomationEnabled).not.toHaveBeenCalledWith('filhos', expect.anything(), expect.anything());
  });

  it('shows a quality monitor the state without mutation controls', async () => {
    render(<AIAutomationsManagement currentUser={{ role: 'qualidade' } as User} />);
    expect(await screen.findByText('Tickets positivos')).toBeInTheDocument();
    expect(screen.getByText('Somente administradores e gestores de qualidade podem alterar estas automações.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /avaliação automática de Tickets positivos/ })).not.toBeInTheDocument();
  });

  it('shows manual-only mode and hides automation switches on staging', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://secfejmccojxsvdntljx.supabase.co');
    render(<AIAutomationsManagement currentUser={{ role: 'admin' } as User} />);
    expect(await screen.findAllByText('Somente manual')).toHaveLength(2);
    expect(screen.getByText(/automações permanecem bloqueadas no servidor/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /avaliação automática de Tickets positivos/ })).not.toBeInTheDocument();
    expect(setAIAutomationEnabled).not.toHaveBeenCalled();
  });
});
