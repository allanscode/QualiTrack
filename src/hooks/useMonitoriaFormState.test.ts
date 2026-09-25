import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useMonitoriaFormState } from './useMonitoriaFormState';

describe('useMonitoriaFormState', () => {
  it('converte ticket_date ISO para YYYY-MM-DD no fuso de São Paulo', () => {
    const { result } = renderHook(() =>
      useMonitoriaFormState(
        { ticket_date: '2026-09-24T01:30:00Z' } as any,
        [],
        []
      )
    );
    expect(result.current.header.ticket_date).toBe('2026-09-23');
  });

  it('mantém ticket_date se já for YYYY-MM-DD', () => {
    const { result } = renderHook(() =>
      useMonitoriaFormState(
        { ticket_date: '2026-09-20' } as any,
        [],
        []
      )
    );
    expect(result.current.header.ticket_date).toBe('2026-09-20');
  });

  it('usa data atual se ticket_date não for informado', () => {
    const { result } = renderHook(() =>
      useMonitoriaFormState(
        undefined,
        [],
        []
      )
    );
    expect(result.current.header.ticket_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
