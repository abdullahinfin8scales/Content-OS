import type { ContentDB } from './db';
import { countWords, emptyDoc, makeExcerpt, toPlainText } from './content';
import { isISODate, parseISODate, todayISO } from './dates';
import { uid } from './ids';
import { hourValue } from './personalText';
import { withoutUpload } from '../sync/outbox';
import type { DayLoss, DayWin, Goal, GoalMeasure, GoalPatch, ID, JournalEntry, NonNegotiable, Note, RichNode, Task, TaskPatch } from './types';

export class PersonalError extends Error {}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isHHMM(value: unknown): value is string {
  return typeof value === 'string' && HHMM.test(value);
}

/** A day's copy of a non-negotiable has a fixed id, so two devices can never make two copies. */
export function nnTaskId(nnId: ID, date: string): ID {
  return `nn-${nnId}-${date}`;
}

/** Every weekday, 0 = Sunday … 6 = Saturday. */
export const ALL_DAYS: readonly number[] = [0, 1, 2, 3, 4, 5, 6];

/** The weekdays a non-negotiable is on. Older records have none stored: every day. */
export function nnDays(nn: Pick<NonNegotiable, 'days'>): number[] {
  return nn.days?.length ? nn.days : [...ALL_DAYS];
}

/** Whether a non-negotiable belongs on a date: one of its weekdays, and not a single day off. */
export function nnOnDate(nn: Pick<NonNegotiable, 'days' | 'offDates'>, date: string): boolean {
  if (nn.offDates?.includes(date)) return false;
  return nnDays(nn).includes(parseISODate(date).getDay());
}

/** Unique weekdays, sorted. At least one is needed, or the non-negotiable would never appear. */
function cleanDays(days: readonly number[]): number[] {
  const out = [...new Set(days.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort((a, b) => a - b);
  if (!out.length) throw new PersonalError('Keep at least one day.');
  return out;
}

/** Days off, without the ones already past (they no longer matter: past days are never changed). */
function futureOffDates(dates: readonly string[] | undefined, today: string): string[] {
  return [...new Set((dates ?? []).filter((d) => isISODate(d) && d >= today))].sort();
}

/** Wins, losses and lessons are one line each. */
function cleanLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, 500);
}

export type DayItemKind = 'wins' | 'losses';

/** Where a task was dropped: an hour block (null = the Anytime list) and the tasks just above and below the spot. */
export interface DropSpot {
  hour: number | null;
  afterId: ID | null;
  beforeId: ID | null;
}

/**
 * The time a task takes when dropped in an hour block: the time of the task just
 * above it when that is in the same hour (so it stays below it), otherwise the
 * hour on the hour. Dropped in the Anytime list (null), it has no time.
 */
export function timeForDrop(hour: number | null, afterTime: string | null): string | null {
  if (hour === null) return null;
  return afterTime && Number(afterTime.slice(0, 2)) === hour ? afterTime : hourValue(hour);
}

/** Timeline order: by time (untimed first), then the order they were added. */
export function byTime(a: Task, b: Task): number {
  const ta = a.time ?? '';
  const tb = b.time ?? '';
  if (ta !== tb) return ta < tb ? -1 : 1;
  return a.order - b.order || a.createdAt - b.createdAt;
}

function cleanTitle(title: string, fallback: string): string {
  return title.replace(/\s+/g, ' ').trim() || fallback;
}

function cleanMeasure(m: GoalMeasure | null | undefined): GoalMeasure | null {
  if (!m) return null;
  const target = Number(m.target);
  if (!Number.isFinite(target) || target <= 0) return null;
  const current = Number(m.current);
  return { target, current: Number.isFinite(current) && current >= 0 ? current : 0, unit: (m.unit ?? '').trim().slice(0, 40) };
}

function derived(json: RichNode) {
  const text = toPlainText(json);
  return { excerpt: makeExcerpt(toPlainText(json, { headings: false })) || makeExcerpt(text), wordCount: countWords(text) };
}

/** Goal progress, 0–1: the measure when there is one, otherwise linked tasks done. */
export function goalProgress(goal: Goal, linked: Task[]): number {
  if (goal.status === 'achieved') return 1;
  if (goal.measure) return Math.max(0, Math.min(1, goal.measure.current / goal.measure.target));
  if (!linked.length) return 0;
  return linked.filter((t) => t.done).length / linked.length;
}

