import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { ContentDB } from '../src/lib/db';
import { byTime, goalProgress, nnTaskId, PersonalRepo } from '../src/lib/personalRepo';
import type { RichNode } from '../src/lib/types';
import { trackChanges } from '../src/sync/outbox';

let db: ContentDB;
let p: PersonalRepo;
let n = 0;

const TODAY = '2026-11-20';
const YESTERDAY = '2026-11-19';
const TOMORROW = '2026-11-21';

beforeEach(async () => {
  db = new ContentDB(`personal-${++n}-${Math.random()}`);
  trackChanges(db);
  await db.open();
  p = new PersonalRepo(db);
});

const dayTasks = async (date: string) => (await db.tasks.where('date').equals(date).toArray()).sort(byTime);

describe('non-negotiables on a day', () => {
  it('puts every active non-negotiable on today at its time, once', async () => {
    const gym = await p.createNonNeg({ title: ' Gym ', time: '06:00' });
    const read = await p.createNonNeg({ title: 'Read 20 pages', time: '22:00' });
    expect(await p.ensureDay(TODAY, TODAY)).toBe(true);
    expect(await p.ensureDay(TODAY, TODAY)).toBe(false); // idempotent

    const list = await dayTasks(TODAY);
    expect(list.map((t) => [t.title, t.time, t.nnId])).toEqual([
      ['Gym', '06:00', gym.id],
      ['Read 20 pages', '22:00', read.id],
    ]);
    expect(list[0].id).toBe(nnTaskId(gym.id, TODAY));
  });

  it('fills future days but never past ones', async () => {
    await p.createNonNeg({ title: 'Gym', time: '06:00' });
    expect(await p.ensureDay(YESTERDAY, TODAY)).toBe(false);
    expect(await dayTasks(YESTERDAY)).toHaveLength(0);
    await p.ensureDay(TOMORROW, TODAY);
    expect(await dayTasks(TOMORROW)).toHaveLength(1);
  });

  it('does not upload copies it builds, only ones the user ticks', async () => {
    const gym = await p.createNonNeg({ title: 'Gym', time: '06:00' });
    await db.outbox.clear();
    await p.ensureDay(TODAY, TODAY);
    expect(await db.outbox.count()).toBe(0);
    await p.setDone(nnTaskId(gym.id, TODAY), true);
    expect((await db.outbox.toArray()).map((e) => e.key)).toEqual([`task:${nnTaskId(gym.id, TODAY)}`]);
  });

  it('passes title and time changes to today and later, not to the past or to done copies', async () => {
    const gym = await p.createNonNeg({ title: 'Gym', time: '06:00' });
    // A copy made yesterday, when yesterday was "today".
    await p.ensureDay(YESTERDAY, YESTERDAY);
    await p.ensureDay(TODAY, TODAY);
    await p.ensureDay(TOMORROW, TODAY);
    await p.setDone(nnTaskId(gym.id, TOMORROW), true);

    await p.updateNonNeg(gym.id, { title: 'Gym (legs)', time: '07:30' }, TODAY);

    expect((await db.tasks.get(nnTaskId(gym.id, YESTERDAY)))!.time).toBe('06:00');
    expect((await db.tasks.get(nnTaskId(gym.id, TODAY)))!).toMatchObject({ title: 'Gym (legs)', time: '07:30' });
    expect((await db.tasks.get(nnTaskId(gym.id, TOMORROW)))!).toMatchObject({ title: 'Gym', time: '06:00', done: true });
  });

  it('removing one clears it from today but keeps past and done copies', async () => {
    const gym = await p.createNonNeg({ title: 'Gym', time: '06:00' });
    const read = await p.createNonNeg({ title: 'Read', time: '22:00' });
    await p.ensureDay(YESTERDAY, YESTERDAY);
    await p.ensureDay(TODAY, TODAY);
    await p.setDone(nnTaskId(read.id, TODAY), true);

    await p.archiveNonNeg(gym.id, TODAY);
    await p.archiveNonNeg(read.id, TODAY);

    expect(await db.tasks.get(nnTaskId(gym.id, TODAY))).toBeUndefined();
    expect(await db.tasks.get(nnTaskId(gym.id, YESTERDAY))).toBeDefined();
    expect(await db.tasks.get(nnTaskId(read.id, TODAY))).toBeDefined(); // done: kept as history
    await p.ensureDay(TOMORROW, TODAY);
    expect(await dayTasks(TOMORROW)).toHaveLength(0);
  });

  it('a day opened before a change catches up the next time it is opened', async () => {
    const gym = await p.createNonNeg({ title: 'Gym', time: '06:00' });
    await p.ensureDay(TOMORROW, TODAY);
    // The change arrives from another device: only the non-negotiable itself is updated.
    await db.nonnegs.update(gym.id, { time: '05:30' });
    await p.ensureDay(TOMORROW, TODAY);
    expect((await db.tasks.get(nnTaskId(gym.id, TOMORROW)))!.time).toBe('05:30');
  });

  it('deletes a non-negotiable for good, keeping past copies, and can put it back', async () => {
    const gym = await p.createNonNeg({ title: 'Gym', time: '06:00' });
    await p.ensureDay(YESTERDAY, YESTERDAY);
    await p.ensureDay(TODAY, TODAY);
    const removed = await p.deleteNonNeg(gym.id, TODAY);
    expect(await db.nonnegs.get(gym.id)).toBeUndefined();
    expect(await db.tasks.get(nnTaskId(gym.id, TODAY))).toBeUndefined();
    expect(await db.tasks.get(nnTaskId(gym.id, YESTERDAY))).toBeDefined();
    await p.ensureDay(TOMORROW, TODAY);
    expect(await dayTasks(TOMORROW)).toHaveLength(0);

    await p.putBackNonNeg(removed!);
    await p.ensureDay(TODAY, TODAY);
    expect(await db.tasks.get(nnTaskId(gym.id, TODAY))).toBeDefined();
  });

  it('reorders the list', async () => {
    const a = await p.createNonNeg({ title: 'A', time: '06:00' });
    const b = await p.createNonNeg({ title: 'B', time: '07:00' });
    await p.reorderNonNeg(b.id, -1);
    const sorted = (await db.nonnegs.toArray()).sort((x, y) => x.order - y.order).map((x) => x.id);
    expect(sorted).toEqual([b.id, a.id]);
  });

  it('an Anytime non-negotiable has no time: it lands in each day’s untimed list, and can take a time and go back', async () => {
    const water = await p.createNonNeg({ title: 'Drink water', time: null });
    expect(water.time).toBeNull();
    await p.ensureDay(TODAY, TODAY);
    const id = nnTaskId(water.id, TODAY);
    expect(await db.tasks.get(id)).toMatchObject({ title: 'Drink water', time: null, nnId: water.id });
    expect(await p.ensureDay(TODAY, TODAY)).toBe(false); // nothing to change on a second look

    await p.updateNonNeg(water.id, { time: '08:00' }, TODAY);
    expect((await db.tasks.get(id))!.time).toBe('08:00');
    await p.updateNonNeg(water.id, { time: null }, TODAY);
    expect((await db.tasks.get(id))!.time).toBeNull();
    await expect(p.updateNonNeg(water.id, { time: '' }, TODAY)).rejects.toThrow(/valid time/);
    expect((await db.nonnegs.get(water.id))!.time).toBeNull();
  });

  it('refuses a missing or invalid time', async () => {
    await expect(p.createNonNeg({ title: 'Gym', time: '' })).rejects.toThrow(/time/);
    await expect(p.createNonNeg({ title: 'Gym', time: '25:00' })).rejects.toThrow(/time/);
  });
});

