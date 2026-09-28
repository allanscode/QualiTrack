import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import NewMonitoriaModal from './NewMonitoriaModal';

describe('NewMonitoriaModal', () => {
  it('closes when the backdrop is clicked and stays open for clicks inside', () => {
    const onClose = vi.fn();
    render(
      <NewMonitoriaModal
        isOpen
        onClose={onClose}
        monitorias={[]}
        users={[]}
        teams={[]}
        forms={[]}
        currentUser={null}
        onStartAudit={vi.fn()}
        onViewExistingMonitoria={vi.fn()}
        onOpenBlankForm={vi.fn()}
      />
    );

    const dialog = screen.getByRole('dialog');
    fireEvent.mouseDown(dialog);
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.mouseDown(dialog.parentElement!);
    expect(onClose).toHaveBeenCalledOnce();
  });
});
