import { describe, expect, it } from 'vitest';
import { childPublicationError, childPublicationText, childPublicationVerdict, CHILD_TICKET_FORM_ID, type ChildPublicationMonitoria } from './child-publication';

const saved: ChildPublicationMonitoria = {
  id: 'a44c404a-ed11-4e29-84e6-c1a76d1b9a44',
  ticket_id: '177882',
  form_id: CHILD_TICKET_FORM_ID,
  score: 80,
  child_verdict: 'valido',
  status: 'concluida',
  active: true,
  evaluator_id: 'auditor-1',
  evaluator_note: 'Critérios do chamado filho conferidos.',
};

describe('publicação de chamados filhos', () => {
  it('exige ficha oficial salva e concluída do mesmo ticket e bloqueia revisão pendente ou nota legada', () => {
    expect(childPublicationError(null, '177882', 'auditor-1', 'qualidade')).toBeTruthy();
    expect(childPublicationError({ ...saved, ticket_id: '177883' }, '177882', 'auditor-1', 'qualidade')).toBeTruthy();
    expect(childPublicationError({ ...saved, form_id: 'outra-ficha' }, '177882', 'auditor-1', 'qualidade')).toBeTruthy();
    expect(childPublicationError({ ...saved, child_verdict: null, status: 'pendente_revisao' }, '177882', 'auditor-1', 'qualidade')).toBeTruthy();
    expect(childPublicationError({ ...saved, status: 'aguardando_gestor_suporte' }, '177882', 'auditor-1', 'qualidade')).toBeTruthy();
    expect(childPublicationError({ ...saved, active: false }, '177882', 'auditor-1', 'qualidade')).toBeTruthy();
    expect(childPublicationError({
      ...saved,
      score: 0,
      child_verdict: null,
      form_snapshot: { legacy_source: 'zendesk_child_note' },
    }, '177882', 'auditor-1', 'qualidade')).toBeTruthy();
  });

  it('restringe o envio do auditor e monta a macro conforme o veredito final (válido ou inválido)', () => {
    expect(childPublicationError(saved, '177882', 'outro-auditor', 'qualidade')).toBeTruthy();
    expect(childPublicationError({ ...saved, evaluator_note: '' }, '177882', 'auditor-1', 'qualidade')).toBeTruthy();
    expect(childPublicationError(saved, '177882', 'auditor-1', 'qualidade')).toBeNull();
    expect(childPublicationVerdict(saved)).toBe('conforme');
    expect(childPublicationText(saved)).toContain('Chamado filho válido.');
    expect(childPublicationText(saved)).toContain(saved.evaluator_note!);
    expect(childPublicationText(saved, true)).toContain('Retificação:');

    const concludedInvalid: ChildPublicationMonitoria = {
      ...saved,
      id: '5db70d8a-77fc-4dea-940a-e6eaf9b822c8',
      ticket_id: '179157',
      score: 92,
      child_verdict: 'invalido',
      evaluator_note: 'Texto padrão da macro alterado e sem evidências técnicas.',
    };
    expect(childPublicationError(concludedInvalid, '179157', 'auditor-1', 'qualidade')).toBeNull();
    expect(childPublicationVerdict(concludedInvalid)).toBe('nao_conforme');
    expect(childPublicationText(concludedInvalid)).toContain('Chamado filho inválido.');
    expect(childPublicationText(concludedInvalid)).toContain(concludedInvalid.evaluator_note!);
  });

  it('recognizes legacy child tickets from their snapshot with an obsolete form id', () => {
    const legacyChild: ChildPublicationMonitoria = {
      ...saved,
      form_id: 'legacy-revenda-form',
      child_verdict: 'invalido',
      form_snapshot: { ticket_kind: 'chamado_filho' },
    };
    expect(childPublicationVerdict(legacyChild)).toBe('nao_conforme');
    expect(childPublicationError(legacyChild, '177882', 'auditor-1', 'qualidade')).toBeNull();
  });
});
