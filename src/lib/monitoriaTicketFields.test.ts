import { describe, expect, it } from 'vitest';
import type { Monitoria } from '../types';
import { getSavedZendeskTicketFields, normalizeZendeskTicketFields } from './monitoriaTicketFields';

describe('monitoriaTicketFields', () => {
  it('prioriza o snapshot salvo e descarta campos inválidos', () => {
    const monitoria = { ticket_fields: [{ title: 'Atual', value: 'B' }], form_snapshot: { ticket_fields: [{ title: 'Assunto', value: 'A' }, { title: '', value: 'B' }] } } as Monitoria;
    expect(getSavedZendeskTicketFields(monitoria)).toEqual([{ title: 'Assunto', value: 'A' }]);
    expect(normalizeZendeskTicketFields(null)).toEqual([]);
  });
});
