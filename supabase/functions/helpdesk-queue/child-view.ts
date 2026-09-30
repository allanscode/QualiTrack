import { CHILD_AUDITED_TAG } from './queue-search.ts';

interface ViewCondition {
  field: string;
  operator: string;
  value?: string;
}

export function childViewConditionsWithAuditExclusion(view: {
  conditions?: { all?: ViewCondition[]; any?: ViewCondition[] };
}): { all: ViewCondition[]; any: ViewCondition[] } | null {
  const all = view.conditions?.all;
  const any = view.conditions?.any;
  if (!Array.isArray(all) || !Array.isArray(any)) {
    throw new Error('A view do Zendesk não retornou todas as condições atuais.');
  }
  if (all.some(condition => condition.field === 'current_tags' &&
    condition.operator === 'not_includes' && condition.value === CHILD_AUDITED_TAG)) return null;
  return {
    all: [...all, { field: 'current_tags', operator: 'not_includes', value: CHILD_AUDITED_TAG }],
    any: [...any],
  };
}

export function hasPublishedChildMacro(comments: unknown): boolean {
  return Array.isArray(comments) && comments.some(comment =>
    typeof comment?.body === 'string' && comment.body.startsWith('[QualidadeWP · Chamado filho '));
}
