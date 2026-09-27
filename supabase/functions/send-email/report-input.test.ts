import { describe, expect, it } from 'vitest';
import { reportMetrics, reportSubject } from './report-input';

describe('executive report input', () => {
  const valid = { avgScore: 92.5, targetScore: 75, totalAudits: 45, criticalRate: 2.2 };
  it('accepts finite bounded metrics only', () => {
    expect(reportMetrics(valid)).toEqual(valid);
    for (const avgScore of [NaN, Infinity, -1, 101, '92', {}, null]) {
      expect(reportMetrics({ ...valid, avgScore })).toBeNull();
    }
    expect(reportMetrics({ ...valid, totalAudits: 1.5 })).toBeNull();
    expect(reportMetrics(null)).toBeNull();
  });
  it('removes SMTP control characters and bounds the subject', () => {
    expect(reportSubject('Relatório\r\nBcc: teste\u0000')).toBe('Relatório Bcc: teste');
    expect(reportSubject('a'.repeat(1000))).toHaveLength(300);
    expect(reportSubject('\r\n')).toContain('Relatório Executivo');
  });
});
