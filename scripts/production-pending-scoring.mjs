export function questions(form) {
  return form.sections.flatMap(section => section.questions);
}

export function withoutLegacyCritical(sections) {
  return sections.map(section => ({ ...section, questions: section.questions.map(question => {
    const clean = { ...question };
    delete clean.is_critical;
    return clean;
  }) }));
}

// Only the currently active develop rubric controls the candidate score.
export function score(form, answers) {
  let earned = 0, possible = 0;
  for (const section of form.sections) {
    const active = section.questions.filter(question => answers[question.id] !== 'NA');
    for (const question of active) {
      const weight = Number(section.weight) / active.length;
      possible += weight;
      if (answers[question.id] === 'SIM') earned += weight;
    }
  }
  return possible ? Math.round(earned / possible * 10_000) / 100 : 100;
}