/**
 * Every personal write goes through here, so the day rules live in one tested place.
 *
 * Non-negotiables are copied onto each day as tasks. Those copies are derived
 * data: every device builds them itself from the non-negotiables list (see
 * `ensureDay`), so building them is never uploaded. A copy uploads only once
 * the user ticks it — that way a device that hasn't synced yet can never
 * overwrite a tick made on another device with a fresh, unticked copy.
 */
export class PersonalRepo {
  constructor(readonly db: ContentDB) {}

  /* ------------------------- Non-negotiables ------------------------- */

  async createNonNeg(input: { title: string; time: string; days?: readonly number[] }): Promise<NonNegotiable> {
    if (!isHHMM(input.time)) throw new PersonalError('Pick a time for this non-negotiable.');
    const days = cleanDays(input.days ?? ALL_DAYS);
    return this.db.transaction('rw', this.db.nonnegs, async () => {
      const all = await this.db.nonnegs.toArray();
      const t = Date.now();
      const nn: NonNegotiable = {
        id: uid(),
        title: cleanTitle(input.title, 'Untitled'),
        time: input.time,
        order: all.reduce((max, n) => Math.max(max, n.order), -1) + 1,
        archivedAt: null,
        days,
        offDates: [],
        createdAt: t,
        updatedAt: t,
      };
      await this.db.nonnegs.add(nn);
      return nn;
    });
  }

  /** Changes a non-negotiable. Today and later follow at once; past days keep what they had. */
  async updateNonNeg(id: ID, patch: { title?: string; time?: string; days?: readonly number[] }, today = todayISO()): Promise<void> {
    const nn = await this.db.nonnegs.get(id);
    if (!nn) throw new PersonalError('That non-negotiable no longer exists.');
    const next: Partial<NonNegotiable> = { updatedAt: Date.now() };
    if (patch.title !== undefined) next.title = cleanTitle(patch.title, nn.title);
    if (patch.time !== undefined) {
      if (!isHHMM(patch.time)) throw new PersonalError('Pick a valid time.');
      next.time = patch.time;
    }
    if (patch.days !== undefined) next.days = cleanDays(patch.days);
    await this.db.nonnegs.update(id, next);
    await this.syncCopies(id, today);
  }

  /**
   * Takes a non-negotiable off one day (today or later) only, e.g. no gym on a
   * holiday. That day's copy goes, done or not. Removing it uploads, like a
   * tick: it is the user's own choice, so every device must drop the copy.
   * Returns the removed copy, for undo.
   */
  async skipNonNegOn(id: ID, date: string, today = todayISO()): Promise<Task | undefined> {
    if (!isISODate(date) || date < today) throw new PersonalError('Past days can’t be changed.');
    return this.db.transaction('rw', this.db.nonnegs, this.db.tasks, async () => {
      const nn = await this.db.nonnegs.get(id);
      if (!nn) throw new PersonalError('That non-negotiable no longer exists.');
      await this.db.nonnegs.update(id, { offDates: futureOffDates([...(nn.offDates ?? []), date], today), updatedAt: Date.now() });
      const copy = await this.db.tasks.get(nnTaskId(id, date));
      if (copy) await this.db.tasks.delete(copy.id);
      return copy;
    });
  }

  /** Puts a skipped day back. A copy given (from `skipNonNegOn`) comes back as it was, tick included. */
  async unskipNonNegOn(id: ID, date: string, copy?: Task, today = todayISO()): Promise<void> {
    await this.db.transaction('rw', this.db.nonnegs, this.db.tasks, async () => {
      const nn = await this.db.nonnegs.get(id);
      if (!nn) return;
      await this.db.nonnegs.update(id, { offDates: futureOffDates(nn.offDates, today).filter((d) => d !== date), updatedAt: Date.now() });
      if (copy?.done) await this.db.tasks.put({ ...copy, updatedAt: Date.now() });
    });
    await this.ensureDay(date, today);
  }

