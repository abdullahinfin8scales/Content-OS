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

/** The HH:MM value of an hour, for creating a task at it. */
export function hourValue(hour: number): string {
  return `${pad(hour)}:00`;
}

export function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}
