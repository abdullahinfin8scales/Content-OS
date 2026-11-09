import { useMemo, useSyncExternalStore } from 'react';
import type { ID } from './types';

export type Route =
  | { name: 'home' }
  | { name: 'doc'; id: ID }
  | { name: 'space'; id: ID }
  | { name: 'folder'; id: ID }
  | { name: 'library' }
  | { name: 'pipeline' }
  | { name: 'calendar' }
  | { name: 'trash' }
  | { name: 'notfound' };

const VIEWS = new Set(['library', 'pipeline', 'calendar', 'trash']);

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
  if (!raw) return { name: 'home' };
  if (VIEWS.has(raw)) return { name: raw as 'library' | 'pipeline' | 'calendar' | 'trash' };
  const m = raw.match(/^(doc|space|folder)-(.+)$/);
  if (m) return { name: m[1] as 'doc' | 'space' | 'folder', id: m[2] };
  return { name: 'notfound' };
}

export const paths = {
  home: () => '#',
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