  /** Moves a non-negotiable up (-1) or down (+1) in the list. */
  async reorderNonNeg(id: ID, dir: -1 | 1): Promise<void> {
    await this.db.transaction('rw', this.db.nonnegs, async () => {
      const list = (await this.db.nonnegs.toArray()).filter((n) => !n.archivedAt).sort((a, b) => a.order - b.order);
      const i = list.findIndex((n) => n.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= list.length) return;
      [list[i], list[j]] = [list[j], list[i]];
      const t = Date.now();
      await Promise.all(list.map((n, order) => (n.order === order ? null : this.db.nonnegs.update(n.id, { order, updatedAt: t }))));
    });
  }

  /** Takes a non-negotiable off the daily list. Past days, and copies already done, keep it. */
  async archiveNonNeg(id: ID, today = todayISO()): Promise<void> {
    const t = Date.now();
    await this.db.nonnegs.update(id, { archivedAt: t, updatedAt: t });
    await this.syncCopies(id, today);
  }

  /** Brings an archived non-negotiable back onto the daily list. */
  async restoreNonNeg(id: ID): Promise<void> {
    await this.db.nonnegs.update(id, { archivedAt: null, updatedAt: Date.now() });
  }

  /**
   * Deletes a non-negotiable for good (from the Removed list). Its not-done copies
   * today and later go with it; past days keep their copies as history.
   * Returns it, so it can be put back.
   */
  async deleteNonNeg(id: ID, today = todayISO()): Promise<NonNegotiable | undefined> {
    const nn = await this.db.nonnegs.get(id);
    if (!nn) return undefined;
    await this.db.nonnegs.delete(id);
    await this.syncCopies(id, today);
    return nn;
  }

  /** Puts back a non-negotiable deleted with `deleteNonNeg`. */
  async putBackNonNeg(nn: NonNegotiable): Promise<void> {
    await this.db.nonnegs.put({ ...nn, updatedAt: Date.now() });
  }

  /** Brings the not-done copies of one non-negotiable, today and later, in line with it (title, time, days). */
  private async syncCopies(nnId: ID, today: string): Promise<void> {
    const nn = await this.db.nonnegs.get(nnId);
    await withoutUpload(this.db, async () => {
      const copies = await this.db.tasks.where('nnId').equals(nnId).toArray();
      for (const c of copies) {
        if (c.done || c.date < today) continue;
        if (!nn || nn.archivedAt || !nnOnDate(nn, c.date)) await this.db.tasks.delete(c.id);
        else if (c.title !== nn.title || c.time !== nn.time) await this.db.tasks.put({ ...c, title: nn.title, time: nn.time });
      }
    });
  }

  /**
   * Makes sure a day (today or later) carries every active non-negotiable that
   * is on that day, at its time, and drops not-done copies of ones that were
   * removed or are off that day. Past days are
   * history and are never changed. Safe to call as often as needed: it writes
   * only when something differs. Returns whether anything changed.
   */
  async ensureDay(date: string, today = todayISO()): Promise<boolean> {
    if (!isISODate(date) || date < today) return false;
    const nns = await this.db.nonnegs.toArray();
    const active = nns.filter((n) => !n.archivedAt && nnOnDate(n, date));
    const byId = new Map(nns.map((n) => [n.id, n]));
    const copies = (await this.db.tasks.where('date').equals(date).toArray()).filter((t) => t.nnId);
    const have = new Set(copies.map((c) => c.nnId));

    const puts: Task[] = [];
    const deletes: ID[] = [];
    for (const c of copies) {
      if (c.done) continue;
      const nn = byId.get(c.nnId!);
      if (!nn || nn.archivedAt || !nnOnDate(nn, date)) deletes.push(c.id);
      else if (c.title !== nn.title || c.time !== nn.time) puts.push({ ...c, title: nn.title, time: nn.time });
    }
    const t = Date.now();
    for (const nn of active) {
      if (have.has(nn.id)) continue;
      puts.push({
        id: nnTaskId(nn.id, date),
        date,
        title: nn.title,
        time: nn.time,
        done: false,
        doneAt: null,
        goalId: null,
        nnId: nn.id,
        order: nn.order,
        createdAt: t,
        updatedAt: t,
      });
    }
    if (!puts.length && !deletes.length) return false;
    await withoutUpload(this.db, async () => {
      if (deletes.length) await this.db.tasks.bulkDelete(deletes);
      if (puts.length) await this.db.tasks.bulkPut(puts);
    });
    return true;
  }

