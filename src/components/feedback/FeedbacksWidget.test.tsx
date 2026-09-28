import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { User } from '../../types';
import FeedbacksWidget from './FeedbacksWidget';

const props = {
  feedbacks: [],
  currentUser: { id: 'admin-preview', role: 'admin' } as User,
  users: [],
  teams: [],
  onCreateFeedback: vi.fn(async () => true),
  onAcknowledgeFeedback: vi.fn(async () => true),
  onCompleteFeedback: vi.fn(async () => true),
};

describe('FeedbacksWidget', () => {
  it('shows the agent preview without the feedback creation action', () => {
    render(<FeedbacksWidget {...props} viewRole="suporte" />);

    expect(screen.getByText('Meus Feedbacks & Planos 1:1')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /registrar novo feedback/i })).not.toBeInTheDocument();
    expect(screen.getByText(/Quando seus gestores realizarem sessões de 1:1/i)).toBeInTheDocument();
  });

  it('keeps the creation action for managers', () => {
    render(<FeedbacksWidget {...props} viewRole="gestor_suporte" />);

    expect(screen.getByRole('button', { name: /registrar novo feedback/i })).toBeInTheDocument();
  });
});
