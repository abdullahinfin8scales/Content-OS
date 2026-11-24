import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { formatDate, todayISO } from '../lib/dates';
import type { DayItemKind } from '../lib/personalRepo';
import { relativeDayName } from '../lib/personalText';
import { navigate, parseHash, paths } from '../lib/router';
import type { Goal, NonNegotiable, Note, Task } from '../lib/types';
import { reportError } from './actions';
import { confirmDialog, toast } from './feedback';
import { db, personal } from './repo';
import { useUI } from './ui';

/** Today's date (YYYY-MM-DD); rolls over at midnight and when the window comes back. */
export function useToday(): string {
  const [today, setToday] = useState(todayISO);
  useEffect(() => {
    const check = () => setToday((cur) => (cur === todayISO() ? cur : todayISO()));
    const timer = setInterval(check, 30_000);
    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', check);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', check);
      document.removeEventListener('visibilitychange', check);
    };
  }, []);
  return today;
}

/** The current time, refreshed every minute (for the "now" line). */
export function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

export interface PersonalLists {
  nonnegs: NonNegotiable[];
  activeNonnegs: NonNegotiable[];
  goals: Goal[];
  activeGoals: Goal[];
  notes: Note[];
}

/** Anytime ones first, like the day's Anytime list, then by time. */
const byTimeThenOrder = (a: NonNegotiable, b: NonNegotiable) => {
  const ta = a.time ?? '';
  const tb = b.time ?? '';
  return ta < tb ? -1 : ta > tb ? 1 : a.order - b.order;
};
const byDeadline = (a: Goal, b: Goal) => (a.targetDate < b.targetDate ? -1 : a.targetDate > b.targetDate ? 1 : a.createdAt - b.createdAt);

/** Non-negotiables, goals and notes, live. Undefined while loading. */
export function usePersonalLists(): PersonalLists | undefined {
  return useLiveQuery(async () => {
    const [nonnegs, goals, notes] = await Promise.all([db.nonnegs.toArray(), db.goals.toArray(), db.notes.toArray()]);
    nonnegs.sort(byTimeThenOrder);
    goals.sort(byDeadline);
    notes.sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt);
    return {
      nonnegs,
      activeNonnegs: nonnegs.filter((n) => !n.archivedAt),
      goals,
      activeGoals: goals.filter((g) => g.status === 'active'),
      notes,
    };
  }, []);
}

/** Tasks linked to any goal, keyed by goal id, live. */
export function useGoalTasks(): Map<string, Task[]> | undefined {
  return useLiveQuery(async () => {
    const linked = await db.tasks.filter((t) => !!t.goalId).toArray();
    const map = new Map<string, Task[]>();
    for (const t of linked) {
      const list = map.get(t.goalId!);
      if (list) list.push(t);
      else map.set(t.goalId!, [t]);
    }
    return map;
  }, []);
}

/** Keeps today's timeline carrying every non-negotiable, whichever page is open. */
export function usePersonalUpkeep() {
  const today = useToday();
  const stamp = useLiveQuery(async () => (await db.nonnegs.toArray()).map((n) => `${n.id}:${n.updatedAt}`).join('|'), []);
  useEffect(() => {
    if (stamp === undefined) return;
    personal.ensureDay(today, today).catch(reportError);
  }, [stamp, today]);
}

/** Opens a day page and asks it to focus "Add a task" (or the journal). */
export function focusDay(target: 'task' | 'journal' = 'task') {
  const route = parseHash(window.location.hash);
  if (route.name !== 'home' && route.name !== 'day') navigate(paths.home());
  useUI.getState().set({ dayFocus: { target, at: Date.now() } });
}

export async function newNote() {
  try {
    const note = await personal.createNote();
    navigate(paths.note(note.id));
  } catch (err) {
    reportError(err);
  }
}

export async function deleteNoteWithUndo(id: string, leave: boolean) {
  const note = await personal.deleteNote(id);
  if (!note) return;
  if (leave) navigate(paths.notes(), { replace: true });
  toast('Note deleted', { action: { label: 'Undo', run: () => void personal.restoreNote(note) } });
}

/* ------------------------------ Removing ------------------------------ */

/** Deletes a task (undo in the toast). On today or later, a non-negotiable's copy skips that day only instead. */
export async function deleteTaskWithUndo(task: Task, today: string) {
  try {
    if (task.nnId && task.date >= today) {
      await skipNonNegWithUndo({ id: task.nnId, title: task.title }, task.date, today);
      return;
    }
    const removed = await personal.deleteTask(task.id, today);
    if (removed) toast('Task deleted', { action: { label: 'Undo', run: () => void personal.restoreTask(removed) } });
  } catch (err) {
    reportError(err);
  }
}

