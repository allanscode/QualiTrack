import React, { useRef, useState } from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import {
  useDialogAccessibility,
  _resetModalStackForTesting,
  _getModalStackCount,
} from '../hooks/useDialogAccessibility';

interface TestModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children?: React.ReactNode;
  initialFocusInput?: boolean;
}

function TestModal({ isOpen, onClose, title, children, initialFocusInput }: TestModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { dialogProps } = useDialogAccessibility({
    isOpen,
    onClose,
    dialogRef,
    initialFocusRef: initialFocusInput ? inputRef : undefined,
    ariaLabelledBy: `${title}-title`,
  });

  if (!isOpen) return null;

  return (
    <div ref={dialogRef} {...dialogProps} data-testid={`modal-${title}`}>
      <h2 id={`${title}-title`}>{title}</h2>
      <button type="button" onClick={onClose} aria-label={`Fechar ${title}`}>
        Fechar
      </button>
      <input ref={inputRef} placeholder={`Input ${title}`} />
      {children}
    </div>
  );
}

function NestedModalsContainer() {
  const [modal1Open, setModal1Open] = useState(false);
  const [modal2Open, setModal2Open] = useState(false);

  return (
    <div>
      <button type="button" onClick={() => setModal1Open(true)} data-testid="open-modal-1">
        Abrir Modal 1
      </button>

      <TestModal isOpen={modal1Open} onClose={() => setModal1Open(false)} title="Modal 1">
        <button
          type="button"
          onClick={() => setModal2Open(true)}
          data-testid="open-modal-2"
        >
          Abrir Modal 2 (Aninhado)
        </button>

        <TestModal isOpen={modal2Open} onClose={() => setModal2Open(false)} title="Modal 2">
          <p>Conteúdo do Modal 2</p>
        </TestModal>
      </TestModal>
    </div>
  );
}

describe('useDialogAccessibility hook', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    _resetModalStackForTesting();
    document.body.style.overflow = '';
  });

  afterEach(() => {
    _resetModalStackForTesting();
    vi.useRealTimers();
  });

  it('manages WAI-ARIA role and attributes correctly', () => {
    render(
      <TestModal isOpen={true} onClose={() => {}} title="Acessibilidade" />
    );

    const dialog = screen.getByTestId('modal-Acessibilidade');
    expect(dialog).toHaveAttribute('role', 'dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('aria-labelledby', 'Acessibilidade-title');
  });

  it('locks body scroll when modal opens and restores when closed', () => {
    const { rerender } = render(
      <TestModal isOpen={false} onClose={() => {}} title="ScrollTest" />
    );

    expect(document.body.style.overflow).toBe('');

    rerender(<TestModal isOpen={true} onClose={() => {}} title="ScrollTest" />);
    expect(document.body.style.overflow).toBe('hidden');
    expect(_getModalStackCount()).toBe(1);

    rerender(<TestModal isOpen={false} onClose={() => {}} title="ScrollTest" />);
    expect(document.body.style.overflow).toBe('');
    expect(_getModalStackCount()).toBe(0);
  });

  it('sets initial focus to the specified initialFocusRef or first focusable element', () => {
    render(
      <TestModal
        isOpen={true}
        onClose={() => {}}
        title="FocusTest"
        initialFocusInput={true}
      />
    );

    act(() => {
      vi.advanceTimersByTime(20);
    });

    const input = screen.getByPlaceholderText('Input FocusTest');
    expect(document.activeElement).toBe(input);
  });

  it('calls onClose when Escape key is pressed', () => {
    const handleClose = vi.fn();
    render(<TestModal isOpen={true} onClose={handleClose} title="EscapeTest" />);

    act(() => {
      vi.advanceTimersByTime(20);
    });

    // Simulate Escape keydown
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    window.dispatchEvent(event);

    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('traps focus inside the dialog with Tab and Shift+Tab', () => {
    render(<TestModal isOpen={true} onClose={() => {}} title="TrapTest" />);

    act(() => {
      vi.advanceTimersByTime(20);
    });

    const closeBtn = screen.getByRole('button', { name: /fechar traptest/i });
    const input = screen.getByPlaceholderText('Input TrapTest');

    // Focus last element
    input.focus();
    expect(document.activeElement).toBe(input);

    // Tab on last element wraps around to first element
    const tabEvent = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    window.dispatchEvent(tabEvent);

    expect(document.activeElement).toBe(closeBtn);

    // Shift+Tab on first element wraps around to last element
    const shiftTabEvent = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true });
    window.dispatchEvent(shiftTabEvent);

    expect(document.activeElement).toBe(input);
  });

  it('restores focus to trigger element when dialog closes', () => {
    function Host() {
      const [isOpen, setIsOpen] = useState(false);
      return (
        <div>
          <button type="button" onClick={() => setIsOpen(true)} data-testid="trigger-btn">
            Abrir
          </button>
          <TestModal isOpen={isOpen} onClose={() => setIsOpen(false)} title="RestoreFocus" />
        </div>
      );
    }

    render(<Host />);
    const triggerBtn = screen.getByTestId('trigger-btn');
    triggerBtn.focus();
    expect(document.activeElement).toBe(triggerBtn);

    // Open modal
    act(() => {
      triggerBtn.click();
    });

    act(() => {
      vi.advanceTimersByTime(20);
    });

    expect(_getModalStackCount()).toBe(1);

    // Close modal via close button
    const closeBtn = screen.getByRole('button', { name: /fechar restorefocus/i });
    act(() => {
      closeBtn.click();
    });

    act(() => {
      vi.advanceTimersByTime(20);
    });

    expect(_getModalStackCount()).toBe(0);
    expect(document.activeElement).toBe(triggerBtn);
  });

  it('handles nested modals: scroll lock preserved, Escape only closes topmost modal', () => {
    render(<NestedModalsContainer />);

    const openModal1Btn = screen.getByTestId('open-modal-1');
    act(() => {
      openModal1Btn.click();
    });

    act(() => {
      vi.advanceTimersByTime(20);
    });

    expect(_getModalStackCount()).toBe(1);
    expect(document.body.style.overflow).toBe('hidden');
    expect(screen.getByTestId('modal-Modal 1')).toBeInTheDocument();

    // Open nested Modal 2
    const openModal2Btn = screen.getByTestId('open-modal-2');
    act(() => {
      openModal2Btn.click();
    });

    act(() => {
      vi.advanceTimersByTime(20);
    });

    expect(_getModalStackCount()).toBe(2);
    expect(document.body.style.overflow).toBe('hidden');
    expect(screen.getByTestId('modal-Modal 2')).toBeInTheDocument();

    // Press Escape -> Should ONLY close Modal 2, Modal 1 must stay open
    act(() => {
      const escapeEvent = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
      window.dispatchEvent(escapeEvent);
    });

    act(() => {
      vi.advanceTimersByTime(20);
    });

    expect(_getModalStackCount()).toBe(1);
    // Modal 2 is gone, Modal 1 is still open
    expect(screen.queryByTestId('modal-Modal 2')).not.toBeInTheDocument();
    expect(screen.getByTestId('modal-Modal 1')).toBeInTheDocument();

    // Scroll lock must STILL be active because Modal 1 is still open!
    expect(document.body.style.overflow).toBe('hidden');

    // Press Escape again -> Now Modal 1 closes
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    });

    act(() => {
      vi.advanceTimersByTime(20);
    });

    expect(_getModalStackCount()).toBe(0);
    expect(screen.queryByTestId('modal-Modal 1')).not.toBeInTheDocument();
    expect(document.body.style.overflow).toBe('');
  });
});