  /* ------------------------------ Tasks ------------------------------ */

  async createTask(input: { date: string; title: string; time?: string | null; goalId?: ID | null }): Promise<Task> {
    if (!isISODate(input.date)) throw new PersonalError('A task needs a day.');
    const time = input.time ?? null;
    if (time !== null && !isHHMM(time)) throw new PersonalError('Pick a valid time.');
    return this.db.transaction('rw', this.db.tasks, async () => {
      const sameDay = await this.db.tasks.where('date').equals(input.date).toArray();
      const t = Date.now();
      const task: Task = {
        id: uid(),
        date: input.date,
        title: cleanTitle(input.title, 'Untitled task'),
        time,
        done: false,
        doneAt: null,
        goalId: input.goalId ?? null,
        nnId: null,
        order: sameDay.reduce((max, x) => Math.max(max, x.order), -1) + 1,
        createdAt: t,
        updatedAt: t,
      };
      await this.db.tasks.add(task);
      return task;
    });
  }

  async updateTask(id: ID, patch: TaskPatch): Promise<void> {
    const task = await this.db.tasks.get(id);
    if (!task) throw new PersonalError('That task no longer exists.');
    if (task.nnId && (patch.title !== undefined || patch.time !== undefined || patch.date !== undefined)) {
      throw new PersonalError('Change a non-negotiable from the Non-negotiables page.');
    }
    const next: Partial<Task> = { updatedAt: Date.now() };
    if (patch.title !== undefined) next.title = cleanTitle(patch.title, task.title);
    if (patch.time !== undefined) {
      if (patch.time !== null && !isHHMM(patch.time)) throw new PersonalError('Pick a valid time.');
      next.time = patch.time;
    }
    if (patch.date !== undefined) {
      if (!isISODate(patch.date)) throw new PersonalError('Pick a valid day.');
      next.date = patch.date;
    }
    if (patch.goalId !== undefined) next.goalId = patch.goalId;
    await this.db.tasks.update(id, next);
  }

  async setDone(id: ID, done: boolean): Promise<void> {
    const t = Date.now();
    await this.db.tasks.update(id, { done, doneAt: done ? t : null, updatedAt: t });
  }

  /**
   * Deletes a task and returns it (for undo). A non-negotiable's copy can only be
   * deleted from a past day; today and later, skip the day (`skipNonNegOn`) or
   * remove the non-negotiable itself (`archiveNonNeg`).
   */
  async deleteTask(id: ID, today = todayISO()): Promise<Task | undefined> {
    const task = await this.db.tasks.get(id);
    if (!task) return undefined;
    if (task.nnId && task.date >= today) throw new PersonalError('Non-negotiables stay on every day. Remove it from the Non-negotiables page.');
    await this.db.tasks.delete(id);
    return task;
  }

  async restoreTask(task: Task): Promise<void> {
    await this.db.tasks.put({ ...task, updatedAt: Date.now() });
  }

  /**
   * Drops one of the user's tasks at a spot on the day: into an hour block (or
   * the Anytime list), between the two tasks `afterId` and `beforeId` that sit
   * there (either may be missing). It lands exactly where it was dropped, and
   * takes the time that makes that true (`timeForDrop`): the hour on the hour,
   * or the time of the task just above it. Tasks at the same time are told apart
   * by `order`, so the new order sits between its neighbours' (non-negotiable
   * copies count as neighbours but are never written). Returns false when it was
   * already there, or the task is gone.
   */
  async placeTask(id: ID, spot: DropSpot): Promise<boolean> {
    if (spot.hour !== null && !(Number.isInteger(spot.hour) && spot.hour >= 0 && spot.hour <= 23)) throw new PersonalError('Pick a valid time.');
    return this.db.transaction('rw', this.db.tasks, async () => {
      const task = await this.db.tasks.get(id);
      if (!task) return false;
      if (task.nnId) throw new PersonalError('Change a non-negotiable from the Non-negotiables page.');
      const neighbour = async (nid: ID | null) => {
        const t = nid ? await this.db.tasks.get(nid) : undefined;
        return t && t.id !== id && t.date === task.date ? t : undefined;
      };
      const after = await neighbour(spot.afterId);
      const before = await neighbour(spot.beforeId);
      const time = timeForDrop(spot.hour, after?.time ?? null);
      const lo = after && after.time === time ? after.order : -Infinity;
      const hi = before && before.time === time ? before.order : Infinity;
      // Already there: same time, and its order already sits between its neighbours'.
      if (task.time === time && task.order > lo && task.order < hi) return false;
      let order = task.order;
      if (lo !== -Infinity && hi !== Infinity) order = (lo + hi) / 2;
      else if (lo !== -Infinity) order = lo + 1;
      else if (hi !== Infinity) order = hi - 1;
      await this.db.tasks.update(id, { time, order, updatedAt: Date.now() });
      return true;
    });
  }

