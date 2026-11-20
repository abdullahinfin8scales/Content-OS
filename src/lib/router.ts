import { useMemo, useSyncExternalStore } from 'react';
import { isISODate } from './dates';
import type { ID } from './types';

export type Route =
  // Personal
  | { name: 'home' } // Today
  | { name: 'day'; date: string }
  | { name: 'goals' }
  | { name: 'goal'; id: ID }
  | { name: 'nonnegotiables' }
  | { name: 'journal' }
  | { name: 'notes' }
  | { name: 'note'; id: ID }
  // Content OS
  | { name: 'content' }
  | { name: 'doc'; id: ID }
  | { name: 'space'; id: ID }
  | { name: 'folder'; id: ID }
  | { name: 'library' }
  | { name: 'pipeline' }
  | { name: 'calendar' }
  // Shared
  | { name: 'trash' }
  | { name: 'notfound' };

export type Section = 'personal' | 'content';

const VIEWS = new Set(['library', 'pipeline', 'calendar', 'trash', 'content', 'goals', 'nonnegotiables', 'journal', 'notes']);
type ViewName = 'library' | 'pipeline' | 'calendar' | 'trash' | 'content' | 'goals' | 'nonnegotiables' | 'journal' | 'notes';

/**
 * Hashes are plain names — `#library`, `#doc-<id>` — so links survive hosts
 * that only pass simple fragments. Older `#/doc/<id>` links still resolve.
 */
export function parseHash(hash: string): Route {
  let raw = hash.replace(/^#/, '');
  try {
    raw = decodeURIComponent(raw);
  } catch {
    /* keep the raw value */
  }
  if (raw.startsWith('/')) {
    const [head = '', ...rest] = raw.slice(1).split('/').filter(Boolean);
    raw = rest.length ? `${head}-${rest.join('/')}` : head;
  }
  if (!raw || raw === 'today') return { name: 'home' };
  if (VIEWS.has(raw)) return { name: raw as ViewName };
  const day = raw.match(/^day-(.+)$/);
  if (day) return isISODate(day[1]) ? { name: 'day', date: day[1] } : { name: 'notfound' };
  const m = raw.match(/^(doc|space|folder|goal|note)-(.+)$/);
  if (m) return { name: m[1] as 'doc' | 'space' | 'folder' | 'goal' | 'note', id: m[2] };
  return { name: 'notfound' };
}

/** Which sidebar section a route belongs to; null for shared pages (Trash, not found). */
export function sectionOf(route: Route): Section | null {
  switch (route.name) {
    case 'home':
    case 'day':
    case 'goals':
    case 'goal':
    case 'nonnegotiables':
    case 'journal':
    case 'notes':
    case 'note':
      return 'personal';
    case 'content':
    case 'doc':
    case 'space':
    case 'folder':
    case 'library':
    case 'pipeline':
    case 'calendar':
      return 'content';
    default:
      return null;
  }
}

export const paths = {
  /** Today. */
  home: () => '#',
  day: (date: string) => `#day-${date}`,
  goals: () => '#goals',
  goal: (id: ID) => `#goal-${encodeURIComponent(id)}`,
  nonnegotiables: () => '#nonnegotiables',
  journal: () => '#journal',
  notes: () => '#notes',
  note: (id: ID) => `#note-${encodeURIComponent(id)}`,
  /** Content OS overview. */
  content: () => '#content',
  doc: (id: ID) => `#doc-${encodeURIComponent(id)}`,
  space: (id: ID) => `#space-${encodeURIComponent(id)}`,
  folder: (id: ID) => `#folder-${encodeURIComponent(id)}`,
  library: () => '#library',
  pipeline: () => '#pipeline',
  calendar: () => '#calendar',
  trash: () => '#trash',
};

function subscribe(onChange: () => void) {
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
}

export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, () => window.location.hash);
  return useMemo(() => parseHash(hash), [hash]);
}

export function navigate(to: string, opts: { replace?: boolean } = {}) {
  if ((window.location.hash || '#') === to) return;
  if (opts.replace) {
    window.history.replaceState(null, '', to);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else {
    window.location.hash = to;
  }
}
