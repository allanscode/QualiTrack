export interface ReportMetrics {
  avgScore: number;
  targetScore: number;
  totalAudits: number;
  criticalRate: number;
}

export function reportMetrics(value: unknown): ReportMetrics | null {
  if (!value || typeof value !== 'object') return null;
  const metrics = value as Record<string, unknown>;
  for (const key of ['avgScore', 'targetScore', 'criticalRate']) {
    const number = metrics[key];
    if (typeof number !== 'number' || !Number.isFinite(number) || number < 0 || number > 100) return null;
  }
  const total = metrics.totalAudits;
  if (typeof total !== 'number' || !Number.isSafeInteger(total) || total < 0) return null;
  return metrics as unknown as ReportMetrics;
}

export function reportSubject(value: unknown): string {
  return typeof value === 'string'
    ? value.replace(/[\x00-\x1f\x7f]+/g, ' ').slice(0, 300).trim() || '[QualiTrack] Relatório Executivo de Qualidade'
    : '[QualiTrack] Relatório Executivo de Qualidade';
}
