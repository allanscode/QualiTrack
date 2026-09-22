import { describe, expect, it } from 'vitest';
import { TicketCommentMessage } from '../types';
import { getDialogueCategory, normalizeTicketDialogue } from './zendeskChatParser';
import { formatTicketDateTime } from './ticketDateTime';
import {
  buildZendeskParticipantRoles, classifyTranscriptMessage,
  parseZendeskChatTranscript, sanitizeDialogue, sanitizeMessageBody,
} from '../../supabase/functions/helpdesk-queue/sanitizer';

describe('papéis obtidos do Zendesk', () => {
  const transcript = '(10:25:00) Cliente Exemplo: Preciso de ajuda\n(10:26:00) Raphaela Serpa: Vou verificar\n(10:27:00) Raphaela Serpa carregou: arquivo.txt';
  const roles = buildZendeskParticipantRoles([
    { name: 'Cliente Exemplo', role: 'end-user' },
    { name: 'Raphaela Serpa', role: 'agent' },
  ]);

  it('usa role da API inclusive para agente transferido e eventos de upload', () => {
    const messages = parseZendeskChatTranscript(transcript, { parentDate: '2026-09-15T10:27:00Z' })
      .map(message => classifyTranscriptMessage(message, roles));
    expect(messages.map(message => message.author_role)).toEqual(['end_user', 'agent', 'agent']);
    expect(messages[1].author_name).toBe('Raphaela Serpa');
    expect(messages[2].author_name).toBe('Raphaela Serpa');
  });

  it('não inventa cliente quando o Zendesk não resolve o papel', () => {
    const message = parseZendeskChatTranscript('(10:25:00) Pessoa: Oi\n(10:26:00) Outra: Olá')[0];
    expect(classifyTranscriptMessage(message, new Map()).author_role).toBe('unknown');
  });

  it('preserva role autoritativo no frontend e separa nota interna dos contadores', () => {
    const comments: TicketCommentMessage[] = [
      { id: 1, author_name: 'Cliente Exemplo', author_role: 'end_user', body: 'Oi', created_at: '2026-09-15T10:25:00Z', is_public: true },
      { id: 2, author_name: 'Raphaela Serpa', author_role: 'agent', body: 'Olá', created_at: '2026-09-15T10:26:00Z', is_public: true },
      { id: 3, author_name: 'Cliente Exemplo', author_role: 'end_user', body: 'Nota', created_at: '2026-09-15T10:27:00Z', is_public: false },
    ];
    const normalized = normalizeTicketDialogue(comments, 'Outro agente');
    expect(normalized.map(getDialogueCategory)).toEqual(['end_user', 'agent', 'internal']);
    expect(normalized.filter(message => getDialogueCategory(message) === 'end_user')).toHaveLength(1);
    expect(normalized.filter(message => getDialogueCategory(message) === 'agent')).toHaveLength(1);
    expect(normalized.filter(message => getDialogueCategory(message) === 'internal')).toHaveLength(1);
  });
});

describe('datas e sanitização do ticket', () => {
  it('formata o mesmo instante em horário de São Paulo', () => {
    expect(formatTicketDateTime('2026-09-15T10:25:00Z')).toBe('15/09/2026, 07:25');
    expect(formatTicketDateTime('2026-09-15T07:25:00-03:00')).toBe('15/09/2026, 07:25');
  });

  it('retira identificadores e segredos antes do prompt e logs', () => {
    const privateBody = 'Contato ana@example.com, CPF 123.456.789-09, senha: segredo123, IP 10.20.30.40';
    const redacted = sanitizeMessageBody(privateBody);
    expect(redacted).not.toContain('ana@example.com');
    expect(redacted).not.toContain('123.456.789-09');
    expect(redacted).not.toContain('segredo123');
    expect(redacted).not.toContain('10.20.30.40');
    const prompt = sanitizeDialogue([
      { author_name: 'Raphaela Serpa', author_role: 'agent', body: privateBody, is_public: true },
    ]);
    expect(prompt).toContain('ATENDENTE 1');
    expect(prompt).not.toContain('Raphaela Serpa');
    expect(prompt).not.toContain('ana@example.com');
  });
});
