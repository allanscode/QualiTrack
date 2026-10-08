import { incompleteResponse } from './ai-fallback.ts';
import { calculateCanonicalQualityScore } from './quality-score.ts';

export const CHILD_QUESTION_IDS = [
  'child-subject-preserved', 'child-parent-linked', 'child-macro-preserved',
  'child-macro-enriched', 'child-routing-correct',
];

export interface ChildCreationRoutingEvidence {
  creatorId: number;
  initialAssigneeId: number;
  initialGroupId: number | null;
  selfAssigned: boolean;
}

function positiveId(value: unknown): number | null {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

/** The first Zendesk audit records the recipient selected when the child was opened. */
export function childCreationRoutingEvidence(body: unknown): ChildCreationRoutingEvidence | null {
  if (!body || typeof body !== 'object' || !('audits' in body) || !Array.isArray(body.audits)) return null;
  for (const item of body.audits) {
    if (!item || typeof item !== 'object' || !Array.isArray(item.events)) continue;
    const creatorId = positiveId(item.author_id);
    const created = item.events.filter((event: unknown) => event && typeof event === 'object'
      && 'type' in event && event.type === 'Create');
    if (!created.length) continue;
    const field = (name: string): unknown => created.find((event: { field_name?: string }) => event.field_name === name)?.value;
    const initialAssigneeId = positiveId(field('assignee_id'));
    if (!creatorId || !initialAssigneeId) return null;
    const initialGroupId = positiveId(field('group_id'));
    return { creatorId, initialAssigneeId, initialGroupId, selfAssigned: creatorId === initialAssigneeId };
  }
  return null;
}

type ChildAnswer = 'SIM' | 'NAO' | 'NA';
type ChildEvaluation = {
  detected_type: string;
  status: 'conforme' | 'nao_conforme' | 'atencao';
  score: number;
  summary: string;
  checks: Array<{ question_id: string; answer: ChildAnswer; passed: boolean; details: string; rule: string }>;
  recommendations: string[];
};

const CHILD_DEFAULT_SCORE_SECTIONS = [
  { weight: 35, questions: [{ id: 'child-subject-preserved', is_critical: true }, { id: 'child-parent-linked' }] },
  { weight: 40, questions: [{ id: 'child-macro-preserved', is_critical: true }, { id: 'child-macro-enriched' }] },
  { weight: 25, questions: [{ id: 'child-routing-correct' }] },
];

/** The opening audit, not the current group label, determines Nova Demanda routing. */
export function reconcileNovaDemandaRouting<T extends ChildEvaluation>(
  result: T,
  evidence: ChildCreationRoutingEvidence | null,
  sections?: Array<{ weight?: number; questions?: Array<{ id: string; is_critical?: boolean }> }>,
): T {
  if (!evidence || result.detected_type !== 'nova_demanda') return result;
  const routing = result.checks.find(check => check.question_id === 'child-routing-correct');
  const expectedAnswer = evidence.selfAssigned ? 'SIM' : 'NAO';
  if (!routing || routing.answer === expectedAnswer) return result;

  const checks = result.checks.map(check => check.question_id === 'child-routing-correct'
    ? { ...check, answer: expectedAnswer, passed: evidence.selfAssigned,
      details: evidence.selfAssigned
        ? 'O histórico de criação do Zendesk confirma que o analista abriu o chamado filho e o atribuiu a si mesmo. O grupo exibido identifica a equipe desse destinatário; não representa encaminhamento para outra pessoa.'
        : 'O histórico de criação do Zendesk mostra que o destinatário inicial era outro usuário, diferente do analista que abriu a Nova Demanda.' }
    : check);
  const answers = Object.fromEntries(checks.map(check => [check.question_id, check.answer])) as Record<string, ChildAnswer>;
  const score = calculateCanonicalQualityScore(sections?.length ? sections : CHILD_DEFAULT_SCORE_SECTIONS, answers);
  const status = checks.some(check => check.answer === 'NAO') ? 'nao_conforme'
    : checks.some(check => check.answer === 'NA') ? 'atencao' : 'conforme';
  const summary = evidence.selfAssigned
    ? status === 'conforme'
      ? 'Os cinco critérios da abertura estão conformes. O histórico de criação do Zendesk confirma a autoatribuição ao analista na macro Nova Demanda.'
      : 'O histórico de criação do Zendesk confirma a autoatribuição na macro Nova Demanda. Confira os demais critérios apontados no parecer.'
    : 'O histórico de criação do Zendesk mostra que a Nova Demanda foi atribuída a outro usuário. Confira os demais critérios apontados no parecer.';
  return { ...result, checks, score, status, summary,
    recommendations: status === 'conforme' ? [] : ['Conferir os demais critérios apontados no parecer.'] };
}

export function validateChildEvaluationResponse(value: unknown): any {
  if (!value || typeof value !== 'object' || Array.isArray(value)) incompleteResponse('O parecer do chamado filho não é um objeto JSON.');
  const parsed = value as Record<string, any>;
  if (!['nova_demanda', 'analise_tecnica', 'apoio_tecnico', 'produtividade', 'desconhecido'].includes(parsed.detected_type)) {
    incompleteResponse('O parecer não contém detected_type válido.');
  }
  if (!['conforme', 'nao_conforme', 'atencao'].includes(parsed.status)) incompleteResponse('O parecer não contém status válido.');
  if (!Number.isFinite(parsed.score) || parsed.score < 0 || parsed.score > 100) incompleteResponse('O parecer não contém score válido.');
  if (typeof parsed.summary !== 'string' || !parsed.summary.trim()) incompleteResponse('O parecer não contém summary válido.');
  if (!Array.isArray(parsed.checks) || parsed.checks.length !== CHILD_QUESTION_IDS.length || !parsed.checks.every((check: any) =>
    check && CHILD_QUESTION_IDS.includes(check.question_id)
    && ['SIM', 'NAO', 'NA'].includes(check.answer)
    && typeof check.rule === 'string' && check.rule.trim()
    && typeof check.passed === 'boolean' && check.passed === (check.answer === 'SIM')
    && typeof check.details === 'string' && check.details.trim())
    || new Set(parsed.checks.map((check: { question_id: string }) => check.question_id)).size !== CHILD_QUESTION_IDS.length) {
    incompleteResponse('O parecer não contém os cinco critérios da ficha completos e sem duplicação.');
  }
  if (parsed.checks.some((check: { rule: string; details: string }) => /\btag(s)?\b/i.test(`${check.rule} ${check.details}`))) {
    incompleteResponse('O parecer não deve avaliar tags dos chamados filhos.');
  }
  if (!Array.isArray(parsed.recommendations) || !parsed.recommendations.every((item: unknown) => typeof item === 'string')) {
    incompleteResponse('O parecer não contém recommendations válido.');
  }
  return parsed;
}
