import { describe, expect, it } from 'vitest';
import { buildDeliveryDashboard } from './delivery-dashboard';

describe('admin Zendesk delivery dashboard', () => {
  it('deduplicates monitorias and treats sent from any source as confirmed', () => {
    const result = buildDeliveryDashboard(
      [{ id: 'a', concluded_at: '2026-10-01T00:00:00Z' }, { id: 'a', concluded_at: '2026-10-01T00:00:00Z' },
        { id: 'b', concluded_at: '2026-10-02T00:00:00Z' }],
      [{ monitoria_id: 'a', status: 'failed' }, { monitoria_id: 'a', status: 'sent' }],
      [{ monitoria_id: 'a', status: 'pending' }],
      [{ monitoria_id: 'b', status: 'sent' }],
    );
    expect(result).toMatchObject({ total: 2, confirmed: 2, unconfirmed: 0, failed: 0 });
    expect(result.months).toEqual([{ month: '2026-10', completed: 2, confirmed: 2, unconfirmed: 0 }]);
  });

  it('separates missing receipts, failed attempts and uncertain automation', () => {
    const result = buildDeliveryDashboard(
      [{ id: 'manual-child', concluded_at: null }, { id: 'failed', concluded_at: '2026-09-01T00:00:00Z' },
        { id: 'uncertain', concluded_at: '2026-09-02T00:00:00Z' }],
      [{ monitoria_id: 'failed', status: 'failed' }], [],
      [{ monitoria_id: 'uncertain', status: 'uncertain' }],
    );
    expect(result).toMatchObject({ total: 3, confirmed: 0, unconfirmed: 3, no_receipt: 1, failed: 1, uncertain: 1 });
    expect(result.months.find(row => row.month === 'Sem data')).toMatchObject({ completed: 1, unconfirmed: 1 });
  });
});
