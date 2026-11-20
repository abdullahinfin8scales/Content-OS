import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { todayISO } from '../lib/dates';
import { navigate, parseHash, paths } from '../lib/router';
import type { Goal, NonNegotiable, Note, Task } from '../lib/types';
import { reportError } from './actions';
import { toast } from './feedback';
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

const byTimeThenOrder = (a: NonNegotiable, b: NonNegotiable) => (a.time < b.time ? -1 : a.time > b.time ? 1 : a.order - b.order);
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
