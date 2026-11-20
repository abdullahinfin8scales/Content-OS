import { describe, expect, it } from 'vitest';
import { daysLeftLabel, daysSummary, parseTaskInput, relativeDayName, weekdayName, weekOrder } from '../src/lib/personalText';

describe('parseTaskInput', () => {
  it('reads a time at the end of a task', () => {
    expect(parseTaskInput('Call accountant at 3pm')).toEqual({ title: 'Call accountant', time: '15:00' });
    expect(parseTaskInput('Gym 6:30am')).toEqual({ title: 'Gym', time: '06:30' });
    expect(parseTaskInput('Standup @ 09:15')).toEqual({ title: 'Standup', time: '09:15' });
    expect(parseTaskInput('Review 14:00')).toEqual({ title: 'Review', time: '14:00' });
    expect(parseTaskInput('Lunch at 12pm')).toEqual({ title: 'Lunch', time: '12:00' });
    expect(parseTaskInput('Sleep at 12am')).toEqual({ title: 'Sleep', time: '00:00' });
    expect(parseTaskInput('Deep work at 9')).toEqual({ title: 'Deep work', time: '09:00' });
    expect(parseTaskInput('  Post   reel  at 7 p.m. ')).toEqual({ title: 'Post reel', time: '19:00' });
  });

  it('leaves plain numbers and odd values alone', () => {
    expect(parseTaskInput('Read 20')).toEqual({ title: 'Read 20', time: null });
    expect(parseTaskInput('Read 20 pages')).toEqual({ title: 'Read 20 pages', time: null });
    expect(parseTaskInput('Meet at 25')).toEqual({ title: 'Meet at 25', time: null });
    expect(parseTaskInput('Call at 13pm')).toEqual({ title: 'Call at 13pm', time: null });
    expect(parseTaskInput('3pm')).toEqual({ title: '3pm', time: null });
    expect(parseTaskInput('Write the hook')).toEqual({ title: 'Write the hook', time: null });
  });
});

describe('day labels', () => {
  it('counts days to a goal', () => {
    expect(daysLeftLabel('2026-12-31', '2026-11-20')).toBe('41 days left');
    expect(daysLeftLabel('2026-11-20', '2026-11-20')).toBe('Due today');
    expect(daysLeftLabel('2026-11-21', '2026-11-20')).toBe('Due tomorrow');
    expect(daysLeftLabel('2026-11-17', '2026-11-20')).toBe('3 days over');
  });

  it('names nearby days', () => {
    expect(relativeDayName('2026-11-20', '2026-11-20')).toBe('Today');
    expect(relativeDayName('2026-11-19', '2026-11-20')).toBe('Yesterday');
    expect(relativeDayName('2026-11-21', '2026-11-20')).toBe('Tomorrow');
    expect(relativeDayName('2026-11-25', '2026-11-20')).toBeNull();
  });
});

describe('clock labels', () => {
  it('follows a 12- or 24-hour clock', async () => {
    const { clockLabel } = await import('../src/lib/personalText');
    expect(clockLabel('06:00', { twelveHour: true, compact: true })).toBe('6 AM');
    expect(clockLabel('18:30', { twelveHour: true })).toBe('6:30 PM');
    expect(clockLabel('00:15', { twelveHour: true })).toBe('12:15 AM');
    expect(clockLabel('12:00', { twelveHour: true, compact: true })).toBe('12 PM');
    expect(clockLabel('06:00', { twelveHour: false, compact: true })).toBe('06:00');
    expect(clockLabel('18:30', { twelveHour: false })).toBe('18:30');
  });
});

describe('time picker text', () => {
  it('reads typed times', async () => {
    const { parseTimeText } = await import('../src/lib/personalText');
    expect(parseTimeText('6')).toBe('06:00');
    expect(parseTimeText('6pm')).toBe('18:00');
    expect(parseTimeText('6 p.m.')).toBe('18:00');
    expect(parseTimeText('6p')).toBe('18:00');
    expect(parseTimeText('6:30 pm')).toBe('18:30');
    expect(parseTimeText('630pm')).toBe('18:30');
    expect(parseTimeText('18:30')).toBe('18:30');
    expect(parseTimeText('0630')).toBe('06:30');
    expect(parseTimeText('12am')).toBe('00:00');
    expect(parseTimeText('12:15pm')).toBe('12:15');
    expect(parseTimeText('25')).toBeNull();
    expect(parseTimeText('13pm')).toBeNull();
    expect(parseTimeText('6:75')).toBeNull();
    expect(parseTimeText('gym')).toBeNull();
  });

  it('filters the list the way Google Calendar does', async () => {
    const { matchTimes, TIME_SLOTS, nextQuarterHour } = await import('../src/lib/personalText');
    expect(TIME_SLOTS).toHaveLength(96);
    expect(matchTimes('6:3', TIME_SLOTS, true)).toEqual(['06:30', '18:30']);
    expect(matchTimes('6p', TIME_SLOTS, true)[0]).toBe('18:00');
    expect(matchTimes('18', TIME_SLOTS, true)).toEqual(['18:00', '18:15', '18:30', '18:45']);
    expect(matchTimes('', TIME_SLOTS, true)).toHaveLength(96);
    expect(nextQuarterHour(new Date(2026, 10, 20, 9, 7))).toBe('09:15');
    expect(nextQuarterHour(new Date(2026, 10, 20, 9, 15))).toBe('09:30');
    expect(nextQuarterHour(new Date(2026, 10, 20, 23, 59))).toBe('23:45');
  });
});

describe('weekdays', () => {
  it('orders the week from the locale’s first day', () => {
    expect(weekOrder(1)).toEqual([1, 2, 3, 4, 5, 6, 0]);
    expect(weekOrder(0)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('sums up a non-negotiable’s days', () => {
    const name = (d: number) => weekdayName(d, 'short');
    expect(daysSummary([0, 1, 2, 3, 4, 5, 6])).toBe('Every day');
    expect(daysSummary([5, 1, 2, 3, 4])).toBe('Weekdays');
    expect(daysSummary([6, 0])).toBe('Weekends');
    expect(daysSummary([0, 1, 2, 3, 4, 6])).toBe(`Every day except ${name(5)}`);
    expect(daysSummary([5, 1, 3], 1)).toBe([1, 3, 5].map(name).join(', '));
    expect(daysSummary([0, 6], 1)).toBe('Weekends');
    expect(daysSummary([0, 3], 1)).toBe(`${name(3)}, ${name(0)}`); // Sunday last when the week starts on Monday
  });
});
