// Campos que as macros oficiais do Zendesk "QA | Ticket Válido" e
// "❌ QA | Ticket Invalidado" (ID 47142387357076) aplicam no ticket. Mantidos
// em sincronia com helpdesk-publish-evaluation/zendesk.ts, para que o chamado
// filho saia do mesmo jeito que o chamado de atendimento.
const FIELD_AVALIACAO_ATENDIMENTO = 47141676348180; // "Avaliação do Atendimento" (positiva / negativa)
const FIELD_ANALISADO = 47422901459476;             // "Analisado" (checkbox)
const FIELD_CSAT_VAZIO = 47850817758484;            // "CSAT vazio" (macro Invalidado: "critico")

export function childMacroCustomFields(
  verdict: 'conforme' | 'nao_conforme',
  clearPreviousInvalid = false,
): { id: number; value: string | boolean | null }[] {
  const fields: { id: number; value: string | boolean | null }[] = [
    { id: FIELD_AVALIACAO_ATENDIMENTO, value: verdict === 'conforme' ? 'positiva' : 'negativa' },
    { id: FIELD_ANALISADO, value: true },
  ];
  if (verdict === 'nao_conforme') fields.push({ id: FIELD_CSAT_VAZIO, value: 'critico' });
  if (verdict === 'conforme' && clearPreviousInvalid) fields.push({ id: FIELD_CSAT_VAZIO, value: null });
  return fields;
}

export function hasCriticalChildField(responseFields: unknown): boolean {
  return Array.isArray(responseFields) && responseFields.some(field =>
    field?.id === FIELD_CSAT_VAZIO && field.value === 'critico');
}

// Confere na resposta do PUT se o Zendesk realmente gravou os campos esperados.
export function missingCustomFields(
  responseFields: unknown,
  expected: { id: number; value: string | boolean | null }[],
): number[] {
  const current = Array.isArray(responseFields) ? responseFields : [];
  return expected
    .filter(field => {
      const match = current.find((item: { id?: number }) => item?.id === field.id);
      return field.value === null ? match?.value != null : match?.value !== field.value;
    })
    .map(field => field.id);
}
