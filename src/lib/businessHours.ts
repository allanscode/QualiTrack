
export interface BusinessHoursConfig {
  start: string;
  end: string;
  days: number[];
  holidays: string[];
}

const DEFAULT_CONFIG: BusinessHoursConfig = {
  start: '08:00',
  end: '17:00',
  days: [1, 2, 3, 4, 5],
  holidays: ['01/01', '21/04', '01/05', '07/09', '12/10', '02/11', '15/11', '25/12']
};

function parseTime(timeStr: string) {
  if (!timeStr || !timeStr.includes(':')) return { h: 8, m: 0 };
  const [h, m] = timeStr.split(':').map(Number);
  return { h: isNaN(h) ? 8 : h, m: isNaN(m) ? 0 : m };
}

function isHoliday(date: Date, config: BusinessHoursConfig): boolean {
  if (!config || !config.holidays || !Array.isArray(config.holidays)) return false;
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return config.holidays.includes(`${day}/${month}`);
}

function isBusinessDay(date: Date, config: BusinessHoursConfig): boolean {
  if (!config) return date.getDay() >= 1 && date.getDay() <= 5;
  const dow = date.getDay();
  const days = config.days || [1, 2, 3, 4, 5];
  if (days.length === 0) return dow >= 1 && dow <= 5 && !isHoliday(date, config);
  return days.includes(dow) && !isHoliday(date, config);
}

function snapToBusinessHours(date: Date, config: BusinessHoursConfig = DEFAULT_CONFIG): Date {
  const result = new Date(date);
  const { h: startH, m: startM } = parseTime(config?.start || '08:00');
  const { h: endH, m: endM } = parseTime(config?.end || '17:00');

  let safety = 0;
  while (!isBusinessDay(result, config) && safety < 365) {
    result.setDate(result.getDate() + 1);
    result.setHours(startH, startM, 0, 0);
    safety++;
  }

  const hours = result.getHours();
  const minutes = result.getMinutes();
  const currentTimeInMinutes = hours * 60 + minutes;
  const startTimeInMinutes = startH * 60 + startM;
  const endTimeInMinutes = endH * 60 + endM;

  if (currentTimeInMinutes < startTimeInMinutes) {
    result.setHours(startH, startM, 0, 0);
  }

  if (currentTimeInMinutes >= endTimeInMinutes) {
    result.setDate(result.getDate() + 1);
    result.setHours(startH, startM, 0, 0);
    // Recursion safety
    if (startTimeInMinutes < endTimeInMinutes) {
      return snapToBusinessHours(result, config);
    }
  }

  return result;
}

export function addBusinessHours(from: Date, hours: number, config: BusinessHoursConfig = DEFAULT_CONFIG): Date {
  let current = snapToBusinessHours(new Date(from), config);
  let remaining = (hours || 0) * 60;
  const { h: startH, m: startM } = parseTime(config?.start || '08:00');
  const { h: endH, m: endM } = parseTime(config?.end || '17:00');

  let safety = 0;
  while (remaining > 0 && safety < 1000) {
    const endOfCurrentDay = new Date(current);
    endOfCurrentDay.setHours(endH, endM, 0, 0);

    const minutesUntilEod = Math.floor((endOfCurrentDay.getTime() - current.getTime()) / 60000);

    if (remaining <= minutesUntilEod) {
      current = new Date(current.getTime() + remaining * 60000);
      remaining = 0;
    } else {
      remaining -= Math.max(0, minutesUntilEod);
      current.setDate(current.getDate() + 1);
      current.setHours(startH, startM, 0, 0);
      current = snapToBusinessHours(current, config);
    }
    safety++;
  }

  return current;
}

export function getRemainingBusinessSeconds(start: Date, end: Date, config: BusinessHoursConfig = DEFAULT_CONFIG): number {
  if (!start || !end || start >= end) return 0;
  
  let current = new Date(start);
  const target = new Date(end);
  let totalSeconds = 0;
  let safety = 0;

  const businessStart = snapToBusinessHours(new Date(start), config);
  
  if (current < businessStart) {
    current = businessStart;
  }

  const { h: startH, m: startM } = parseTime(config?.start || '08:00');
  const { h: endH, m: endM } = parseTime(config?.end || '17:00');

  while (current < target && safety < 2000) {
    const endOfCurrentDay = new Date(current);
    endOfCurrentDay.setHours(endH, endM, 0, 0);

    const endOfRange = target < endOfCurrentDay ? target : endOfCurrentDay;
    const diffMs = endOfRange.getTime() - current.getTime();
    
    if (diffMs > 0) totalSeconds += Math.floor(diffMs / 1000);

    if (target > endOfCurrentDay) {
      current.setDate(current.getDate() + 1);
      current.setHours(startH, startM, 0, 0);
      current = snapToBusinessHours(current, config);
    } else {
      break;
    }
    safety++;
  }

  return totalSeconds;
}
