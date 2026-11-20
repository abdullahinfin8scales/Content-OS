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

  it('reorders the list', async () => {
    const a = await p.createNonNeg({ title: 'A', time: '06:00' });
    const b = await p.createNonNeg({ title: 'B', time: '07:00' });
    await p.reorderNonNeg(b.id, -1);
    const sorted = (await db.nonnegs.toArray()).sort((x, y) => x.order - y.order).map((x) => x.id);
    expect(sorted).toEqual([b.id, a.id]);
  });

  it('refuses a missing or invalid time', async () => {
    await expect(p.createNonNeg({ title: 'Gym', time: '' })).rejects.toThrow(/time/);
    await expect(p.createNonNeg({ title: 'Gym', time: '25:00' })).rejects.toThrow(/time/);
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

  it('protects non-negotiable copies from deletion and editing', async () => {
    const gym = await p.createNonNeg({ title: 'Gym', time: '06:00' });
    await p.ensureDay(TODAY, TODAY);
    const id = nnTaskId(gym.id, TODAY);
    await expect(p.deleteTask(id)).rejects.toThrow(/Non-negotiables/);
    await expect(p.updateTask(id, { time: '08:00' })).rejects.toThrow(/Non-negotiables/);
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
