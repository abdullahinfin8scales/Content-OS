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

export function parseHash(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  const [head, id] = parts;
  switch (head) {
    case undefined:
      return { name: 'home' };
    case 'doc':
    case 'space':
    case 'folder':
      return id ? { name: head, id } : { name: 'notfound' };
    case 'library':
    case 'pipeline':
    case 'calendar':
    case 'trash':
      return { name: head };
    default:
      return { name: 'notfound' };
  }
}

export const paths = {
  home: () => '#/',
  doc: (id: ID) => `#/doc/${encodeURIComponent(id)}`,
  space: (id: ID) => `#/space/${encodeURIComponent(id)}`,
  folder: (id: ID) => `#/folder/${encodeURIComponent(id)}`,
  library: () => '#/library',
  pipeline: () => '#/pipeline',
  calendar: () => '#/calendar',
  trash: () => '#/trash',
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
  if (window.location.hash === to) return;
  if (opts.replace) {
    window.history.replaceState(null, '', to);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else {
    window.location.hash = to;
  }
}
