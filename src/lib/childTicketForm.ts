import type { EvaluationForm, Monitoria } from '../types';

/** ID estável da ficha criada pela migração de tickets filhos. */
export const CHILD_TICKET_FORM_ID = '6c7d1e88-841b-4da9-9a66-9f1464ce896f';

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
