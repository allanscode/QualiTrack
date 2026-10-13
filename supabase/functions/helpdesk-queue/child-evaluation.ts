import { incompleteResponse } from './ai-fallback.ts';
import { calculateCanonicalQualityScore } from './quality-score.ts';

export const CHILD_QUESTION_IDS = [
  'child-subject-preserved', 'child-parent-linked', 'child-macro-preserved',
  'child-macro-enriched', 'child-routing-correct', 'child-creator-authorized',
];

export interface ChildCreationRoutingEvidence {
  creatorId: number;
  initialAssigneeId: number;
  initialGroupId: number | null;
  selfAssigned: boolean;
  creatorGroupName?: string;
}

export function forbiddenChildCreatorGroup(groupName: string | undefined): boolean {
  const normalized = (groupName || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  return /\banalise tecnica\b|\banalise de correcoes\b/.test(normalized);
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
  { weight: 25, questions: [{ id: 'child-routing-correct' }, { id: 'child-creator-authorized', is_critical: true }] },
];

/** The opening audit determines the child recipient; the specialist group belongs to the parent. */
export function reconcileChildOpeningRouting<T extends ChildEvaluation>(
  result: T,
  evidence: ChildCreationRoutingEvidence | null,
  sections?: Array<{ weight?: number; questions?: Array<{ id: string; is_critical?: boolean }> }>,
): T {
  if (result.detected_type === 'desconhecido') return result;
  const routing = result.checks.find(check => check.question_id === 'child-routing-correct');
  const creator = result.checks.find(check => check.question_id === 'child-creator-authorized');
  const expectedAnswer = evidence ? (evidence.selfAssigned ? 'SIM' : 'NAO') : null;
  const creatorAnswer: ChildAnswer = evidence?.selfAssigned && evidence.creatorGroupName
    ? (forbiddenChildCreatorGroup(evidence.creatorGroupName) ? 'NAO' : 'SIM') : 'NA';
  if ((!routing || !expectedAnswer || routing.answer === expectedAnswer)
    && (!creator || creator.answer === creatorAnswer)) return result;

  const checks = result.checks.map(check => check.question_id === 'child-routing-correct' && expectedAnswer && check.answer !== expectedAnswer
    ? { ...check, answer: expectedAnswer, passed: evidence!.selfAssigned,
      details: evidence!.selfAssigned
        ? 'O histórico de criação do Zendesk confirma que o chamado filho foi atribuído inicialmente ao agente que o abriu. O grupo técnico é o destino do ticket pai; a equipe exibida junto ao nome do agente não torna o filho irregular.'
        : 'O histórico de criação do Zendesk mostra que o destinatário inicial do chamado filho era outro usuário, diferente do agente que o abriu.' }
    : check.question_id === 'child-creator-authorized' && check.answer !== creatorAnswer
    ? { ...check, answer: creatorAnswer, passed: creatorAnswer === 'SIM',
      details: creatorAnswer === 'NAO'
        ? `O histórico de abertura identifica a equipe ${evidence!.creatorGroupName} como origem do chamado filho. O Manual de ticket filho proíbe que essa equipe crie tickets filhos.`
        : creatorAnswer === 'SIM'
        ? `A equipe de origem identificada na abertura (${evidence!.creatorGroupName}) não está entre as equipes proibidas pelo Manual de ticket filho.`
        : 'Não foi possível confirmar a equipe do criador na abertura; confira o histórico antes de invalidar por esta regra.' }
    : check);
  const answers = Object.fromEntries(checks.map(check => [check.question_id, check.answer])) as Record<string, ChildAnswer>;
  const score = calculateCanonicalQualityScore(sections?.length ? sections : CHILD_DEFAULT_SCORE_SECTIONS, answers);
  const status = checks.some(check => check.answer === 'NAO') ? 'nao_conforme'
    : checks.some(check => check.answer === 'NA') ? 'atencao' : 'conforme';
  const otherFailures = checks.filter(check => check.question_id !== 'child-routing-correct' && check.answer === 'NAO');
  const summary = creatorAnswer === 'NAO'
    ? `O chamado filho foi criado pela equipe ${evidence!.creatorGroupName}, o que viola o Manual de ticket filho e exige invalidação após conferência do auditor.`
    : evidence?.selfAssigned
    ? status === 'conforme'
      ? 'A atribuição inicial do chamado filho ao próprio agente está correta e os demais critérios da abertura estão conformes.'
      : `A atribuição inicial do chamado filho ao próprio agente está correta. ${otherFailures.length
        ? `A avaliação permanece não conforme por: ${otherFailures.map(check => check.rule).join(', ')}.`
        : 'Os demais critérios exigem conferência por evidência insuficiente.'}`
    : 'Confira o histórico de criação e os demais critérios apontados no parecer.';
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
    incompleteResponse('O parecer não contém os seis critérios da ficha completos e sem duplicação.');
  }
  if (parsed.checks.some((check: { rule: string; details: string }) => /\btag(s)?\b/i.test(`${check.rule} ${check.details}`))) {
    incompleteResponse('O parecer não deve avaliar tags dos chamados filhos.');
  }
  if (!Array.isArray(parsed.recommendations) || !parsed.recommendations.every((item: unknown) => typeof item === 'string')) {
    incompleteResponse('O parecer não contém recommendations válido.');
  }
  return parsed;
}