  /**
   * Moves one of the user's tasks up or down one place, or to the top, inside
   * its own hour block (or the Anytime list). To go further, drag it or change
   * its time. Returns whether it moved.
   */
  async moveTask(id: ID, to: 'top' | 'up' | 'down'): Promise<boolean> {
    const task = await this.db.tasks.get(id);
    if (!task || task.nnId) return false;
    const hour = task.time ? Number(task.time.slice(0, 2)) : null;
    const zone = (await this.db.tasks.where('date').equals(task.date).toArray())
      .filter((x) => (x.time ? Number(x.time.slice(0, 2)) : null) === hour)
      .sort(byTime);
    const i = zone.findIndex((x) => x.id === id);
    const rest = zone.filter((x) => x.id !== id);
    const j = to === 'top' ? 0 : to === 'up' ? i - 1 : i + 1;
    if (i < 0 || j < 0 || j > rest.length || j === i) return false;
    return this.placeTask(id, { hour, afterId: rest[j - 1]?.id ?? null, beforeId: rest[j]?.id ?? null });
  }

  /**
   * Moves one of the user's tasks to another day, e.g. "Move to tomorrow" or back
   * to the day before. It goes to the end of that day, unless `order` is given
   * (undo puts it back where it was). Returns where it came from, for undo, or
   * undefined when nothing moved.
   */
  async moveTaskToDay(id: ID, date: string, order?: number): Promise<{ date: string; order: number } | undefined> {
    if (!isISODate(date)) throw new PersonalError('Pick a valid day.');
    return this.db.transaction('rw', this.db.tasks, async () => {
      const task = await this.db.tasks.get(id);
      if (!task) return undefined;
      if (task.nnId) throw new PersonalError('Change a non-negotiable from the Non-negotiables page.');
      if (task.date === date) return undefined;
      let next = order;
      if (next === undefined) {
        const sameDay = await this.db.tasks.where('date').equals(date).toArray();
        next = sameDay.reduce((max, x) => Math.max(max, x.order), -1) + 1;
      }
      await this.db.tasks.update(id, { date, order: next, updatedAt: Date.now() });
      return { date: task.date, order: task.order };
    });
  }

  /** Moves the user's own unfinished tasks from one day to another. Returns how many moved. */
  async moveUnfinished(fromDate: string, toDate: string): Promise<number> {
    if (!isISODate(fromDate) || !isISODate(toDate) || fromDate === toDate) return 0;
    return this.db.transaction('rw', this.db.tasks, async () => {
      const moving = (await this.db.tasks.where('date').equals(fromDate).toArray()).filter((t) => !t.done && !t.nnId).sort((a, b) => a.order - b.order);
      if (!moving.length) return 0;
      const target = await this.db.tasks.where('date').equals(toDate).toArray();
      let order = target.reduce((max, x) => Math.max(max, x.order), -1);
      const t = Date.now();
      await this.db.tasks.bulkPut(moving.map((task) => ({ ...task, date: toDate, order: ++order, updatedAt: t })));
      return moving.length;
    });
  }

  /* ------------------------------ Goals ------------------------------ */

  async createGoal(input: { title: string; targetDate: string; why?: string; measure?: GoalMeasure | null }, today = todayISO()): Promise<Goal> {
    if (!isISODate(input.targetDate)) throw new PersonalError('Pick a date to reach this goal by.');
    const t = Date.now();
    const goal: Goal = {
      id: uid(),
      title: cleanTitle(input.title, 'Untitled goal'),
      why: (input.why ?? '').trim(),
      startDate: today,
      targetDate: input.targetDate,
      status: 'active',
      measure: cleanMeasure(input.measure),
      createdAt: t,
      updatedAt: t,
    };
    await this.db.goals.add(goal);
    return goal;
  }

