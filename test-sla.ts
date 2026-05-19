import { getRemainingBusinessSeconds, addBusinessHours, BusinessHoursConfig } from './src/lib/businessHours.ts';

const config: BusinessHoursConfig = {
  start: '08:00',
  end: '17:00',
  days: [1, 2, 3, 4, 5],
  holidays: []
};

const oldConfig: BusinessHoursConfig = {
  start: '08:00',
  end: '17:00',
  days: [1, 2, 4, 5], // no Wed
  holidays: []
};

const updated_at = new Date('2026-05-18T10:00:00.000Z'); // Monday 10:00 (assume UTC matches local for simplicity)
const deadline_at = new Date('2026-05-21T10:00:00.000Z'); // Thursday 10:00

const remaining = getRemainingBusinessSeconds(updated_at, deadline_at, oldConfig);
console.log("Remaining seconds (old):", remaining / 3600, "hours");

const newDeadline = addBusinessHours(updated_at, remaining / 3600, config);
console.log("New deadline:", newDeadline.toISOString());

const now = new Date('2026-05-19T14:48:43.000Z'); // Tuesday 14:48
const clockOld = getRemainingBusinessSeconds(now, deadline_at, oldConfig);
const clockNew = getRemainingBusinessSeconds(now, newDeadline, config);

console.log("Clock Old:", clockOld / 3600);
console.log("Clock New:", clockNew / 3600);
