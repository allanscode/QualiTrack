import type { ChildTicketAiEvaluation, ChildTicketMacroType, EvaluationForm, Monitoria } from '../types';

/** ID estável da ficha criada pela migração de tickets filhos. */
export const CHILD_TICKET_FORM_ID = '6c7d1e88-841b-4da9-9a66-9f1464ce896f';
export const CHILD_FORM_IDS: Record<ChildTicketMacroType, string> = {
  nova_demanda: '6c7d1e88-841b-4da9-9a66-9f1464ce8970',
  analise_tecnica: '6c7d1e88-841b-4da9-9a66-9f1464ce8971',
  apoio_tecnico: '6c7d1e88-841b-4da9-9a66-9f1464ce8972',
  produtividade: '6c7d1e88-841b-4da9-9a66-9f1464ce8973',
};
export const isChildFormId = (id: string | null | undefined): boolean =>
  id === CHILD_TICKET_FORM_ID || Object.values(CHILD_FORM_IDS).includes(id || '');

export function detectChildMacroType(tags: readonly string[], subject: string): ChildTicketMacroType | undefined {
  const lowerTags = tags.map(tag => tag.toLowerCase());
  const lowerSubject = subject.toLowerCase();
  if (lowerTags.includes('existe_nova_demanda') || lowerSubject.includes('nova demanda')) return 'nova_demanda';
  if (lowerTags.includes('analise_tecnica') || /an[aá]lise t[eé]cnica/.test(lowerSubject)) return 'analise_tecnica';
  if (lowerTags.includes('apoio_tecnico') || lowerTags.includes('apoio_analise_tecnica') || /apoio an[aá]lise/.test(lowerSubject)) return 'apoio_tecnico';
  if (lowerTags.includes('produtividade') || lowerTags.includes('filho_produtividade') || lowerSubject.includes('produtividade')) return 'produtividade';
  return undefined;
}

export function childVerdict(answers: Record<string, 'SIM' | 'NAO' | 'NA'>, form: EvaluationForm | undefined): 'valido' | 'invalido' | null {
  const questions = form?.sections?.flatMap(section => section.questions) || [];
  if (!questions.length || questions.some(question => !['SIM', 'NAO', 'NA'].includes(answers[question.id]))) return null;
  // NA registra falta de evidência ou critério não aplicável; somente NAO é reprovação.
  return questions.some(question => answers[question.id] === 'NAO') ? 'invalido' : 'valido';
}

const CHILD_QUESTION_RULES: Record<string, string[]> = {
  'child-subject-preserved': ['Assunto da Abertura e Macro de Resolvido'],
  'child-parent-linked': ['Vínculo com o chamado pai'],
  'child-macro-preserved': ['Preservação do Texto da Macro'],
  'child-macro-enriched': ['Detalhes técnicos complementares'],
  'child-routing-correct': ["Direcionamento Correto ('Para')"],
  'child-creator-authorized': ['Equipe Criadora Autorizada'],
};

const normalizeRule = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

/** Map only explicit findings: older reports cannot answer new questions by inference. */
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
  const snapshot = monitoria.form_snapshot as (EvaluationForm & {
    ticket_kind?: string;
    automation?: string;
    child_verdict?: string;
  }) | undefined;
  return isChildFormId(monitoria.form_id)
    || snapshot?.ticket_kind === 'chamado_filho'
    || snapshot?.automation === 'child_ticket'
    || snapshot?.child_verdict === 'valido'
    || snapshot?.child_verdict === 'invalido';
}

export function legacyChildNoteVerdict(
  monitoria: Pick<Monitoria, 'form_snapshot'> & Partial<Pick<Monitoria, 'child_verdict'>>,
): 'valido' | 'invalido' | null {
  const snapshot = monitoria.form_snapshot as { legacy_source?: string; legacy_verdict?: string; child_verdict?: string } | undefined;
  if (snapshot?.legacy_source !== 'zendesk_child_note') return null;
  if (snapshot.legacy_verdict !== 'valido' && snapshot.legacy_verdict !== 'invalido') return null;
  const monitoriaVerdict = monitoria.child_verdict || snapshot.child_verdict;
  return monitoriaVerdict && monitoriaVerdict !== snapshot.legacy_verdict
    ? null
    : snapshot.legacy_verdict;
}

/** A ficha antiga fica no histórico; só a reavaliação muda de rubrica. */
export function shouldUseChildFormForReevaluation(initialData: Monitoria | undefined): boolean {
  if (!initialData || !(initialData as Monitoria & { _reevaluate?: boolean })._reevaluate) return false;
  return isChildTicketMonitoria(initialData);
}

export function childFormForReevaluation(initialData: Monitoria | undefined, forms: EvaluationForm[]): EvaluationForm | undefined {
  if (!shouldUseChildFormForReevaluation(initialData)) return undefined;
  return childTicketForm(forms);
}