  async updateGoal(id: ID, patch: GoalPatch): Promise<void> {
    const goal = await this.db.goals.get(id);
    if (!goal) throw new PersonalError('That goal no longer exists.');
    const next: Partial<Goal> = { updatedAt: Date.now() };
    if (patch.title !== undefined) next.title = cleanTitle(patch.title, goal.title);
    if (patch.why !== undefined) next.why = patch.why;
    if (patch.status !== undefined) next.status = patch.status;
    if (patch.measure !== undefined) next.measure = cleanMeasure(patch.measure);
    for (const key of ['startDate', 'targetDate'] as const) {
      const v = patch[key];
      if (v === undefined) continue;
      if (!isISODate(v)) throw new PersonalError('Pick a valid date.');
      next[key] = v;
    }
    await this.db.goals.update(id, next);
  }

  /** Deletes a goal and unlinks its tasks. Returns what is needed to undo it. */
  async deleteGoal(id: ID): Promise<{ goal: Goal; taskIds: ID[] } | undefined> {
    return this.db.transaction('rw', this.db.goals, this.db.tasks, async () => {
      const goal = await this.db.goals.get(id);
      if (!goal) return undefined;
      const linked = await this.db.tasks.where('goalId').equals(id).toArray();
      const t = Date.now();
      await Promise.all(linked.map((task) => this.db.tasks.update(task.id, { goalId: null, updatedAt: t })));
      await this.db.goals.delete(id);
      return { goal, taskIds: linked.map((x) => x.id) };
    });
  }

  async restoreGoal(goal: Goal, taskIds: ID[]): Promise<void> {
    await this.db.transaction('rw', this.db.goals, this.db.tasks, async () => {
      const t = Date.now();
      await this.db.goals.put({ ...goal, updatedAt: t });
      for (const id of taskIds) if (await this.db.tasks.get(id)) await this.db.tasks.update(id, { goalId: goal.id, updatedAt: t });
    });
  }

  /* ----------------------------- Journal ----------------------------- */

  /** Saves a day's thoughts. An empty page doesn't create an entry. */
  async saveJournal(date: string, json: RichNode): Promise<void> {
    if (!isISODate(date)) throw new PersonalError('A journal entry needs a day.');
    const d = derived(json);
    await this.db.transaction('rw', this.db.journal, async () => {
      const cur = await this.db.journal.get(date);
      const t = Date.now();
      if (!cur) {
        if (!d.wordCount && !toPlainText(json).trim()) return;
        const entry: JournalEntry = { id: date, json, ...d, createdAt: t, updatedAt: t };
        await this.db.journal.add(entry);
      } else {
        await this.db.journal.put({ ...cur, json, ...d, updatedAt: t });
      }
    });
  }

  /* -------------------------- Wins and losses -------------------------- */

  /**
   * Reads a day's wins and losses, lets `fn` change the copies, and saves them on
   * the day's journal entry (made if needed). `fn` returns undefined to save nothing.
   */
  private async editDayItems<R>(date: string, fn: (lists: { wins: DayWin[]; losses: DayLoss[] }) => R | undefined): Promise<R | undefined> {
    if (!isISODate(date)) throw new PersonalError('Pick a valid day.');
    return this.db.transaction('rw', this.db.journal, async () => {
      const cur = await this.db.journal.get(date);
      const lists = { wins: [...(cur?.wins ?? [])], losses: [...(cur?.losses ?? [])] };
      const result = fn(lists);
      if (result === undefined) return undefined;
      const t = Date.now();
      const base: JournalEntry = cur ?? { id: date, json: emptyDoc(), excerpt: '', wordCount: 0, createdAt: t, updatedAt: t };
      await this.db.journal.put({ ...base, ...lists, updatedAt: t });
      return result;
    });
  }