describe('days a non-negotiable is on', () => {
  // TODAY (2026-11-20) is a Friday, TOMORROW a Saturday.
  const SUNDAY = '2026-11-22';
  const MONDAY = '2026-11-23';
  const WEEKDAYS = [1, 2, 3, 4, 5];

  it('only lands on its weekdays; older records without days mean every day', async () => {
    const gym = await p.createNonNeg({ title: 'Gym', time: '06:00', days: WEEKDAYS });
    expect(gym.days).toEqual(WEEKDAYS);
    for (const d of [TODAY, TOMORROW, SUNDAY, MONDAY]) await p.ensureDay(d, TODAY);
    expect(await db.tasks.get(nnTaskId(gym.id, TODAY))).toBeDefined();
    expect(await db.tasks.get(nnTaskId(gym.id, TOMORROW))).toBeUndefined();
    expect(await db.tasks.get(nnTaskId(gym.id, SUNDAY))).toBeUndefined();
    expect(await db.tasks.get(nnTaskId(gym.id, MONDAY))).toBeDefined();

    const old = await p.createNonNeg({ title: 'Read', time: '22:00' });
    await db.nonnegs.update(old.id, { days: undefined, offDates: undefined });
    await p.ensureDay(SUNDAY, TODAY);
    expect(await db.tasks.get(nnTaskId(old.id, SUNDAY))).toBeDefined();
  });

  it('changing the days clears not-done copies on days now off, keeps done ones and past days', async () => {
    const gym = await p.createNonNeg({ title: 'Gym', time: '06:00' });
    await p.ensureDay(YESTERDAY, YESTERDAY);
    for (const d of [TODAY, TOMORROW, SUNDAY]) await p.ensureDay(d, TODAY);
    await p.setDone(nnTaskId(gym.id, SUNDAY), true);

    await p.updateNonNeg(gym.id, { days: [4, 1, 1, 2, 3, 5] }, TODAY); // Mon–Fri, given unsorted with a repeat
    expect((await db.nonnegs.get(gym.id))!.days).toEqual(WEEKDAYS);
    expect(await db.tasks.get(nnTaskId(gym.id, TOMORROW))).toBeUndefined();
    expect(await db.tasks.get(nnTaskId(gym.id, SUNDAY))).toBeDefined(); // done: kept
    expect(await db.tasks.get(nnTaskId(gym.id, TODAY))).toBeDefined();
    expect(await db.tasks.get(nnTaskId(gym.id, YESTERDAY))).toBeDefined();

    await p.updateNonNeg(gym.id, { days: [0, 6] }, TODAY);
    expect(await db.tasks.get(nnTaskId(gym.id, TODAY))).toBeUndefined();
    await p.ensureDay(TOMORROW, TODAY);
    expect(await db.tasks.get(nnTaskId(gym.id, TOMORROW))).toBeDefined();
  });

  it('needs at least one day', async () => {
    await expect(p.createNonNeg({ title: 'Gym', time: '06:00', days: [] })).rejects.toThrow(/at least one day/);
    const gym = await p.createNonNeg({ title: 'Gym', time: '06:00' });
    await expect(p.updateNonNeg(gym.id, { days: [9] }, TODAY)).rejects.toThrow(/at least one day/);
  });

  it('skips a single day, done or not, and undo brings it back as it was', async () => {
    const gym = await p.createNonNeg({ title: 'Gym', time: '06:00' });
    await p.ensureDay(TODAY, TODAY);
    await p.ensureDay(TOMORROW, TODAY);
    await p.setDone(nnTaskId(gym.id, TODAY), true);
    await db.outbox.clear();

    const copy = await p.skipNonNegOn(gym.id, TODAY, TODAY);
    expect(copy?.done).toBe(true);
    expect(await db.tasks.get(nnTaskId(gym.id, TODAY))).toBeUndefined();
    expect((await db.nonnegs.get(gym.id))!.offDates).toEqual([TODAY]);
    // The removal uploads, so other devices drop the copy too.
    expect((await db.outbox.toArray()).map((e) => e.key).sort()).toEqual([`nonneg:${gym.id}`, `task:${nnTaskId(gym.id, TODAY)}`]);
    // Rebuilding the day doesn't bring it back; other days are untouched.
    await p.ensureDay(TODAY, TODAY);
    expect(await db.tasks.get(nnTaskId(gym.id, TODAY))).toBeUndefined();
    expect(await db.tasks.get(nnTaskId(gym.id, TOMORROW))).toBeDefined();

    await p.unskipNonNegOn(gym.id, TODAY, copy, TODAY);
    expect((await db.nonnegs.get(gym.id))!.offDates).toEqual([]);
    expect((await db.tasks.get(nnTaskId(gym.id, TODAY)))!.done).toBe(true);
  });

  it('putting back a skipped day without a copy rebuilds it', async () => {
    const gym = await p.createNonNeg({ title: 'Gym', time: '06:00' });
    await p.skipNonNegOn(gym.id, MONDAY, TODAY);
    await p.ensureDay(MONDAY, TODAY);
    expect(await db.tasks.get(nnTaskId(gym.id, MONDAY))).toBeUndefined();
    await p.unskipNonNegOn(gym.id, MONDAY, undefined, TODAY);
    expect((await db.tasks.get(nnTaskId(gym.id, MONDAY)))!.done).toBe(false);
  });

  it('refuses to skip a past day, and forgets days off once they are past', async () => {
    const gym = await p.createNonNeg({ title: 'Gym', time: '06:00' });
    await expect(p.skipNonNegOn(gym.id, YESTERDAY, TODAY)).rejects.toThrow(/Past days/);
    await p.skipNonNegOn(gym.id, TODAY, YESTERDAY); // made yesterday
    await p.skipNonNegOn(gym.id, MONDAY, TOMORROW); // made two days later: TODAY is now past
    expect((await db.nonnegs.get(gym.id))!.offDates).toEqual([MONDAY]);
  });
});

