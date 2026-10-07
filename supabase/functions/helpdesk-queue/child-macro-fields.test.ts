import { describe, expect, it } from 'vitest';
import { childMacroCustomFields, hasCriticalChildField, missingCustomFields } from './child-macro-fields';

describe('childMacroCustomFields', () => {
  it('conforme age como a macro QA Ticket Válido', () => {
    const fields = childMacroCustomFields('conforme');
    expect(fields).toEqual([
      { id: 47141676348180, value: 'positiva' },
      { id: 47422901459476, value: true },
    ]);
  });

  it('nao_conforme age como a macro QA Ticket Invalidado', () => {
    const fields = childMacroCustomFields('nao_conforme');
    expect(fields).toEqual([
      { id: 47141676348180, value: 'negativa' },
      { id: 47422901459476, value: true },
      { id: 47850817758484, value: 'critico' },
    ]);
  });

  it('retifica o marcador crítico herdado da macro inválida', () => {
    const prior = [{ id: 47850817758484, value: 'critico' }];
    expect(hasCriticalChildField(prior)).toBe(true);
    const fields = childMacroCustomFields('conforme', hasCriticalChildField(prior));
    expect(fields).toContainEqual({ id: 47850817758484, value: null });
    expect(missingCustomFields([{ id: 47141676348180, value: 'positiva' }, { id: 47422901459476, value: true }], fields)).toEqual([]);
  });
});

describe('missingCustomFields', () => {
  it('lista os campos que o Zendesk não gravou', () => {
    const expected = childMacroCustomFields('nao_conforme');
    const response = [{ id: 47141676348180, value: 'negativa' }, { id: 47422901459476, value: false }];
    expect(missingCustomFields(response, expected)).toEqual([47422901459476, 47850817758484]);
  });
});
