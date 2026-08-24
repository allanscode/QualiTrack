// Única implementação de HelpdeskProvider que conhece o Zendesk: URLs,
// autenticação, IDs de campo e o formato do payload da API do Zendesk.
// Nada daqui deve vazar para `index.ts` além do que a interface
// `HelpdeskProvider` (em `types.ts`) expõe.

import type { HelpdeskProvider, PublishEvaluationInput } from './types.ts';

// Campos customizados do ticket (levantados por leitura, confirmados —
// ver SPEC-integracao-helpdesk.md). O campo "CSAT vazio" (47850817758484)
// não é tocado por decisão do dono do processo.
const FIELD_AVALIACAO_ATENDIMENTO = 47141676348180;
const FIELD_ANALISADO = 47422901459476;

export interface ZendeskConfig {
  subdomain: string;
  email: string;
  apiToken: string;
}

export class ZendeskProvider implements HelpdeskProvider {
  readonly name = 'zendesk';

  constructor(private readonly config: ZendeskConfig) {}

  async publishEvaluation(input: PublishEvaluationInput): Promise<{ externalCommentId: string }> {
    const url = `https://${this.config.subdomain}.zendesk.com/api/v2/tickets/${input.ticketId}.json`;
    const auth = btoa(`${this.config.email}/token:${this.config.apiToken}`);

    const payload = {
      ticket: {
        comment: {
          html_body: input.htmlBody,
          public: false,
        },
        custom_fields: [
          { id: FIELD_AVALIACAO_ATENDIMENTO, value: input.outcome },
          { id: FIELD_ANALISADO, value: true },
        ],
      },
    };

    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const bodyText = await response.text().catch(() => '');
      throw new Error(
        `Zendesk retornou ${response.status} ao atualizar o ticket ${input.ticketId}: ${bodyText || response.statusText}`,
      );
    }

    const data = await response.json();
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