  /** Adds something that went well. Empty text adds nothing. */
  async addWin(date: string, text: string): Promise<DayWin | undefined> {
    const clean = cleanLine(text);
    if (!clean) return undefined;
    return this.editDayItems(date, ({ wins }) => {
      const win: DayWin = { id: uid(), text: clean, createdAt: Date.now() };
      wins.push(win);
      return win;
    });
  }

  /** Adds something that went wrong, with the lesson it taught (can be written later). */
  async addLoss(date: string, text: string, lesson = ''): Promise<DayLoss | undefined> {
    const clean = cleanLine(text);
    if (!clean) return undefined;
    return this.editDayItems(date, ({ losses }) => {
      const loss: DayLoss = { id: uid(), text: clean, lesson: cleanLine(lesson), createdAt: Date.now() };
      losses.push(loss);
      return loss;
    });
  }

  /** Edits a win's or a loss's text (empty keeps the old text), or a loss's lesson (may be empty). */
  async updateDayItem(date: string, kind: DayItemKind, id: ID, patch: { text?: string; lesson?: string }): Promise<void> {
    await this.editDayItems(date, (lists) => {
      const list: (DayWin | DayLoss)[] = lists[kind];
      const i = list.findIndex((x) => x.id === id);
      if (i < 0) return undefined;
      const item = { ...list[i] };
      const text = patch.text === undefined ? item.text : cleanLine(patch.text) || item.text;
      let changed = text !== item.text;
      item.text = text;
      if (kind === 'losses' && patch.lesson !== undefined) {
        const lesson = cleanLine(patch.lesson);
        changed ||= lesson !== (item as DayLoss).lesson;
        (item as DayLoss).lesson = lesson;
      }
      if (!changed) return undefined;
      list[i] = item;
      return true;
    });
  }

  /** Removes a win or a loss. Returns it and where it was, for undo. */
  async removeDayItem(date: string, kind: DayItemKind, id: ID): Promise<{ item: DayWin | DayLoss; index: number } | undefined> {
    return this.editDayItems(date, (lists) => {
      const list: (DayWin | DayLoss)[] = lists[kind];
      const index = list.findIndex((x) => x.id === id);
      if (index < 0) return undefined;
      const [item] = list.splice(index, 1);
      return { item, index };
    });
  }

  /** Puts back a win or a loss removed with `removeDayItem`, where it was. */
  async restoreDayItem(date: string, kind: DayItemKind, item: DayWin | DayLoss, index: number): Promise<void> {
    await this.editDayItems(date, (lists) => {
      const list: (DayWin | DayLoss)[] = lists[kind];
      if (list.some((x) => x.id === item.id)) return undefined;
      list.splice(Math.min(index, list.length), 0, item);
      return true;
    });
  }

  /* ------------------------------ Notes ------------------------------ */

  async createNote(input: { title?: string; json?: RichNode } = {}): Promise<Note> {
    const t = Date.now();
    const json = input.json ?? emptyDoc();
    const note: Note = { id: uid(), title: (input.title ?? '').trim(), json, ...derived(json), pinned: false, createdAt: t, updatedAt: t };
    await this.db.notes.add(note);
    return note;
  }

  async updateNote(id: ID, patch: { title?: string; pinned?: boolean }): Promise<void> {
    // Notes hold rich-text JSON, which Dexie's typed `update` can't express: read, then put.
    await this.db.transaction('rw', this.db.notes, async () => {
      const note = await this.db.notes.get(id);
      if (!note) return;
      await this.db.notes.put({
        ...note,
        ...(patch.title !== undefined ? { title: patch.title } : {}),
        ...(patch.pinned !== undefined ? { pinned: patch.pinned } : {}),
        updatedAt: Date.now(),
      });
    });
  }

  async saveNoteContent(id: ID, json: RichNode): Promise<void> {
    await this.db.transaction('rw', this.db.notes, async () => {
      const note = await this.db.notes.get(id);
      if (note) await this.db.notes.put({ ...note, json, ...derived(json), updatedAt: Date.now() });
    });
  }

  async deleteNote(id: ID): Promise<Note | undefined> {
    const note = await this.db.notes.get(id);
    if (note) await this.db.notes.delete(id);
    return note;
  }

  async restoreNote(note: Note): Promise<void> {
    await this.db.notes.put({ ...note, updatedAt: Date.now() });
  }
}
