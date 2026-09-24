const ticketDateTimeFormatter = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  day: '2-digit', month: '2-digit', year: 'numeric',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

export function formatTicketDateTime(value?: string | null): string {
  if (!value) return '—';
  // A legacy date-only value has no time zone or hour; do not invent one.
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-');
    return `${day}/${month}/${year}`;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : ticketDateTimeFormatter.format(date);
}

/**
 * Converte data/timestamp UTC para YYYY-MM-DD no fuso de São Paulo.
 * Evita o bug onde '2026-09-24T00:30:00Z' (21:30 do dia 23 em SP) viraria dia 24 com slice(0,10).
 */
export function toTicketDateInput(value?: string | null): string {
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}
