// Única implementação de HelpdeskProvider que conhece o Zendesk: URLs,
// autenticação, IDs de campo e o formato do payload da API do Zendesk.
// Nada daqui deve vazar para `index.ts` além do que a interface
// `HelpdeskProvider` (em `types.ts`) expõe.

import type { HelpdeskProvider, PublishEvaluationInput } from './types.ts';

// Campos customizados do ticket levantados e confirmados diretamente da API de macros do Zendesk:
const FIELD_AVALIACAO_ATENDIMENTO = 47141676348180; // "Avaliação do Atendimento" (positiva / negativa)
const FIELD_ANALISADO = 47422901459476;             // "Analisado" (checkbox: true)
const FIELD_CSAT_VAZIO = 47850817758484;            // "CSAT vazio" (na macro Ticket Invalidado: "critico")

export interface ZendeskConfig {
  subdomain: string;
  email: string;
  apiToken: string;
}

export class ZendeskProvider implements HelpdeskProvider {
  readonly name = 'zendesk';

  constructor(private readonly config: ZendeskConfig, private readonly fetcher?: typeof fetch) {}

  async checkPublicationEligibility(ticketId: string): Promise<{ eligible: boolean; reason?: string }> {
    const response = await (this.fetcher ?? fetch)(`https://${this.config.subdomain}.zendesk.com/api/v2/tickets/${ticketId}.json`, {
      headers: { Authorization: `Basic ${btoa(`${this.config.email}/token:${this.config.apiToken}`)}` },
      signal: AbortSignal.timeout(10000),
    });
    if (response.status === 404) return { eligible: false, reason: 'Ticket não encontrado no Zendesk.' };
    if (!response.ok) throw new Error(`Zendesk retornou ${response.status} ao conferir o ticket.`);
    const data = await response.json();
    const status = String(data?.ticket?.status || '').toLowerCase();
    if (!status) throw new Error('Zendesk não retornou o status do ticket.');
    if (status === 'closed' || status === 'archived') {
      return { eligible: false, reason: 'O ticket está fechado no Zendesk e não aceita a publicação da avaliação. A monitoria permanece salva.' };
    }
    return { eligible: true };
  }

  async publishEvaluation(input: PublishEvaluationInput): Promise<{ externalCommentId: string }> {
    const url = `https://${this.config.subdomain}.zendesk.com/api/v2/tickets/${input.ticketId}.json`;
    const auth = btoa(`${this.config.email}/token:${this.config.apiToken}`);

    const customFields: { id: number; value: any }[] = [
      { id: FIELD_AVALIACAO_ATENDIMENTO, value: input.outcome },
      { id: FIELD_ANALISADO, value: true },
    ];

    // Espelha exatamente a ação da macro oficial "❌ QA | Ticket Invalidado" (ID 47142387357076)
    if (input.outcome === 'negativa') {
      customFields.push({ id: FIELD_CSAT_VAZIO, value: 'critico' });
    }

    const payload = {
      ticket: {
        comment: {
          html_body: input.htmlBody,
          public: false,
        },
        custom_fields: customFields,
      },
    };

    const response = await (this.fetcher ?? fetch)(url, {
      method: 'PUT',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(20000),
    });

    if (!response.ok) {
      throw new Error(
        `Zendesk retornou ${response.status} ao atualizar o ticket.`,
      );
    }

    const data = await response.json();

    // O Zendesk responde 2xx mesmo ignorando um campo (ex.: valor que não bate
    // com a tag da opção do dropdown). Registra para não passar despercebido.
    const returnedFields: { id: number; value: unknown }[] = data?.ticket?.custom_fields ?? [];
    const notApplied = customFields.filter(field =>
      !returnedFields.some(item => item.id === field.id && item.value === field.value));
    if (notApplied.length) {
      // O comentário já foi aceito. Repetir o PUT original publicaria outro;
      // a correção envia somente os campos da macro.
      const updatedStamp = data?.ticket?.updated_at;
      if (typeof updatedStamp !== 'string' || !updatedStamp) {
        throw new Error('Comentário aceito, mas não foi possível conferir os campos da macro.');
      }
      const repairResponse = await (this.fetcher ?? fetch)(url, {
        method: 'PUT',
        headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticket: {
          custom_fields: customFields, safe_update: true, updated_stamp: updatedStamp,
        } }),
        signal: AbortSignal.timeout(20000),
      });
      if (!repairResponse.ok) {
        throw new Error(`Comentário aceito, mas o Zendesk recusou os campos da macro (${repairResponse.status}).`);
      }
      const repaired = await repairResponse.json();
      const stillMissing = customFields.filter(field =>
        !Array.isArray(repaired?.ticket?.custom_fields) ||
        !repaired.ticket.custom_fields.some((item: { id: number; value: unknown }) =>
          item.id === field.id && item.value === field.value));
      if (stillMissing.length) {
        throw new Error(`Comentário aceito, mas o Zendesk não confirmou os campos da macro: ${stillMissing.map(field => field.id).join(', ')}.`);
      }
    }

    const commentId = data?.audit?.events?.find((event: any) => event?.type === 'Comment')?.id;

    if (!commentId) {
      // A atualização foi aceita (2xx) mas não conseguimos extrair o id do
      // comentário do audit trail — não é motivo para tratar como falha,
      // já que o comentário foi de fato publicado no ticket.
      return { externalCommentId: String(data?.audit?.id ?? '') };
    }

    return { externalCommentId: String(commentId) };
  }
}
