// Montagem do HTML do comentário de avaliação a partir dos templates das
// macros do Zendesk ("Ticket Válido" / "Ticket Invalidado") e dos campos
// preenchidos pelo auditor na monitoria.
//
// Importante: este arquivo é TypeScript puro, sem nenhum import de runtime
// (Deno, Supabase, etc). É isso que permite testá-lo com vitest — o
// vitest não sabe rodar `Deno.serve` nem resolver imports de `deno.land`.
// Mantenha essa propriedade ao editar.

import type { EvaluationContent } from './types.ts';

/**
 * Escapa `& < > "` e converte quebras de linha em `<br>`.
 *
 * `evaluator_note` e `satisfaction_record_text` são texto livre digitado
 * pelo auditor. Sem este escape, um `<` no texto quebra a estrutura do
 * comentário no Zendesk (e um `<script>` seria injeção de HTML/XSS
 * armazenado no ticket).
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\r\n/g, '\n')
    .replace(/\n/g, '<br>');
}

// HTML das macros, copiado byte a byte do Zendesk (fonte da verdade do
// template — ver SPEC-integracao-helpdesk.md). Os `<p>&nbsp;</p>` logo
// após cada rótulo são as lacunas que o analista preenchia à mão; é ali
// que entra o conteúdo do QualiTrack.

// Cada rótulo ("Registro do analista:" / "Retorno do cliente:") era seguido
// na macro original por DOIS parágrafos vazios (`<p>&nbsp;</p>`) — a lacuna
// que o analista preenchia à mão. Preservamos os dois: o conteúdo do
// QualiTrack entra no primeiro, o segundo permanece vazio, exatamente como
// no HTML da macro (byte a byte fora da lacuna).

const TEMPLATE_POSITIVA =
  '<p><strong>✅ Ticket validado pela Qualidade</strong><br>&nbsp;</p>' +
  '<p>Após análise realizada pela equipe de Qualidade, identificamos que o chamado atende aos critérios estabelecidos.</p>' +
  '<p>Dessa forma, o ticket foi <strong>validado</strong>.<br>&nbsp;</p>' +
  '<p><strong>Registro do analista:</strong><br>&nbsp;</p>' +
  '<p>{{EVALUATOR_NOTE}}</p>' +
  '<p>&nbsp;</p>' +
  '<p><strong>Retorno do cliente:</strong></p>' +
  '<p>{{SATISFACTION_RECORD}}</p>' +
  '<p>&nbsp;</p>';

const TEMPLATE_NEGATIVA =
  '<p><strong>❌ Ticket invalidado pela Qualidade</strong><br>&nbsp;</p>' +
  '<p>Após análise realizada pela equipe de Qualidade, identificamos que o chamado não atende aos critérios estabelecidos para validação.</p>' +
  '<p>Dessa forma, o ticket foi <strong>invalidado</strong> e seguirá para tratativa do Gestor responsável.<br>&nbsp;</p>' +
  '<p>Orientamos a revisão das informações conforme os padrões definidos.<br>&nbsp;</p>' +
  '<p><strong>Registro do analista:</strong><br>&nbsp;</p>' +
  '<p>{{EVALUATOR_NOTE}}</p>' +
  '<p>&nbsp;</p>' +
  '<p><strong>Retorno do cliente:</strong></p>' +
  '<p>{{SATISFACTION_RECORD}}</p>' +
  '<p>&nbsp;</p>';

/**
 * Monta o HTML do comentário a partir do outcome e dos campos da monitoria.
 *
 * Regra: quando `satisfactionRecordText` é `null` (não havia registro do
 * cliente, `satisfaction_has_record === false`), a lacuna fica vazia — nunca
 * inventamos um texto como "sem registro".
 */
export function buildEvaluationHtml(content: EvaluationContent): string {
  const template = content.outcome === 'positiva' ? TEMPLATE_POSITIVA : TEMPLATE_NEGATIVA;

  const evaluatorNoteHtml = content.evaluatorNote ? escapeHtml(content.evaluatorNote) : '&nbsp;';
  const satisfactionHtml = content.satisfactionRecordText
    ? escapeHtml(content.satisfactionRecordText)
    : '&nbsp;';

  // As substituições usam função em vez de string literal de propósito:
  // com string, o JS interpreta `$&`, `` $` ``, `$'` e `$$` como padrões
  // de substituição. O texto do auditor não passa por escape de `$`, então
  // algo como "custo $$ elevado" sairia corrompido no ticket. A forma de
  // função entrega o valor literal.
  return template
    .replace('{{EVALUATOR_NOTE}}', () => evaluatorNoteHtml)
    .replace('{{SATISFACTION_RECORD}}', () => satisfactionHtml);
}
