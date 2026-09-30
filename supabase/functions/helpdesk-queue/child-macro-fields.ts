// Campos que as macros oficiais do Zendesk "QA | Ticket Válido" e
// "❌ QA | Ticket Invalidado" (ID 47142387357076) aplicam no ticket. Mantidos
// em sincronia com helpdesk-publish-evaluation/zendesk.ts, para que o chamado
// filho saia do mesmo jeito que o chamado de atendimento.
const FIELD_AVALIACAO_ATENDIMENTO = 47141676348180; // "Avaliação do Atendimento" (positiva / negativa)
const FIELD_ANALISADO = 47422901459476;             // "Analisado" (checkbox)
const FIELD_CSAT_VAZIO = 47850817758484;            // "CSAT vazio" (macro Invalidado: "critico")

export function childMacroCustomFields(
  verdict: 'conforme' | 'nao_conforme',
): { id: number; value: string | boolean }[] {
  const fields: { id: number; value: string | boolean }[] = [
    { id: FIELD_AVALIACAO_ATENDIMENTO, value: verdict === 'conforme' ? 'positiva' : 'negativa' },
    { id: FIELD_ANALISADO, value: true },
  ];
  if (verdict === 'nao_conforme') fields.push({ id: FIELD_CSAT_VAZIO, value: 'critico' });
  return fields;
}

// Confere na resposta do PUT se o Zendesk realmente gravou os campos esperados.
export function missingCustomFields(
  responseFields: unknown,
  expected: { id: number; value: string | boolean }[],
): number[] {
  const current = Array.isArray(responseFields) ? responseFields : [];
  return expected
    .filter(field => !current.some((item: { id?: number; value?: unknown }) =>
      item?.id === field.id && item.value === field.value))
    .map(field => field.id);
}
