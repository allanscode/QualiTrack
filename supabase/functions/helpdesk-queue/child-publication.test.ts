import { describe, expect, it } from 'vitest';
import { childPublicationError, childPublicationText, CHILD_TICKET_FORM_ID, type ChildPublicationMonitoria } from './child-publication';

const saved: ChildPublicationMonitoria = {
  id: 'a44c404a-ed11-4e29-84e6-c1a76d1b9a44',
  ticket_id: '177882',
  form_id: CHILD_TICKET_FORM_ID,
  score: 80,
  status: 'concluida',
  active: true,
  evaluator_id: 'auditor-1',
  evaluator_note: 'Critérios do chamado filho conferidos.',
};

describe('publicação de chamados filhos', () => {
  it('exige ficha oficial salva, concluída e válida do mesmo ticket', () => {
    expect(childPublicationError(null, '177882', 'auditor-1', 'qualidade')).toBeTruthy();
    expect(childPublicationError({ ...saved, ticket_id: '177883' }, '177882', 'auditor-1', 'qualidade')).toBeTruthy();
    expect(childPublicationError({ ...saved, form_id: 'outra-ficha' }, '177882', 'auditor-1', 'qualidade')).toBeTruthy();
    expect(childPublicationError({ ...saved, score: 74.99 }, '177882', 'auditor-1', 'qualidade')).toBeTruthy();
    expect(childPublicationError({ ...saved, status: 'pendente_revisao' }, '177882', 'auditor-1', 'qualidade')).toBeTruthy();
    expect(childPublicationError({ ...saved, active: false }, '177882', 'auditor-1', 'qualidade')).toBeTruthy();
  });

  it('restringe o envio do auditor e usa o registro salvo como macro', () => {
    expect(childPublicationError(saved, '177882', 'outro-auditor', 'qualidade')).toBeTruthy();
    expect(childPublicationError({ ...saved, evaluator_note: '' }, '177882', 'auditor-1', 'qualidade')).toBeTruthy();
    expect(childPublicationError(saved, '177882', 'auditor-1', 'qualidade')).toBeNull();
    expect(childPublicationText(saved)).toContain(saved.evaluator_note!);
  });
});
