import { describe, expect, it } from 'vitest';
import { daysLeftLabel, parseTaskInput, relativeDayName } from '../src/lib/personalText';

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
