// Tipos de domínio neutros da integração com helpdesk.
//
// Nenhum tipo específico de provider (Zendesk ou outro) deve aparecer
// aqui. Isso é o que permite trocar de helpdesk sem reescrever a
// função nem a UI: o orquestrador (`index.ts`) só conhece estes tipos,
// e cada implementação de `HelpdeskProvider` traduz para/de sua própria
// API por conta própria (ver `zendesk.ts`).

/** Resultado da avaliação de qualidade, conforme decidido pelo auditor no preview. */
export type EvaluationOutcome = 'positiva' | 'negativa';

/** Corpo da requisição recebida pela Edge Function. */
export interface PublishRequest {
  monitoria_id: string;
  outcome?: EvaluationOutcome;
  dry_run?: boolean;
  force?: boolean;
}

/** Estágio em que uma falha ocorreu, usado pelo frontend para decidir a mensagem/ação. */
export type PublishFailureStage = 'auth' | 'not_found' | 'provider' | 'validation';

export type PublishResult =
  | {
      success: true;
      preview_html: string;
      ticket_id: string;
      /** Ausente quando a chamada foi dry_run. */
      external_comment_id?: string;
    }
  | {
      success: false;
      error: string;
      stage: PublishFailureStage;
    };

/** Dados neutros de conteúdo já prontos para virar HTML — nada de Zendesk aqui. */
export interface EvaluationContent {
  outcome: EvaluationOutcome;
  evaluatorNote: string | null;
  satisfactionRecordText: string | null;
}

/** Entrada para um provider publicar o comentário de avaliação num ticket externo. */
export interface PublishEvaluationInput {
  ticketId: string;
  outcome: EvaluationOutcome;
  htmlBody: string;
}

/**
 * Contrato que qualquer helpdesk (Zendesk hoje, outro amanhã) precisa
 * implementar para receber o comentário de avaliação de qualidade.
 */
export interface HelpdeskProvider {
  readonly name: string;
  publishEvaluation(input: PublishEvaluationInput): Promise<{ externalCommentId: string }>;
}
