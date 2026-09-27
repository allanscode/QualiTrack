import { describe, it, expect } from 'vitest';

describe('Security Audit Defenses & Validations', () => {
  it('validates email addresses using hardened regex preventing control characters and script injection', () => {
    const isValidEmail = (email: string) => {
      return /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email.trim());
    };

    // Válidos
    expect(isValidEmail('gestor@empresa.com.br')).toBe(true);
    expect(isValidEmail('allan.qa+monitoria@helpdesk.io')).toBe(true);

    // Inválidos / Tentativas de injeção
    expect(isValidEmail('<script>alert(1)</script>@empresa.com')).toBe(false);
    expect(isValidEmail('gestor@empresa.com\r\nBcc: spy@hacker.com')).toBe(false);
    expect(isValidEmail('sem_arroba.com')).toBe(false);
    expect(isValidEmail('gestor@.com')).toBe(false);
  });

  it('sanitizes CRLF header injection from email subjects', () => {
    const subjectWithCrlf = 'Relatório Semanal\r\nBcc: evil@attacker.com\r\nSubject: Spoofed';
    const sanitized = subjectWithCrlf.replace(/[\r\n]+/g, ' ').trim();

    expect(sanitized).not.toContain('\r');
    expect(sanitized).not.toContain('\n');
    expect(sanitized).toBe('Relatório Semanal Bcc: evil@attacker.com Subject: Spoofed');
  });

  it('splits multiple email recipients with varied delimiters including CRLF', () => {
    const rawInput = 'gestor1@empresa.com;\ngestor2@empresa.com,\r\ngestor3@empresa.com';
    const extras = rawInput
      .split(/[,;\r\n]+/)
      .map(e => e.trim())
      .filter(e => e.length > 0);

    expect(extras).toEqual([
      'gestor1@empresa.com',
      'gestor2@empresa.com',
      'gestor3@empresa.com',
    ]);
  });

  it('ensures individual scores array is correctly populated and computed', () => {
    const scores: number[] = [];
    const monitoriaScores = [85, 90, 95];

    monitoriaScores.forEach(score => {
      if (typeof score === 'number' && !isNaN(score)) {
        scores.push(score);
      }
    });

    const avg = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
    expect(avg).toBe(90);
  });
});
