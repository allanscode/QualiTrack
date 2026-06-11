import { useState, useMemo } from 'react';
import { EvaluationForm, Monitoria, DissatisfactionField } from '../types';
import { calculateQualityScore } from '../utils/qualityMath';

const DEFAULT_HEADER = (initialData?: Monitoria) => {
  const today = new Date().toISOString().split('T')[0];
  return {
    form_id: initialData?.form_id || '',
    evaluated_id: initialData?.evaluated_id || '',
    team_id: initialData?.team_id || '',
    ticket_id: initialData?.ticket_id || '',
    channel: (initialData?.channel as any) || 'Chat',
    ticket_date: initialData?.ticket_date || today,
    analysis_date: initialData?.analysis_date || today,
    satisfaction_result: (initialData?.satisfaction_result as any) || '',
    satisfaction_has_record: initialData?.satisfaction_has_record || false,
    satisfaction_record_text: initialData?.satisfaction_record_text || '',
    evaluator_note: initialData?.evaluator_note || '',
    client_contact_log: initialData?.client_contact_log || '',
    client_contact_success: initialData?.client_contact_success || false,
    reevaluation_justification: '',
  };
};

export function useMonitoriaFormState(
  initialData: Monitoria | undefined,
  forms: EvaluationForm[],
  dissatisfactionFields: DissatisfactionField[]
) {
  const [step, setStep] = useState(1);
  const [dissatisfactionAnswers, setDissatisfactionAnswers] = useState<Record<string, string[]>>(initialData?.dissatisfaction_answers || {});
  const [header, setHeader] = useState(() => DEFAULT_HEADER(initialData));
  const [scores, setScores] = useState<Record<string, 'SIM' | 'NAO' | 'NA'>>(initialData?.answers || {});
  const [observations, setObservations] = useState<Record<string, string>>(initialData?.question_observations || {});
  const [criticalErrorObservations, setCriticalErrorObservations] = useState<Record<string, string>>(initialData?.critical_error_observations || {});
  const [criticalErrors, setCriticalErrors] = useState<Record<string, boolean>>(
    (initialData?.selected_critical_errors || []).reduce((acc: any, id: string) => ({ ...acc, [id]: true }), {})
  );

  const selectedForm = useMemo(() => {
    if (initialData?.form_snapshot) return initialData.form_snapshot;
    return forms.find(f => f.id === header.form_id);
  }, [initialData, forms, header.form_id]);

  const score = calculateQualityScore(selectedForm, scores, criticalErrors);

  const clientFieldsToShow = useMemo(() => {
    return dissatisfactionFields.filter(f =>
      f.type === 'cliente' && (f.active || (dissatisfactionAnswers[f.id] && dissatisfactionAnswers[f.id].length > 0))
    );
  }, [dissatisfactionFields, dissatisfactionAnswers]);

  const qualityFieldsToShow = useMemo(() => {
    return dissatisfactionFields.filter(f =>
      f.type === 'qualidade' && (f.active || (dissatisfactionAnswers[f.id] && dissatisfactionAnswers[f.id].length > 0))
    );
  }, [dissatisfactionFields, dissatisfactionAnswers]);

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
