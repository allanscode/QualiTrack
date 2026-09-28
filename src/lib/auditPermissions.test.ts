import { describe, expect, it } from 'vitest';
import { canAuditTickets } from './auditPermissions';

describe('audit permissions', () => {
  it('allows quality roles while keeping support management read-only', () => {
    expect(canAuditTickets('qualidade')).toBe(true);
    expect(canAuditTickets('gestor_qualidade')).toBe(true);
    expect(canAuditTickets('admin')).toBe(true);
    expect(canAuditTickets('gestor_suporte')).toBe(false);
    expect(canAuditTickets('suporte')).toBe(false);
  });
});
