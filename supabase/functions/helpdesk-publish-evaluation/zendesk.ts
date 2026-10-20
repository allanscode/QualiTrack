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

  async checkPublicationEligibility(ticketId: string, options?: { allowFollowUp?: boolean }): Promise<{ eligible: boolean; reason?: string }> {
    const response = await (this.fetcher ?? fetch)(`https://${this.config.subdomain}.zendesk.com/api/v2/tickets/${ticketId}.json`, {
      headers: { Authorization: `Basic ${btoa(`${this.config.email}/token:${this.config.apiToken}`)}` },
      signal: AbortSignal.timeout(10000),
    });
    if (response.status === 404) return { eligible: false, reason: 'Ticket não encontrado no Zendesk.' };
    if (!response.ok) throw new Error(`Zendesk retornou ${response.status} ao conferir o ticket.`);
    const data = await response.json();
    const status = String(data?.ticket?.status || '').toLowerCase();
    if (!status) throw new Error('Zendesk não retornou o status do ticket.');
    if (status === 'closed' && options?.allowFollowUp) return { eligible: true };
    if (status === 'closed' || status === 'archived') {
      return { eligible: false, reason: 'O ticket está fechado no Zendesk e não aceita a publicação da avaliação. A monitoria permanece salva.' };
    }
    return { eligible: true };
  }

  async publishEvaluation(input: PublishEvaluationInput): Promise<{ externalCommentId: string; externalTicketId?: string }> {
    const url = `https://${this.config.subdomain}.zendesk.com/api/v2/tickets/${input.ticketId}.json`;
    const auth = btoa(`${this.config.email}/token:${this.config.apiToken}`);

    const customFields: { id: number; value: any }[] = [
      { id: FIELD_AVALIACAO_ATENDIMENTO, value: input.outcome },
      { id: FIELD_ANALISADO, value: true },
    ];

    // Espelha exatamente a ação da macro oficial "❌ QA | Ticket Invalidado" (ID 47142387357076)
    if (input.outcome === 'negativa') {
      customFields.push({ id: FIELD_CSAT_VAZIO, value: 'critico' });
    } else if (input.clearPreviousInvalid) {
      customFields.push({ id: FIELD_CSAT_VAZIO, value: null });
    }

    const headers = { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' };
    const read = async (targetUrl: string): Promise<Record<string, any>> => {
      const response = await (this.fetcher ?? fetch)(targetUrl, { headers, signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw new Error(`Zendesk retornou ${response.status} na conferência do envio.`);
      return await response.json();
    };
    const current = input.allowFollowUp ? (await read(url)).ticket : null;
    const closed = String(current?.status || '').toLowerCase() === 'closed';
    if (closed && !input.allowFollowUp) throw new Error('Ticket fechado não aceita atualização direta.');
    if (String(current?.status || '').toLowerCase() === 'archived') throw new Error('Ticket arquivado não aceita publicação automática.');
    const marker = input.htmlBody.match(/Monitoria QWP #[0-9a-f-]{36}/i)?.[0];
    const payload = {
      ticket: {
        ...(closed ? {} : {
          comment: {
            html_body: input.htmlBody,
            public: false,
          },
        }),
        custom_fields: customFields,
        ...(typeof current?.updated_at === 'string'
          ? { safe_update: true, updated_stamp: current.updated_at }
          : {}),
      },
    };

    const response = await (this.fetcher ?? fetch)(url, {
      method: 'PUT',
      headers,
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
        headers,
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

    // A 2xx response can precede a failed field update or omit the comment.
    // Read the delivered ticket and its newest comments before saving a receipt.
    const verifiedTicket = (await read(url)).ticket;
    if (customFields.some(field => !Array.isArray(verifiedTicket?.custom_fields)
      || !verifiedTicket.custom_fields.some((item: { id: number; value: unknown }) =>
        item.id === field.id && item.value === field.value))) {
      throw new Error('Zendesk não confirmou os campos da macro após o envio.');
    }
    if (closed) {
      return { externalCommentId: `closed-fields:${input.ticketId}` };
    }
    const comments = (await read(`https://${this.config.subdomain}.zendesk.com/api/v2/tickets/${input.ticketId}/comments.json?sort_order=desc&per_page=100`)).comments;
    const auditCommentId = String(data?.audit?.events?.find((event: { type?: string; id?: number }) => event.type === 'Comment')?.id ?? '');
    const comment = Array.isArray(comments) && comments.find((item: { id?: number; body?: string; html_body?: string; public?: boolean }) =>
      item.public === false && ((auditCommentId && String(item.id) === auditCommentId)
        || (marker && `${item.body || ''} ${item.html_body || ''}`.includes(marker))));
    if (!comment?.id) throw new Error('Zendesk não confirmou o comentário privado da avaliação.');
    return { externalCommentId: String(comment.id) };
  }
}