describe('tasks', () => {
  it('sorts untimed tasks first, then by time', async () => {
    await p.createTask({ date: TODAY, title: 'Late', time: '18:00' });
    await p.createTask({ date: TODAY, title: 'Anytime' });
    await p.createTask({ date: TODAY, title: 'Early', time: '09:00' });
    expect((await dayTasks(TODAY)).map((t) => t.title)).toEqual(['Anytime', 'Early', 'Late']);
  });

  it('ticks, edits and deletes with undo', async () => {
    const t = await p.createTask({ date: TODAY, title: 'Call accountant' });
    await p.setDone(t.id, true);
    expect((await db.tasks.get(t.id))!.doneAt).toBeTypeOf('number');
    await p.setDone(t.id, false);
    expect((await db.tasks.get(t.id))!.doneAt).toBeNull();
    await p.updateTask(t.id, { title: 'Call the accountant', time: '11:00' });
    expect(await db.tasks.get(t.id)).toMatchObject({ title: 'Call the accountant', time: '11:00' });
    const removed = await p.deleteTask(t.id);
    expect(await db.tasks.get(t.id)).toBeUndefined();
    await p.restoreTask(removed!);
    expect(await db.tasks.get(t.id)).toBeDefined();
  });

  it('sets, changes and clears a task’s priority; moving it keeps the priority; junk and non-negotiable copies are refused', async () => {
    const plain = await p.createTask({ date: TODAY, title: 'Plain' });
    expect(plain.priority).toBeNull();
    const hot = await p.createTask({ date: TODAY, title: 'Hot', priority: 'important' });
    expect((await db.tasks.get(hot.id))!.priority).toBe('important');

    await p.updateTask(plain.id, { priority: 'needed' });
    expect((await db.tasks.get(plain.id))!.priority).toBe('needed');
    await p.updateTask(plain.id, { priority: 'low' });
    expect((await db.tasks.get(plain.id))!.priority).toBe('low');
    await p.updateTask(plain.id, { priority: null });
    expect((await db.tasks.get(plain.id))!.priority).toBeNull();
    await p.updateTask(hot.id, { title: 'Hot, still' }); // other edits leave it alone
    expect((await db.tasks.get(hot.id))!.priority).toBe('important');

    await p.placeTask(hot.id, { hour: 14, afterId: null, beforeId: null });
    await p.moveTaskToDay(hot.id, TOMORROW);
    expect(await db.tasks.get(hot.id)).toMatchObject({ date: TOMORROW, time: '14:00', priority: 'important' });

    await expect(p.updateTask(plain.id, { priority: 'urgent' as never })).rejects.toThrow(/valid priority/);
    await expect(p.createTask({ date: TODAY, title: 'X', priority: 'urgent' as never })).rejects.toThrow(/valid priority/);
    const gym = await p.createNonNeg({ title: 'Gym', time: '06:00' });
    await p.ensureDay(TODAY, TODAY);
    await expect(p.updateTask(nnTaskId(gym.id, TODAY), { priority: 'low' })).rejects.toThrow(/Non-negotiables/);
  });

  describe('dropping a task on the day', () => {
    const names = async (date = TODAY) => (await dayTasks(date)).map((t) => t.title);

    it('puts Anytime tasks in a new order; new tasks still go last; dropping in place writes nothing', async () => {
      const a = await p.createTask({ date: TODAY, title: 'A' });
      const b = await p.createTask({ date: TODAY, title: 'B' });
      const c = await p.createTask({ date: TODAY, title: 'C' });
      expect(await p.placeTask(c.id, { hour: null, afterId: null, beforeId: a.id })).toBe(true);
      expect(await names()).toEqual(['C', 'A', 'B']);
      expect((await db.tasks.get(c.id))!.time).toBeNull();
      await p.createTask({ date: TODAY, title: 'D' });
      expect(await names()).toEqual(['C', 'A', 'B', 'D']);

      await db.outbox.clear();
      expect(await p.placeTask(c.id, { hour: null, afterId: null, beforeId: a.id })).toBe(false); // already there
      expect(await p.placeTask(a.id, { hour: null, afterId: c.id, beforeId: b.id })).toBe(false);
      expect(await db.outbox.count()).toBe(0);

      await p.placeTask(b.id, { hour: null, afterId: c.id, beforeId: a.id }); // between C and A
      expect(await names()).toEqual(['C', 'B', 'A', 'D']);
    });

    it('moves a task to another hour, between tasks, or back to Anytime, and its time follows', async () => {
      const nine = await p.createTask({ date: TODAY, title: 'Nine', time: '09:00' });
      const half = await p.createTask({ date: TODAY, title: 'Half', time: '09:30' });
      const late = await p.createTask({ date: TODAY, title: 'Late', time: '15:00' });
      const any = await p.createTask({ date: TODAY, title: 'Any' });
      const timeOf = async (id: string) => (await db.tasks.get(id))!.time;

      // Into an empty hour: the hour on the hour.
      await p.placeTask(late.id, { hour: 7, afterId: null, beforeId: null });
      expect(await timeOf(late.id)).toBe('07:00');
      expect(await names()).toEqual(['Any', 'Late', 'Nine', 'Half']);
      // Above the first task of an hour: that hour's start, ahead of it even when that is its time too.
      await p.placeTask(late.id, { hour: 9, afterId: null, beforeId: nine.id });
      expect(await timeOf(late.id)).toBe('09:00');
      expect(await names()).toEqual(['Any', 'Late', 'Nine', 'Half']);
      // Below a task: its time, after it.
      await p.placeTask(late.id, { hour: 9, afterId: nine.id, beforeId: half.id });
      expect(await timeOf(late.id)).toBe('09:00');
      expect(await names()).toEqual(['Any', 'Nine', 'Late', 'Half']);
      await p.placeTask(late.id, { hour: 9, afterId: half.id, beforeId: null });
      expect(await timeOf(late.id)).toBe('09:30');
      expect(await names()).toEqual(['Any', 'Nine', 'Half', 'Late']);
      // Back to Anytime: no time.
      await p.placeTask(late.id, { hour: null, afterId: any.id, beforeId: null });
      expect(await timeOf(late.id)).toBeNull();
      expect(await names()).toEqual(['Any', 'Late', 'Nine', 'Half']);
      // And from Anytime into the schedule.
      await p.placeTask(any.id, { hour: 18, afterId: null, beforeId: null });
      expect(await timeOf(any.id)).toBe('18:00');
    });

    it('slots in between tasks at the same time, and around a non-negotiable that is never written', async () => {
      const gym = await p.createNonNeg({ title: 'Gym', time: '09:00' });
      await p.ensureDay(TODAY, TODAY);
      const copy = nnTaskId(gym.id, TODAY);
      const u = await p.createTask({ date: TODAY, title: 'U', time: '09:00' });
      const v = await p.createTask({ date: TODAY, title: 'V' });
      await db.outbox.clear();

      await p.placeTask(v.id, { hour: 9, afterId: null, beforeId: copy }); // above Gym
      expect(await names()).toEqual(['V', 'Gym', 'U']);
      await p.placeTask(v.id, { hour: 9, afterId: copy, beforeId: u.id }); // between Gym and U
      expect(await names()).toEqual(['Gym', 'V', 'U']);
      await p.placeTask(v.id, { hour: 9, afterId: u.id, beforeId: null }); // below U
      expect(await names()).toEqual(['Gym', 'U', 'V']);

      expect((await db.outbox.toArray()).map((e) => e.key)).toEqual([`task:${v.id}`]); // only V was written
      expect((await db.tasks.get(copy))!.order).toBe(0);
    });

    it('refuses non-negotiable copies and bad hours, and ignores tasks that are gone or neighbours from another day', async () => {
      const gym = await p.createNonNeg({ title: 'Gym', time: '09:00' });
      await p.ensureDay(TODAY, TODAY);
      const a = await p.createTask({ date: TODAY, title: 'A' });
      const other = await p.createTask({ date: YESTERDAY, title: 'Other', time: '10:00' });
      await expect(p.placeTask(nnTaskId(gym.id, TODAY), { hour: 12, afterId: null, beforeId: null })).rejects.toThrow(/Non-negotiables/);
      await expect(p.placeTask(a.id, { hour: 24, afterId: null, beforeId: null })).rejects.toThrow(/valid time/);
      await expect(p.placeTask(a.id, { hour: 1.5, afterId: null, beforeId: null })).rejects.toThrow(/valid time/);
      expect(await p.placeTask('gone', { hour: 8, afterId: null, beforeId: null })).toBe(false);
      await p.placeTask(a.id, { hour: 10, afterId: other.id, beforeId: null });
      expect((await db.tasks.get(a.id))!.time).toBe('10:00'); // yesterday's task above it did not count
    });

    it('moves up, down or to the top inside its own hour, never into another', async () => {
      const a = await p.createTask({ date: TODAY, title: 'A' });
      const b = await p.createTask({ date: TODAY, title: 'B' });
      const c = await p.createTask({ date: TODAY, title: 'C' });
      expect(await p.moveTask(c.id, 'top')).toBe(true);
      expect(await names()).toEqual(['C', 'A', 'B']);
      expect(await p.moveTask(c.id, 'up')).toBe(false);
      expect(await p.moveTask(a.id, 'down')).toBe(true);
      expect(await names()).toEqual(['C', 'B', 'A']);
      expect(await p.moveTask(a.id, 'down')).toBe(false);
      expect(await p.moveTask(b.id, 'up')).toBe(true);
      expect(await names()).toEqual(['B', 'C', 'A']);

      const x = await p.createTask({ date: TODAY, title: 'X', time: '09:00' });
      const y = await p.createTask({ date: TODAY, title: 'Y', time: '09:30' });
      const z = await p.createTask({ date: TODAY, title: 'Z', time: '15:00' });
      expect(await p.moveTask(y.id, 'top')).toBe(true); // Y takes 09:00 so it can sit above X
      expect((await db.tasks.get(y.id))!.time).toBe('09:00');
      expect(await names()).toEqual(['B', 'C', 'A', 'Y', 'X', 'Z']);
      expect(await p.moveTask(z.id, 'top')).toBe(false); // alone in its hour
      expect(await p.moveTask(x.id, 'down')).toBe(false);
    });
  });

  it('protects non-negotiable copies from deletion and editing', async () => {
    const gym = await p.createNonNeg({ title: 'Gym', time: '06:00' });
    await p.ensureDay(TODAY, TODAY);
    const id = nnTaskId(gym.id, TODAY);
    await expect(p.deleteTask(id, TODAY)).rejects.toThrow(/Non-negotiables/);
    await expect(p.updateTask(id, { time: '08:00' })).rejects.toThrow(/Non-negotiables/);
  });

  it('lets a past day’s copy of a non-negotiable be deleted, and never rebuilds it', async () => {
    const gym = await p.createNonNeg({ title: 'Gym', time: '06:00' });
    await p.ensureDay(YESTERDAY, YESTERDAY);
    const removed = await p.deleteTask(nnTaskId(gym.id, YESTERDAY), TODAY);
    expect(removed?.nnId).toBe(gym.id);
    await p.ensureDay(YESTERDAY, TODAY);
    expect(await db.tasks.get(nnTaskId(gym.id, YESTERDAY))).toBeUndefined();
  });

  it('moves a task to another day, forwards or back, and undo puts it back where it was', async () => {
    const a = await p.createTask({ date: TODAY, title: 'A' });
    const b = await p.createTask({ date: TODAY, title: 'B' });
    await p.createTask({ date: TOMORROW, title: 'Existing' });

    const from = await p.moveTaskToDay(a.id, TOMORROW);
    expect(from).toEqual({ date: TODAY, order: a.order });
    expect((await dayTasks(TOMORROW)).map((t) => t.title)).toEqual(['Existing', 'A']); // goes last
    expect((await dayTasks(TODAY)).map((t) => t.title)).toEqual(['B']);

    await p.moveTaskToDay(a.id, from!.date, from!.order); // undo
    expect((await dayTasks(TODAY)).map((t) => t.title)).toEqual(['A', 'B']);
    expect((await dayTasks(TOMORROW)).map((t) => t.title)).toEqual(['Existing']);

    // Back to the day before, from where it was moved by mistake.
    await p.moveTaskToDay(b.id, TOMORROW);
    await p.moveTaskToDay(b.id, TODAY);
    expect((await dayTasks(TODAY)).map((t) => t.title)).toEqual(['A', 'B']);
    await p.moveTaskToDay(a.id, YESTERDAY);
    expect((await dayTasks(YESTERDAY)).map((t) => t.title)).toEqual(['A']);
  });

  it('moving to the same day does nothing; non-negotiable copies, bad days and missing tasks are handled', async () => {
    const gym = await p.createNonNeg({ title: 'Gym', time: '06:00' });
    await p.ensureDay(TODAY, TODAY);
    const a = await p.createTask({ date: TODAY, title: 'A' });
    expect(await p.moveTaskToDay(a.id, TODAY)).toBeUndefined();
    expect(await p.moveTaskToDay('gone', TOMORROW)).toBeUndefined();
    await expect(p.moveTaskToDay(a.id, 'tomorrow')).rejects.toThrow(/valid day/);
    await expect(p.moveTaskToDay(nnTaskId(gym.id, TODAY), TOMORROW)).rejects.toThrow(/Non-negotiables/);
  });

  it('moves unfinished own tasks to another day, leaving done ones and non-negotiables', async () => {
    const gym = await p.createNonNeg({ title: 'Gym', time: '06:00' });
    await p.ensureDay(YESTERDAY, YESTERDAY);
    const open = await p.createTask({ date: YESTERDAY, title: 'Open' });
    const done = await p.createTask({ date: YESTERDAY, title: 'Done' });
    await p.setDone(done.id, true);
    await p.createTask({ date: TODAY, title: 'Already today' });

    expect(await p.moveUnfinished(YESTERDAY, TODAY)).toBe(1);
    expect((await db.tasks.get(open.id))!.date).toBe(TODAY);
    expect((await db.tasks.get(done.id))!.date).toBe(YESTERDAY);
    expect((await db.tasks.get(nnTaskId(gym.id, YESTERDAY)))!.date).toBe(YESTERDAY);
    expect(await p.moveUnfinished(YESTERDAY, TODAY)).toBe(0);
  });
});

