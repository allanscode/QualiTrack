export interface CompletedMonitoria {
  id: string;
  concluded_at: string | null;
}

export interface DeliveryEvidence {
  monitoria_id: string;
  status: string;
}

export interface DeliveryMonth {
  month: string;
  completed: number;
  confirmed: number;
  unconfirmed: number;
}

export interface DeliveryDashboard {
  total: number;
  confirmed: number;
  unconfirmed: number;
  pending: number;
  uncertain: number;
  failed: number;
  skipped: number;
  no_receipt: number;
  months: DeliveryMonth[];
}

export function buildDeliveryDashboard(
  monitorias: CompletedMonitoria[],
  submissions: DeliveryEvidence[],
  positivePublications: DeliveryEvidence[],
  childPublications: DeliveryEvidence[],
): DeliveryDashboard {
  const evidence = new Map<string, Set<string>>();
  const add = (rows: DeliveryEvidence[], prefix: string) => {
    for (const row of rows) {
      const states = evidence.get(row.monitoria_id) ?? new Set<string>();
      states.add(`${prefix}:${row.status}`);
      evidence.set(row.monitoria_id, states);
    }
  };
  add(submissions, 'submission');
  add(positivePublications, 'auto');
  add(childPublications, 'auto');

  const result: DeliveryDashboard = {
    total: 0, confirmed: 0, unconfirmed: 0, pending: 0,
    uncertain: 0, failed: 0, skipped: 0, no_receipt: 0, months: [],
  };
  const months = new Map<string, DeliveryMonth>();
  for (const monitoria of new Map(monitorias.map(row => [row.id, row])).values()) {
    const states = evidence.get(monitoria.id) ?? new Set<string>();
    const confirmed = states.has('submission:sent') || states.has('auto:sent');
    const month = monitoria.concluded_at && !Number.isNaN(Date.parse(monitoria.concluded_at))
      ? monitoria.concluded_at.slice(0, 7) : 'Sem data';
    const bucket = months.get(month) ?? { month, completed: 0, confirmed: 0, unconfirmed: 0 };
    bucket.completed++;
    if (confirmed) { result.confirmed++; bucket.confirmed++; }
    else {
      result.unconfirmed++;
      bucket.unconfirmed++;
      if (states.has('auto:uncertain')) result.uncertain++;
      else if (states.has('auto:processing') || states.has('auto:pending')) result.pending++;
      else if (states.has('submission:failed')) result.failed++;
      else if (states.has('auto:skipped')) result.skipped++;
      else result.no_receipt++;
    }
    result.total++;
    months.set(month, bucket);
  }
  result.months = [...months.values()].sort((a, b) => a.month.localeCompare(b.month));
  return result;
}