/** "today", "tomorrow" or "on Mon, Nov 23". */
export function skipDayWords(date: string, today: string): string {
  const rel = relativeDayName(date, today);
  return rel ? rel.toLowerCase() : `on ${formatDate(date, { weekday: true })}`;
}

/** Takes a non-negotiable off one day only (today or later); undo in the toast puts it back as it was. */
export async function skipNonNegWithUndo(nn: Pick<NonNegotiable, 'id' | 'title'>, date: string, today: string) {
  try {
    const copy = await personal.skipNonNegOn(nn.id, date, today);
    toast(`Skipped “${nn.title}” ${skipDayWords(date, today)}`, {
      action: { label: 'Undo', run: () => void personal.unskipNonNegOn(nn.id, date, copy, today).catch(reportError) },
    });
  } catch (err) {
    reportError(err);
  }
}

/** "yesterday", "today", "tomorrow", or a date like "Mon, Nov 23". */
export function dayWords(date: string, today: string): string {
  const rel = relativeDayName(date, today);
  return rel ? rel.toLowerCase() : formatDate(date, { weekday: true });
}

/** Moves a task to another day (undo in the toast puts it back on its old day, in its old place). */
export async function moveTaskWithUndo(task: Pick<Task, 'id' | 'title'>, date: string, today: string) {
  try {
    const from = await personal.moveTaskToDay(task.id, date);
    if (!from) return;
    toast(`Moved “${task.title}” to ${dayWords(date, today)}`, {
      action: { label: 'Undo', run: () => void personal.moveTaskToDay(task.id, from.date, from.order).catch(reportError) },
    });
  } catch (err) {
    reportError(err);
  }
}

/** Removes a win or a loss (undo in the toast). */
export async function removeDayItemWithUndo(date: string, kind: DayItemKind, id: string) {
  try {
    const removed = await personal.removeDayItem(date, kind, id);
    if (removed) {
      toast(kind === 'wins' ? 'Win removed' : 'Loss removed', {
        action: { label: 'Undo', run: () => void personal.restoreDayItem(date, kind, removed.item, removed.index) },
      });
    }
  } catch (err) {
    reportError(err);
  }
}

/** Takes a non-negotiable off today and every later day; past days keep it (undo in the toast). */
export async function removeNonNegWithUndo(nn: Pick<NonNegotiable, 'id' | 'title'>, today: string) {
  try {
    await personal.archiveNonNeg(nn.id, today);
    toast(`Removed “${nn.title}” from your days`, { action: { label: 'Undo', run: () => void personal.restoreNonNeg(nn.id) } });
  } catch (err) {
    reportError(err);
  }
}

/** Deletes a removed non-negotiable for good, after asking. Past days keep their copies. */
export async function deleteNonNegForever(nn: NonNegotiable, today: string) {
  const ok = await confirmDialog({
    title: `Delete “${nn.title}” for good?`,
    message: 'It leaves this list. Days it was already on keep it as history.',
    confirmLabel: 'Delete',
    danger: true,
  });
  if (!ok) return;
  const removed = await personal.deleteNonNeg(nn.id, today).catch(reportError);
  if (removed) toast('Non-negotiable deleted', { action: { label: 'Undo', run: () => void personal.putBackNonNeg(removed) } });
}

/** Deletes a goal after asking; its tasks stay on their days, unlinked (undo in the toast). */
export async function deleteGoalWithConfirm(goal: Goal, linkedCount: number, leave: boolean) {
  const ok = await confirmDialog({
    title: `Delete “${goal.title}”?`,
    message: linkedCount ? `Its ${linkedCount} linked task${linkedCount === 1 ? '' : 's'} stay on their days, unlinked.` : undefined,
    confirmLabel: 'Delete goal',
    danger: true,
  });
  if (!ok) return;
  const undo = await personal.deleteGoal(goal.id).catch(reportError);
  if (leave) navigate(paths.goals(), { replace: true });
  if (undo) toast('Goal deleted', { action: { label: 'Undo', run: () => void personal.restoreGoal(undo.goal, undo.taskIds) } });
}

/** Deletes a note after asking (undo in the toast). */
export async function deleteNoteWithConfirm(note: Pick<Note, 'id' | 'title'>, leave: boolean) {
  const ok = await confirmDialog({ title: `Delete “${note.title || 'Untitled'}”?`, confirmLabel: 'Delete note', danger: true });
  if (ok) await deleteNoteWithUndo(note.id, leave);
}
