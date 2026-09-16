// Fail closed until the operator chooses test recipients or explicitly enables
// all production recipients with '*'. Never redirect somebody else's auth link.
export function emailRecipientAllowed(email: string, configured: string | undefined): boolean {
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)) return false;
  const allowed = configured?.trim();
  if (!allowed) return false;
  return allowed === '*' || allowed.split(',').map(value => value.trim().toLowerCase()).includes(email.toLowerCase());
}

export function canManageIdentity(callerRole: string, targetRole: string): boolean {
  return callerRole === 'admin' || (callerRole === 'gestor_qualidade' && targetRole !== 'admin');
}

export function smtpConfiguration(env: Record<string, string | undefined>) {
  const hostname = env.SMTP_HOSTNAME?.trim() || 'smtp.gmail.com';
  const port = Number(env.SMTP_PORT || '465');
  const username = env.SMTP_USERNAME?.trim();
  const password = env.SMTP_PASSWORD;
  if (!username || !emailRecipientAllowed(username, '*') || !password?.trim()
    || !/^[a-z0-9.-]+$/i.test(hostname) || !Number.isInteger(port) || port < 1 || port > 65535
    || (hostname.toLowerCase() === 'smtp.gmail.com' && port !== 465)) {
    // No credential values in exceptions/logs. This client uses implicit TLS.
    throw new Error('Configuração SMTP inválida');
  }
  return { hostname, port, username, password };
}
