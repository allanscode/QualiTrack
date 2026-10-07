import type { ChildTicketAiEvaluation, EvaluationForm, Monitoria } from '../types';

/** ID estável da ficha criada pela migração de tickets filhos. */
export const CHILD_TICKET_FORM_ID = '6c7d1e88-841b-4da9-9a66-9f1464ce896f';

const CHILD_QUESTION_RULES: Record<string, string[]> = {
  'child-subject-preserved': ['Assunto da Abertura e Macro de Resolvido'],
  'child-parent-linked': ['Vínculo com o chamado pai'],
  'child-macro-preserved': ['Preservação do Texto da Macro'],
  'child-macro-enriched': ['Detalhes técnicos complementares'],
  'child-routing-correct': ["Direcionamento Correto ('Para')"],
};

const normalizeRule = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

/** Map only explicit findings: historical three-check reports cannot answer all five questions. */
export function childEvaluationFormPrefill(evaluation: ChildTicketAiEvaluation) {
  const answers: Record<string, 'SIM' | 'NAO' | 'NA'> = {};
  const question_observations: Record<string, string> = {};
  for (const check of evaluation.checks || []) {
    const questionId = check.question_id && Object.hasOwn(CHILD_QUESTION_RULES, check.question_id)
      ? check.question_id
      : Object.keys(CHILD_QUESTION_RULES).find(id => CHILD_QUESTION_RULES[id].some(rule => normalizeRule(rule) === normalizeRule(check.rule)));
    if (!questionId) continue;
    const answer = ['SIM', 'NAO', 'NA'].includes(check.answer || '')
      ? check.answer : typeof check.passed === 'boolean' ? (check.passed ? 'SIM' : 'NAO') : undefined;
    if (!answer) continue;
    answers[questionId] = answer;
    question_observations[questionId] = check.details || '';
  }
  return {
    answers,
    question_observations,
    evaluator_note: [evaluation.summary, ...(evaluation.recommendations || [])].filter(Boolean).join('\n\n'),
  };
}

export function childTicketForm(forms: EvaluationForm[]): EvaluationForm | undefined {
  return forms.find(form => form.id === CHILD_TICKET_FORM_ID && form.active !== false);
}

export function isChildTicketMonitoria(monitoria: Monitoria): boolean {
  return monitoria.form_id === CHILD_TICKET_FORM_ID
    || (monitoria.form_snapshot as EvaluationForm & { ticket_kind?: string } | undefined)?.ticket_kind === 'chamado_filho';
}

/** A ficha antiga fica no histórico; só a reavaliação muda de rubrica. */
export function shouldUseChildFormForReevaluation(initialData: Monitoria | undefined): boolean {
  if (!initialData || !(initialData as Monitoria & { _reevaluate?: boolean })._reevaluate) return false;
  return isChildTicketMonitoria(initialData);
}
