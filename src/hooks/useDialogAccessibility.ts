import { useEffect, useId, useRef } from 'react';

export interface UseDialogAccessibilityOptions {
  isOpen: boolean;
  onClose: () => void;
  dialogRef: React.RefObject<HTMLElement | null>;
  initialFocusRef?: React.RefObject<HTMLElement | null>;
  closeOnEscape?: boolean;
  lockScroll?: boolean;
  ariaLabelledBy?: string;
  ariaDescribedBy?: string;
}

interface ModalStackEntry {
  id: string;
  onClose: () => void;
  dialogElement: HTMLElement | null;
  returnFocusElement: HTMLElement | null;
}

// Module-level stack for managing active modal hierarchy and body scroll lock
let modalStack: ModalStackEntry[] = [];
let originalBodyOverflow: string | null = null;

export function _getModalStackCount(): number {
  return modalStack.length;
}

export function _resetModalStackForTesting(): void {
  modalStack = [];
  if (originalBodyOverflow !== null && typeof document !== 'undefined') {
    document.body.style.overflow = originalBodyOverflow;
    originalBodyOverflow = null;
  }
}

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  const selector = [
    'a[href]',
    'button:not([disabled])',
    'textarea:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
  ].join(', ');

  const elements = Array.from(container.querySelectorAll<HTMLElement>(selector));
  return elements.filter(el => {
    if (typeof window === 'undefined') return true;
    const style = window.getComputedStyle ? window.getComputedStyle(el) : null;
    if (style && (style.display === 'none' || style.visibility === 'hidden')) {
      return false;
    }
    return true;
  });
}

export function useDialogAccessibility({
  isOpen,
  onClose,
  dialogRef,
  initialFocusRef,
  closeOnEscape = true,
  lockScroll = true,
  ariaLabelledBy,
  ariaDescribedBy,
}: UseDialogAccessibilityOptions) {
  const modalId = useId();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const returnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    // Capture element currently focused before opening modal
    returnFocusRef.current = (document.activeElement as HTMLElement) || null;

    const entry: ModalStackEntry = {
      id: modalId,
      onClose: () => onCloseRef.current(),
      dialogElement: dialogRef.current,
      returnFocusElement: returnFocusRef.current,
    };

    modalStack.push(entry);

    // Apply scroll lock on first modal open
    if (lockScroll && modalStack.length === 1 && typeof document !== 'undefined') {
      originalBodyOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    }

    // Set initial focus
    const focusTimer = setTimeout(() => {
      if (initialFocusRef?.current) {
        initialFocusRef.current.focus();
      } else if (dialogRef.current) {
        const focusables = getFocusableElements(dialogRef.current);
        if (focusables.length > 0) {
          focusables[0].focus();
        } else {
          dialogRef.current.focus();
        }
      }
    }, 10);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (modalStack.length === 0) return;

      // Only top-most modal handles keyboard events
      const topModal = modalStack[modalStack.length - 1];
      if (topModal.id !== modalId) return;

      // Escape key handling
      if (e.key === 'Escape' && closeOnEscape) {
        e.preventDefault();
        e.stopPropagation();
        onCloseRef.current();
        return;
      }

      // Tab key handling (focus trap)
      if (e.key === 'Tab' && dialogRef.current) {
        const focusables = getFocusableElements(dialogRef.current);
        if (focusables.length === 0) {
          e.preventDefault();
          return;
        }

        const firstElement = focusables[0];
        const lastElement = focusables[focusables.length - 1];
        const currentActive = document.activeElement;

        if (e.shiftKey) {
          if (currentActive === firstElement || !dialogRef.current.contains(currentActive)) {
            e.preventDefault();
            lastElement.focus();
          }
        } else {
          if (currentActive === lastElement || !dialogRef.current.contains(currentActive)) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);

    return () => {
      clearTimeout(focusTimer);
      window.removeEventListener('keydown', handleKeyDown, true);

      // Remove from stack
      modalStack = modalStack.filter(m => m.id !== modalId);

      // Restore scroll lock if no modals remain
      if (lockScroll && modalStack.length === 0 && originalBodyOverflow !== null && typeof document !== 'undefined') {
        document.body.style.overflow = originalBodyOverflow;
        originalBodyOverflow = null;
      }

      // Restore focus to previous element if valid and still connected
      const previousEl = returnFocusRef.current;
      if (previousEl && typeof previousEl.focus === 'function' && document.contains(previousEl)) {
        setTimeout(() => {
          try {
            previousEl.focus();
          } catch {
            // Ignore focus failures on unmounted elements
          }
        }, 10);
      }
    };
  }, [isOpen, modalId, closeOnEscape, lockScroll, dialogRef, initialFocusRef]);

  return {
    dialogProps: {
      role: 'dialog' as const,
      'aria-modal': true as const,
      'aria-labelledby': ariaLabelledBy,
      'aria-describedby': ariaDescribedBy,
      tabIndex: -1,
    },
  };
}
