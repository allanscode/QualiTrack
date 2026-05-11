/**
 * Adds business hours to a given date.
 * Business hours: Monday–Friday, 08:00–17:00 (BRT).
 * If the start date is outside business hours, it snaps to the next open slot first.
 */

// Static list of Brazilian national holidays (MM-DD format, updated annually)
const HOLIDAYS_BR = [
  '01-01', // Confraternização Universal
  '04-21', // Tiradentes
  '05-01', // Dia do Trabalho
  '09-07', // Independência
  '10-12', // Nossa Senhora Aparecida
  '11-02', // Finados
  '11-15', // Proclamação da República
  '12-25', // Natal
];

function isHoliday(date: Date): boolean {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return HOLIDAYS_BR.includes(`${month}-${day}`);
}

function isBusinessDay(date: Date): boolean {
  const dow = date.getDay(); // 0 = Sunday, 6 = Saturday
  return dow >= 1 && dow <= 5 && !isHoliday(date);
}

/**
 * Snaps a date to the next business hour start if it falls outside business hours.
 */
function snapToBusinessHours(date: Date): Date {
  const result = new Date(date);

  // While not a business day, advance to the next day
  while (!isBusinessDay(result)) {
    result.setDate(result.getDate() + 1);
    result.setHours(8, 0, 0, 0);
  }

  const hours = result.getHours();
  const minutes = result.getMinutes();

  // Before 08:00 → snap to 08:00
  if (hours < 8) {
    result.setHours(8, 0, 0, 0);
  }

  // After 17:00 → snap to next business day 08:00
  if (hours >= 17) {
    result.setDate(result.getDate() + 1);
    result.setHours(8, 0, 0, 0);
    // Re-check in case next day is a weekend/holiday
    return snapToBusinessHours(result);
  }

  return result;
}

/**
 * Adds a given number of business hours to a start date.
 * @param from - Start date
 * @param hours - Number of business hours to add
 * @returns New deadline date
 */
export function addBusinessHours(from: Date, hours: number): Date {
  let current = snapToBusinessHours(new Date(from));
  let remaining = hours * 60; // Work in minutes for precision

  while (remaining > 0) {
    // Minutes until end of business day (17:00)
    const endOfDay = new Date(current);
    endOfDay.setHours(17, 0, 0, 0);

    const minutesUntilEod = Math.floor((endOfDay.getTime() - current.getTime()) / 60000);

    if (remaining <= minutesUntilEod) {
      current = new Date(current.getTime() + remaining * 60000);
      remaining = 0;
    } else {
      remaining -= minutesUntilEod;
      // Move to next business day at 08:00
      current.setDate(current.getDate() + 1);
      current.setHours(8, 0, 0, 0);
      current = snapToBusinessHours(current);
    }
  }

  return current;
}
