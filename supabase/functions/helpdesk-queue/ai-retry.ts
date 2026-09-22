export function nextRetryDelayMs(retryCount: number): number {
  return Math.min(60_000 * 2 ** Math.max(0, retryCount), 3_600_000);
}

export function retryAt(retryCount: number, now = Date.now()): string {
  return new Date(now + nextRetryDelayMs(retryCount)).toISOString();
}
