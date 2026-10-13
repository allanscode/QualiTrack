/** Invalid ticket data needs human correction, not another scheduled request. */
export class PositivePreparationError extends Error {}

export function nextPositivePreparationAttempt(error: unknown, attempts: number, now = Date.now()): string {
  if (error instanceof PositivePreparationError || attempts >= 5) return 'infinity';
  return new Date(now + Math.min(60, 2 ** Math.min(attempts, 6)) * 60_000).toISOString();
}
