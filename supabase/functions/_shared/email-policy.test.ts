import { describe, it, expect } from 'vitest';
import { emailRecipientAllowed, smtpConfiguration, canManageIdentity } from './email-policy';
describe('safe outbound email and identity administration', () => {
  it('blocks unconfigured delivery, allows only exact test recipients', () => {
    expect(emailRecipientAllowed('tester@example.invalid',undefined)).toBe(false);
    expect(emailRecipientAllowed('tester@example.invalid','')).toBe(false);
    expect(emailRecipientAllowed('tester@example.invalid',' Tester@Example.Invalid ')).toBe(true);
    expect(emailRecipientAllowed('other@example.invalid','tester@example.invalid')).toBe(false);
    expect(emailRecipientAllowed('test@example.invalid.attacker','test@example.invalid')).toBe(false);
  });
  it('requires an explicit wildcard to release delivery and rejects header injection', () => {
    expect(emailRecipientAllowed('staff@example.invalid','*')).toBe(true);
    expect(emailRecipientAllowed('staff@example.invalid\r\nBcc:other@example.invalid','*')).toBe(false);
  });
  it('Gmail uses implicit TLS 465 and never exposes the app password in errors', () => {
    const env = { SMTP_USERNAME:'sender@gmail.com', SMTP_PASSWORD:'test-secret' };
    expect(smtpConfiguration(env).port).toBe(465);
    expect(smtpConfiguration(env).hostname).toBe('smtp.gmail.com');
    expect(() => smtpConfiguration({ ...env,SMTP_PORT:'587' })).toThrow('Configuração SMTP inválida');
    expect(() => smtpConfiguration({ ...env,SMTP_PORT:'oops' })).toThrow('Configuração SMTP inválida');
    expect(() => smtpConfiguration({})).toThrow('Configuração SMTP inválida');
  });
  it('quality manager cannot take over an administrator identity', () => {
    expect(canManageIdentity('gestor_qualidade','admin')).toBe(false);
    expect(canManageIdentity('gestor_suporte','suporte')).toBe(false);
    expect(canManageIdentity('gestor_qualidade','suporte')).toBe(true);
    expect(canManageIdentity('admin','admin')).toBe(true);
  });
});
