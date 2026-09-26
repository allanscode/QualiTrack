import { useEffect, useRef, useState, useCallback } from 'react';

interface DraftData {
  header: any;
  scores: Record<string, string>;
  observations: Record<string, string>;
  criticalErrors: Record<string, boolean>;
  criticalErrorObservations: Record<string, string>;
  dissatisfactionAnswers: Record<string, string[]>;
  step?: number;
  savedAt: string;
}

interface UseMonitoriaDraftProps {
  isViewOnly: boolean;
  userId?: string;
  ticketId?: string;
  header: any;
  scores: Record<string, string>;
  observations: Record<string, string>;
  criticalErrors: Record<string, boolean>;
  criticalErrorObservations: Record<string, string>;
  dissatisfactionAnswers: Record<string, string[]>;
  step: number;
  onRestore: (draft: DraftData) => void;
}

const DRAFT_PREFIX = 'qualitrack_monitoria_draft_';

export function useMonitoriaDraft({
  isViewOnly,
  userId,
  ticketId,
  header,
  scores,
  observations,
  criticalErrors,
  criticalErrorObservations,
  dissatisfactionAnswers,
  step,
  onRestore,
}: UseMonitoriaDraftProps) {
  const [hasDraft, setHasDraft] = useState(false);
  const [draftData, setDraftData] = useState<DraftData | null>(null);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const debounceTimerRef = useRef<any>(null);
  const initialCheckDoneRef = useRef(false);

  // Chave isolada por usuário autenticado para proteção contra vazamento em estações compartilhadas
  const userPrefix = userId ? `${userId}_` : '';
  const currentKey = ticketId?.trim()
    ? `${DRAFT_PREFIX}${userPrefix}ticket_${ticketId.trim()}`
    : header.ticket_id?.trim()
    ? `${DRAFT_PREFIX}${userPrefix}ticket_${header.ticket_id.trim()}`
    : `${DRAFT_PREFIX}${userPrefix}latest`;

  // Checa se há rascunho salvo ao montar
  useEffect(() => {
    if (isViewOnly || initialCheckDoneRef.current) return;
    initialCheckDoneRef.current = true;

    try {
      const raw = localStorage.getItem(currentKey);
      if (!raw) return;

      const parsed: DraftData = JSON.parse(raw);
      // Rascunho válido nas últimas 48 horas
      const savedTime = new Date(parsed.savedAt).getTime();
      const now = Date.now();
      if (now - savedTime < 48 * 3600 * 1000) {
        // Checa se o rascunho tem conteúdo relevante
        const hasContent =
          Object.keys(parsed.scores || {}).length > 0 ||
          Object.values(parsed.observations || {}).some(v => v.trim().length > 0) ||
          Object.keys(parsed.criticalErrors || {}).length > 0 ||
          parsed.header?.ticket_id;

        if (hasContent) {
          setHasDraft(true);
          setDraftData(parsed);
        }
      } else {
        localStorage.removeItem(currentKey);
      }
    } catch {
      // Ignora erro de parsing
    }
  }, [currentKey, isViewOnly]);

  // Auto-Save periódico com debounce (1500ms)
  useEffect(() => {
    if (isViewOnly) return;

    // Só salva se houver algum dado preenchido
    const hasMeaningfulData =
      header.ticket_id?.trim() ||
      header.form_id ||
      Object.keys(scores).length > 0 ||
      Object.values(observations).some(v => v?.trim()?.length > 0) ||
      Object.keys(criticalErrors).length > 0;

    if (!hasMeaningfulData) return;

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      try {
        const payload: DraftData = {
          header,
          scores,
          observations,
          criticalErrors,
          criticalErrorObservations,
          dissatisfactionAnswers,
          step,
          savedAt: new Date().toISOString(),
        };
        localStorage.setItem(currentKey, JSON.stringify(payload));
        setLastSaved(new Date());
      } catch (e) {
        console.warn('[useMonitoriaDraft] Falha ao salvar rascunho local:', e);
      }
    }, 1500);

    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [
    isViewOnly,
    currentKey,
    header,
    scores,
    observations,
    criticalErrors,
    criticalErrorObservations,
    dissatisfactionAnswers,
    step,
  ]);

  const restoreDraft = useCallback(() => {
    if (!draftData) return;
    onRestore(draftData);
    setHasDraft(false);
  }, [draftData, onRestore]);

  const discardDraft = useCallback(() => {
    try {
      localStorage.removeItem(currentKey);
    } catch {}
    setHasDraft(false);
    setDraftData(null);
  }, [currentKey]);

  const clearDraft = useCallback(() => {
    try {
      localStorage.removeItem(currentKey);
    } catch {}
    setHasDraft(false);
    setDraftData(null);
  }, [currentKey]);

  return {
    hasDraft,
    draftData,
    lastSaved,
    restoreDraft,
    discardDraft,
    clearDraft,
  };
}
