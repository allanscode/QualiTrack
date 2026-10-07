import { useState, useMemo } from 'react';
import { ChildTicketAiEvaluation, EvaluationForm, Monitoria, DissatisfactionField } from '../types';
import { calculateQualityScore } from '../utils/qualityMath';
import { toTicketDateInput } from '../lib/ticketDateTime';
import { CHILD_TICKET_FORM_ID, childEvaluationFormPrefill, shouldUseChildFormForReevaluation } from '../lib/childTicketForm';

const DEFAULT_HEADER = (initialData?: Monitoria) => {
  const today = new Date().toISOString().split('T')[0];
  return {
    form_id: initialData?.form_id || '',
    evaluated_id: initialData?.evaluated_id || '',
    team_id: initialData?.team_id || '',
    ticket_id: initialData?.ticket_id || '',
    channel: (initialData?.channel as any) || 'Chat',
    ticket_date: toTicketDateInput(initialData?.ticket_date) || today,
    analysis_date: toTicketDateInput(initialData?.analysis_date) || today,
    satisfaction_result: (initialData?.satisfaction_result as any) || '',
    satisfaction_has_record: initialData?.satisfaction_has_record || false,
    satisfaction_record_text: initialData?.satisfaction_record_text || '',
    evaluator_note: initialData?.evaluator_note || '',
    client_contact_log: initialData?.client_contact_log || '',
    client_contact_success: initialData?.client_contact_success || false,
    client_contact_channel: initialData?.client_contact_channel || [],
    reevaluation_justification: '',
  };
};

export function useMonitoriaFormState(
  initialData: Monitoria | undefined,
  forms: EvaluationForm[],
  dissatisfactionFields: DissatisfactionField[]
) {
  const childEvaluation = (initialData as Monitoria & { childAiEvaluation?: ChildTicketAiEvaluation } | undefined)?.childAiEvaluation;
  const childPrefill = initialData?.form_id === CHILD_TICKET_FORM_ID && !initialData.id && childEvaluation
    ? childEvaluationFormPrefill(childEvaluation) : undefined;
  const reevalChildWithWrongForm = shouldUseChildFormForReevaluation(initialData)
    && initialData?.form_id !== CHILD_TICKET_FORM_ID;
  const reevaluationFormId = shouldUseChildFormForReevaluation(initialData)
    ? CHILD_TICKET_FORM_ID : undefined;
  const [step, setStep] = useState(1);
  const [dissatisfactionAnswers, setDissatisfactionAnswers] = useState<Record<string, string[]>>(initialData?.dissatisfaction_answers || {});
  const [header, setHeader] = useState(() => ({
    ...DEFAULT_HEADER(initialData),
    ...(childPrefill && !initialData?.evaluator_note ? { evaluator_note: childPrefill.evaluator_note } : {}),
    ...(reevaluationFormId ? { form_id: reevaluationFormId } : {}),
  }));
  const [scores, setScores] = useState<Record<string, 'SIM' | 'NAO' | 'NA'>>(
    reevalChildWithWrongForm ? {} : { ...childPrefill?.answers, ...initialData?.answers });
  const [observations, setObservations] = useState<Record<string, string>>(
    reevalChildWithWrongForm ? {} : { ...childPrefill?.question_observations, ...initialData?.question_observations });
  const [criticalErrorObservations, setCriticalErrorObservations] = useState<Record<string, string>>(
    reevalChildWithWrongForm ? {} : initialData?.critical_error_observations || {});
  const [criticalErrors, setCriticalErrors] = useState<Record<string, boolean>>(
    (reevalChildWithWrongForm ? [] : initialData?.selected_critical_errors || [])
      .reduce((acc: Record<string, boolean>, id: string) => ({ ...acc, [id]: true }), {})
  );

  const selectedForm = useMemo(() => {
    if (initialData?.form_snapshot && initialData.form_id === header.form_id) return initialData.form_snapshot;
    return forms.find(f => f.id === header.form_id);
  }, [initialData, forms, header.form_id]);

  const score = calculateQualityScore(selectedForm, scores, criticalErrors);

  const clientFieldsToShow = useMemo(() => {
    return dissatisfactionFields.filter(f =>
      f.type === 'cliente' &&
      (f.active || (dissatisfactionAnswers[f.id] && dissatisfactionAnswers[f.id].length > 0)) &&
      (!f.form_id || f.form_id === selectedForm?.id)
    );
  }, [dissatisfactionFields, dissatisfactionAnswers, selectedForm]);

  const qualityFieldsToShow = useMemo(() => {
    return dissatisfactionFields.filter(f =>
      f.type === 'qualidade' &&
      (f.active || (dissatisfactionAnswers[f.id] && dissatisfactionAnswers[f.id].length > 0)) &&
      (!f.form_id || f.form_id === selectedForm?.id)
    );
  }, [dissatisfactionFields, dissatisfactionAnswers, selectedForm]);

  const handleCheckboxChange = (fieldId: string, option: string, checked: boolean, isViewOnly: boolean) => {
    if (isViewOnly) return;
    setDissatisfactionAnswers(prev => {
      const currentOpts = prev[fieldId] || [];
      let newOpts;
      if (checked) {
        newOpts = [...currentOpts, option];
      } else {
        newOpts = currentOpts.filter(o => o !== option);
      }
      return { ...prev, [fieldId]: newOpts };
    });
  };

  return {
    step, setStep,
    header, setHeader,
    scores, setScores,
    observations, setObservations,
    criticalErrors, setCriticalErrors,
    criticalErrorObservations, setCriticalErrorObservations,
    dissatisfactionAnswers, setDissatisfactionAnswers,
    selectedForm,
    score,
    clientFieldsToShow,
    qualityFieldsToShow,
    handleCheckboxChange,
  };
}
