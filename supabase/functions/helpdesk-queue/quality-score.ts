type AnswerValue = 'SIM' | 'NAO' | 'NA';

interface ScoreQuestion {
  id: string;
  is_critical?: boolean;
}

interface ScoreSection {
  weight?: number;
  questions?: ScoreQuestion[];
}

export function calculateCanonicalQualityScore(
  sections: ScoreSection[],
  answers: Record<string, AnswerValue>,
  criticalErrors: Record<string, boolean> = {},
): number {
  if (sections.length === 0) return 0;

  const criticalAnswerFailed = sections.some(section =>
    (section.questions || []).some(question => question.is_critical && answers[question.id] === 'NAO')
  );
  if (criticalAnswerFailed || Object.values(criticalErrors).some(Boolean)) return 0;

  let weightedScore = 0;
  let activeWeight = 0;

  for (const section of sections) {
    const activeQuestions = (section.questions || []).filter(question => answers[question.id] !== 'NA');
    if (activeQuestions.length === 0) continue;

    const questionWeight = (section.weight ?? 0) / activeQuestions.length;
    for (const question of activeQuestions) {
      weightedScore += questionWeight * (answers[question.id] === 'SIM' ? 1 : 0);
      activeWeight += questionWeight;
    }
  }

  if (activeWeight === 0) return 100;
  return Math.max(0, Math.min(100, Number(((weightedScore / activeWeight) * 100).toFixed(2))));
}
