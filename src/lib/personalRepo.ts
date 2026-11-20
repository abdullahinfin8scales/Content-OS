import type { ContentDB } from './db';
import { countWords, emptyDoc, makeExcerpt, toPlainText } from './content';
import { isISODate, todayISO } from './dates';
import { uid } from './ids';
import { withoutUpload } from '../sync/outbox';
import type { Goal, GoalMeasure, GoalPatch, ID, JournalEntry, NonNegotiable, Note, RichNode, Task, TaskPatch } from './types';

export class PersonalError extends Error {}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isHHMM(value: unknown): value is string {
  return typeof value === 'string' && HHMM.test(value);
}

/** A day's copy of a non-negotiable has a fixed id, so two devices can never make two copies. */
export function nnTaskId(nnId: ID, date: string): ID {
  return `nn-${nnId}-${date}`;
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

  async createNonNeg(input: { title: string; time: string }): Promise<NonNegotiable> {
    if (!isHHMM(input.time)) throw new PersonalError('Pick a time for this non-negotiable.');
    return this.db.transaction('rw', this.db.nonnegs, async () => {
      const all = await this.db.nonnegs.toArray();
      const t = Date.now();
      const nn: NonNegotiable = {
        id: uid(),
        title: cleanTitle(input.title, 'Untitled'),
        time: input.time,
        order: all.reduce((max, n) => Math.max(max, n.order), -1) + 1,
        archivedAt: null,
        createdAt: t,
        updatedAt: t,
      };
      await this.db.nonnegs.add(nn);
      return nn;
    });
  }

  async updateNonNeg(id: ID, patch: { title?: string; time?: string }, today = todayISO()): Promise<void> {
    const nn = await this.db.nonnegs.get(id);
    if (!nn) throw new PersonalError('That non-negotiable no longer exists.');
    const next: Partial<NonNegotiable> = { updatedAt: Date.now() };
    if (patch.title !== undefined) next.title = cleanTitle(patch.title, nn.title);
    if (patch.time !== undefined) {
      if (!isHHMM(patch.time)) throw new PersonalError('Pick a valid time.');
      next.time = patch.time;
    }
    await this.db.nonnegs.update(id, next);
    await this.syncCopies(id, today);
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

  /** Brings the not-done copies of one non-negotiable, today and later, in line with it. */
  private async syncCopies(nnId: ID, today: string): Promise<void> {
    const nn = await this.db.nonnegs.get(nnId);
    await withoutUpload(this.db, async () => {
      const copies = await this.db.tasks.where('nnId').equals(nnId).toArray();
      for (const c of copies) {
        if (c.done || c.date < today) continue;
        if (!nn || nn.archivedAt) await this.db.tasks.delete(c.id);
        else if (c.title !== nn.title || c.time !== nn.time) await this.db.tasks.put({ ...c, title: nn.title, time: nn.time });
      }
    });
  }

  /**
   * Makes sure a day (today or later) carries every active non-negotiable at its
   * time, and drops not-done copies of ones that were removed. Past days are
   * history and are never changed. Safe to call as often as needed: it writes
   * only when something differs. Returns whether anything changed.
   */
  async ensureDay(date: string, today = todayISO()): Promise<boolean> {
    if (!isISODate(date) || date < today) return false;
    const nns = await this.db.nonnegs.toArray();
    const active = nns.filter((n) => !n.archivedAt);
    const byId = new Map(nns.map((n) => [n.id, n]));
    const copies = (await this.db.tasks.where('date').equals(date).toArray()).filter((t) => t.nnId);
    const have = new Set(copies.map((c) => c.nnId));

    const puts: Task[] = [];
    const deletes: ID[] = [];
    for (const c of copies) {
      if (c.done) continue;
      const nn = byId.get(c.nnId!);
      if (!nn || nn.archivedAt) deletes.push(c.id);
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

  /** Deletes one of the user's own tasks and returns it (for undo). Non-negotiable copies can't be deleted. */
  /**
   * Deletes a task and returns it (for undo). A non-negotiable's copy can only be
   * deleted from a past day; today and later it comes back until the
   * non-negotiable itself is removed (`archiveNonNeg`).
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
