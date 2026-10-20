import { describe, expect, it } from 'vitest';
import type { Monitoria } from '../types';
import { selectQualityManagerActions } from './qualityManagerQueue';

const row = (id: string, status: string, active = true) => ({ id, status, active } as Monitoria);

describe('selectQualityManagerActions', () => {
  it('includes reanalysis and manager decisions regardless of period', () => {
    const result = selectQualityManagerActions([
      row('reanalysis', 'em_contestacao'),
      row('quality-decision', 'aguardando_gestor_qualidade'),
      row('review', 'pendente_revisao'),
    ]);
    expect(result.map(item => item.id)).toEqual(['reanalysis', 'quality-decision']);
  });

  it('does not show inactive monitorias', () => {
    expect(selectQualityManagerActions([row('inactive', 'em_contestacao', false)])).toEqual([]);
  });
});
