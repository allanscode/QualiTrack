import type { Monitoria, ZendeskTicketField } from '../types';

export function normalizeZendeskTicketFields(value: unknown): ZendeskTicketField[] {
  if (!Array.isArray(value)) return [];
  return value.filter((field): field is ZendeskTicketField =>
    typeof field === 'object' && field !== null
    && typeof field.title === 'string' && field.title.trim().length > 0
    && typeof field.value === 'string',
  ).map(field => ({ title: field.title.trim(), value: field.value }));
}

export function getSavedZendeskTicketFields(monitoria?: Monitoria): ZendeskTicketField[] {
  return normalizeZendeskTicketFields(monitoria?.form_snapshot?.ticket_fields || monitoria?.ticket_fields);
}
