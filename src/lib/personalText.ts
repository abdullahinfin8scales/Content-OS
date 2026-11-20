import { daysBetween } from './dates';

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Reads a time typed at the end of a task — "Call accountant at 3pm",
 * "Gym 6:30am", "Standup @ 09:15", "Review 14:00" — and splits it off.
 * A bare number ("Read 20") is never taken as a time: it needs "at"/"@",
 * am/pm, or the HH:MM form.
 */
export function parseTaskInput(input: string): { title: string; time: string | null } {
  const text = input.replace(/\s+/g, ' ').trim();
  const m = text.match(/^(.*?)(?:\s+(at|@)\s*|\s+|^)(\d{1,2})(?::([0-5]\d))?\s*(am|pm|a\.m\.|p\.m\.)?$/i);
  if (!m) return { title: text, time: null };
  const [, rest, at, hRaw, mRaw, ampmRaw] = m;
  const hasMinutes = mRaw !== undefined;
  const ampm = ampmRaw?.toLowerCase().replace(/\./g, '');
  if (!at && !ampm && !hasMinutes) return { title: text, time: null };
  let h = Number(hRaw);
  const min = hasMinutes ? Number(mRaw) : 0;
  if (ampm) {
    if (h < 1 || h > 12) return { title: text, time: null };
    if (ampm === 'pm' && h !== 12) h += 12;
    if (ampm === 'am' && h === 12) h = 0;
  } else if (h > 23) {
    return { title: text, time: null };
  }
  const title = rest.trim();
  if (!title) return { title: text, time: null };
  return { title, time: `${pad(h)}:${pad(min)}` };
}

/** "41 days left", "Due today", "Due tomorrow", "3 days over". */
export function daysLeftLabel(targetDate: string, today: string): string {
  const d = daysBetween(today, targetDate);
  if (d === 0) return 'Due today';
  if (d === 1) return 'Due tomorrow';
  if (d > 1) return `${d} days left`;
  if (d === -1) return '1 day over';
  return `${-d} days over`;
}

/** "Today", "Yesterday", "Tomorrow", or null for other days. */
export function relativeDayName(date: string, today: string): string | null {
  const d = daysBetween(today, date);
  if (d === 0) return 'Today';
  if (d === -1) return 'Yesterday';
  if (d === 1) return 'Tomorrow';
  return null;
}

/** Whether this browser's locale writes times on a 12-hour clock (6:30 PM) or a 24-hour one (18:30). */
const USES_12H = (() => {
  try {
    const cycle = new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions().hourCycle;
    return cycle === 'h11' || cycle === 'h12';
  } catch {
    return false;
  }
})();

/** "6:30 PM" or "18:30", following the locale. `compact` drops ":00" on a 12-hour clock ("6 PM"). */
export function clockLabel(hhmm: string, opts: { compact?: boolean; twelveHour?: boolean } = {}): string {
  const [h = 0, m = 0] = hhmm.split(':').map(Number);
  if (!(opts.twelveHour ?? USES_12H)) return `${pad(h)}:${pad(m)}`;
  const suffix = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 || 12;
  return opts.compact && m === 0 ? `${h12} ${suffix}` : `${h12}:${pad(m)} ${suffix}`;
}

/** An hour row's label: "6 AM" or "06:00". */
export function hourLabel(hour: number): string {
  return clockLabel(`${pad(hour)}:00`, { compact: true });
}

/**
 * Reads a time typed into the time picker: "6", "6pm", "6:30 pm", "630pm",
 * "18:30", "0630", "6p". Without am/pm the hour is read on a 24-hour clock.
 * Returns HH:MM, or null when it isn't a time.
 */
export function parseTimeText(input: string): string | null {
  const t = input.trim().toLowerCase().replace(/\./g, '').replace(/\s+/g, '');
  const m = t.match(/^(\d{1,2})(?::?(\d{2}))?(am|pm|a|p)?$/);
  if (!m) return null;
  let h = Number(m[1]);
  const min = m[2] ? Number(m[2]) : 0;
  const ampm = m[3];
  if (min > 59) return null;
  if (ampm) {
    if (h < 1 || h > 12) return null;
    const pm = ampm.startsWith('p');
    if (pm && h !== 12) h += 12;
    if (!pm && h === 12) h = 0;
  } else if (h > 23) {
    return null;
  }
  return `${pad(h)}:${pad(min)}`;
}

/** Every quarter hour of the day, as HH:MM — the picker's list. */
export const TIME_SLOTS: string[] = Array.from({ length: 96 }, (_, i) => `${pad(Math.floor(i / 4))}:${pad((i % 4) * 15)}`);

/** The next quarter hour after `now` ("09:07" → "09:15"), capped at 23:45. */
export function nextQuarterHour(now = new Date()): string {
  const mins = Math.min(23 * 60 + 45, Math.ceil((now.getHours() * 60 + now.getMinutes() + 1) / 15) * 15);
  return `${pad(Math.floor(mins / 60))}:${pad(mins % 60)}`;
}

/** Picker search: times whose label ("6:30 PM", "6 PM") or value ("18:30") start with what was typed. */
export function matchTimes(query: string, slots: string[], twelveHour?: boolean): string[] {
  const norm = (s: string) => s.toLowerCase().replace(/[\s:.]/g, '');
  const q = norm(query);
  if (!q) return slots;
  return slots.filter(
    (v) =>
      norm(clockLabel(v, { twelveHour })).startsWith(q) ||
      norm(clockLabel(v, { twelveHour, compact: true })).startsWith(q) ||
      norm(v).startsWith(q) ||
      norm(v).replace(/^0/, '').startsWith(q),
  );
}

/** The HH:MM value of an hour, for creating a task at it. */
export function hourValue(hour: number): string {
  return `${pad(hour)}:00`;
}

export function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

/* ------------------------------ Weekdays ------------------------------ */

// 2023-01-01 was a Sunday, so day `d` of that week has getDay() === d.
const weekdayDate = (d: number) => new Date(2023, 0, 1 + d);
const weekdayFormats = {
  narrow: new Intl.DateTimeFormat(undefined, { weekday: 'narrow' }),
  short: new Intl.DateTimeFormat(undefined, { weekday: 'short' }),
  long: new Intl.DateTimeFormat(undefined, { weekday: 'long' }),
};

/** A weekday's name in the user's language (0 = Sunday). */
export function weekdayName(day: number, style: 'narrow' | 'short' | 'long' = 'short'): string {
  return weekdayFormats[style].format(weekdayDate(day));
}

/** The seven weekdays in display order, starting on the locale's first day. */
export function weekOrder(start: 0 | 1): number[] {
  return Array.from({ length: 7 }, (_, i) => (start + i) % 7);
}

/** "Every day", "Weekdays", "Weekends", "Every day except Fri", or the days themselves: "Mon, Wed, Fri". */
export function daysSummary(days: readonly number[], start: 0 | 1 = 1): string {
  const set = new Set(days);
  if (set.size >= 7) return 'Every day';
  if (set.size === 5 && [1, 2, 3, 4, 5].every((d) => set.has(d))) return 'Weekdays';
  if (set.size === 2 && set.has(0) && set.has(6)) return 'Weekends';
  if (set.size === 6) return `Every day except ${weekdayName([0, 1, 2, 3, 4, 5, 6].find((d) => !set.has(d))!, 'short')}`;
  return weekOrder(start)
    .filter((d) => set.has(d))
    .map((d) => weekdayName(d, 'short'))
    .join(', ');
}
