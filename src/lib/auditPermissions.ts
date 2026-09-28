export function canAuditTickets(role?: string): boolean {
  return role === 'qualidade' || role === 'gestor_qualidade' || role === 'admin';
}
