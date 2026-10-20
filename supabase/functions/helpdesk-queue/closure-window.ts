type Interval = { start_time: number; end_time: number };
type Holiday = { start_date: string; end_date: string };

const dayIndex: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** Zendesk schedule intervals are minutes counted from Sunday 00:00. */
export function addZendeskBusinessHours(
  from: string,
  hours: number,
  intervals: Interval[],
  holidays: Holiday[],
  timeZone = 'America/Sao_Paulo',
): string {
  const start = Date.parse(from);
  if (!Number.isFinite(start) || !Number.isInteger(hours) || hours < 1 || !intervals.length) {
    throw new Error('Invalid Zendesk closure window');
  }
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone, weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  });
  let remaining = hours * 60;
  let cursor = Math.ceil(start / 60_000) * 60_000;
  // More than a year is never a valid window for a four-business-day rule.
  const limit = cursor + 366 * 24 * 60 * 60_000;
  for (; cursor < limit; cursor += 60_000) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(cursor)).map(part => [part.type, part.value]));
    const weekday = dayIndex[parts.weekday];
    const localDate = `${parts.year}-${parts.month}-${parts.day}`;
    const minuteOfWeek = weekday * 1440 + Number(parts.hour) * 60 + Number(parts.minute);
    if (holidays.some(holiday => holiday.start_date <= localDate && localDate <= holiday.end_date)) continue;
    if (!intervals.some(interval => interval.start_time <= minuteOfWeek && minuteOfWeek < interval.end_time)) continue;
    remaining--;
    if (remaining === 0) return new Date(cursor + 60_000).toISOString();
  }
  throw new Error('Zendesk schedule cannot fit the closure window');
}
