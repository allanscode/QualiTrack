import { describe, it, expect } from 'vitest';
import { getPresetDateRange, detectActivePreset } from './dashboardDatePresets';

describe('dashboardDatePresets (WQ-21)', () => {
  const refDate = new Date('2026-09-25T15:00:00-03:00');

  it('deve gerar intervalo para "dia" (mesma data inicial e final)', () => {
    const range = getPresetDateRange('dia', refDate);
    expect(range.startDate).toBe('2026-09-25');
    expect(range.endDate).toBe('2026-09-25');
  });

  it('deve gerar intervalo para "mes" (do 1º ao último dia do mês)', () => {
    const range = getPresetDateRange('mes', refDate);
    expect(range.startDate).toBe('2026-09-01');
    expect(range.endDate).toBe('2026-09-30');
  });

  it('deve tratar fevereiro em ano bissexto para "mes"', () => {
    const leapDate = new Date('2028-02-15T12:00:00-03:00');
    const range = getPresetDateRange('mes', leapDate);
    expect(range.startDate).toBe('2028-02-01');
    expect(range.endDate).toBe('2028-02-29');
  });

  it('deve gerar intervalo para "ano" (de 01/01 a 31/12)', () => {
    const range = getPresetDateRange('ano', refDate);
    expect(range.startDate).toBe('2026-01-01');
    expect(range.endDate).toBe('2026-12-31');
  });

  it('deve detectar o preset ativo corretamente', () => {
    expect(detectActivePreset('2026-09-25', '2026-09-25', refDate)).toBe('dia');
    expect(detectActivePreset('2026-09-01', '2026-09-30', refDate)).toBe('mes');
    expect(detectActivePreset('2026-01-01', '2026-12-31', refDate)).toBe('ano');
  });

  it('deve retornar null para intervalo customizado (sem conflitar com botões)', () => {
    expect(detectActivePreset('2026-09-10', '2026-09-20', refDate)).toBeNull();
    expect(detectActivePreset('2026-08-01', '2026-09-25', refDate)).toBeNull();
    expect(detectActivePreset(undefined, undefined, refDate)).toBeNull();
  });
});