describe('goals', () => {
  it('tracks progress by measure, or by linked tasks', async () => {
    const g = await p.createGoal({ title: '10k followers', targetDate: '2026-12-31', measure: { current: 2500, target: 10000, unit: 'followers' } }, TODAY);
    expect(g.startDate).toBe(TODAY);
    expect(goalProgress(g, [])).toBe(0.25);

    const h = await p.createGoal({ title: 'Launch course', targetDate: '2026-12-01' }, TODAY);
    const a = await p.createTask({ date: TODAY, title: 'Outline', goalId: h.id });
    await p.createTask({ date: TODAY, title: 'Record', goalId: h.id });
    await p.setDone(a.id, true);
    const linked = await db.tasks.where('goalId').equals(h.id).toArray();
    expect(goalProgress(h, linked)).toBe(0.5);
    expect(goalProgress({ ...h, status: 'achieved' }, linked)).toBe(1);
  });

  it('deleting a goal unlinks its tasks, and undo links them again', async () => {
    const g = await p.createGoal({ title: 'Goal', targetDate: '2026-12-31' }, TODAY);
    const t = await p.createTask({ date: TODAY, title: 'Step', goalId: g.id });
    const undo = await p.deleteGoal(g.id);
    expect(await db.goals.get(g.id)).toBeUndefined();
    expect((await db.tasks.get(t.id))!.goalId).toBeNull();
    await p.restoreGoal(undo!.goal, undo!.taskIds);
    expect((await db.tasks.get(t.id))!.goalId).toBe(g.id);
  });

  it('drops an invalid measure', async () => {
    const g = await p.createGoal({ title: 'G', targetDate: '2026-12-31', measure: { current: 1, target: 0, unit: '' } }, TODAY);
    expect(g.measure).toBeNull();
  });
});

