type HistoryEntry = { action?: unknown; by_name?: unknown; note?: unknown };

/** Returns the Quality Manager's recorded conclusion for Zendesk publication. */
export function qualityFinalizationNote(history: unknown): string | null {
  if (!Array.isArray(history)) return null;
  const entry = [...history].reverse().find((item): item is HistoryEntry =>
    !!item && typeof item === 'object'
      && typeof (item as HistoryEntry).action === 'string'
      && ((item as HistoryEntry).action === 'Veredito final ajustado pela Gestão da Qualidade (nota >=75%)'
        || (item as HistoryEntry).action === 'Monitoria aprovada e concluída pela Gestão da Qualidade'));
  if (!entry || typeof entry.note !== 'string' || !entry.note.trim()) return null;
  const author = typeof entry.by_name === 'string' && entry.by_name.trim() ? ` (${entry.by_name.trim()})` : '';
  return `Conclusão final da Gestão da Qualidade${author}: ${entry.note.trim()}`;
}
