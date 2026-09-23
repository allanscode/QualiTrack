interface SatisfactionRatingPayload {
  created_at?: string | null;
  updated_at?: string | null;
}

export function satisfactionResponseTimestamp(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const candidate = (payload as { satisfaction_rating?: SatisfactionRatingPayload | SatisfactionRatingPayload[] }).satisfaction_rating;
  const rating = Array.isArray(candidate) ? candidate[0] : candidate;
  return rating?.created_at || rating?.updated_at || null;
}