describe('journal and notes', () => {
  const doc = (s: string): RichNode => ({ type: 'doc', content: [{ type: 'paragraph', content: s ? [{ type: 'text', text: s }] : [] }] });

  it('does not create an entry for an empty day, then saves thoughts', async () => {
    await p.saveJournal(TODAY, doc(''));
    expect(await db.journal.get(TODAY)).toBeUndefined();
    await p.saveJournal(TODAY, doc('Good focus today'));
    expect(await db.journal.get(TODAY)).toMatchObject({ excerpt: 'Good focus today', wordCount: 3 });
  });

  it('keeps a day’s wins and losses (with lessons) beside its thoughts', async () => {
    expect(await p.addWin(TODAY, '   ')).toBeUndefined();
    expect(await db.journal.get(TODAY)).toBeUndefined();

    const w1 = await p.addWin(TODAY, ' Closed  the deal ');
    const w2 = await p.addWin(TODAY, 'Gym before 7');
    const loss = await p.addLoss(TODAY, 'Lost 2 hours on my phone');
    expect(w1!.text).toBe('Closed the deal');
    let entry = (await db.journal.get(TODAY))!;
    expect(entry.wins!.map((w) => w.text)).toEqual(['Closed the deal', 'Gym before 7']);
    expect(entry.losses).toEqual([expect.objectContaining({ text: 'Lost 2 hours on my phone', lesson: '' })]);
    expect(entry.wordCount).toBe(0);

    // Writing thoughts keeps the wins, and wins keep the thoughts.
    await p.saveJournal(TODAY, doc('Good focus today'));
    await p.updateDayItem(TODAY, 'losses', loss!.id, { lesson: 'Phone stays in the other room' });
    await p.updateDayItem(TODAY, 'wins', w2!.id, { text: '' }); // empty keeps the old text
    entry = (await db.journal.get(TODAY))!;
    expect(entry.excerpt).toBe('Good focus today');
    expect(entry.wins).toHaveLength(2);
    expect(entry.wins![1].text).toBe('Gym before 7');
    expect(entry.losses![0].lesson).toBe('Phone stays in the other room');

    const removed = await p.removeDayItem(TODAY, 'wins', w1!.id);
    expect((await db.journal.get(TODAY))!.wins!.map((w) => w.text)).toEqual(['Gym before 7']);
    await p.restoreDayItem(TODAY, 'wins', removed!.item, removed!.index);
    expect((await db.journal.get(TODAY))!.wins!.map((w) => w.text)).toEqual(['Closed the deal', 'Gym before 7']);
  });

  it('creates, edits, deletes and restores notes', async () => {
    const note = await p.createNote({ title: 'Ideas' });
    await p.saveNoteContent(note.id, doc('One two'));
    await p.updateNote(note.id, { pinned: true });
    expect(await db.notes.get(note.id)).toMatchObject({ title: 'Ideas', excerpt: 'One two', wordCount: 2, pinned: true });
    const removed = await p.deleteNote(note.id);
    expect(await db.notes.get(note.id)).toBeUndefined();
    await p.restoreNote(removed!);
    expect((await db.notes.get(note.id))!.title).toBe('Ideas');
  });
});
