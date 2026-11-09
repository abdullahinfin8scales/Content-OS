import { describe, expect, it } from 'vitest';
import { parseHash, paths } from '../src/lib/router';

describe('router', () => {
  it('round-trips every route through plain #name hashes', () => {
    expect(parseHash(paths.home())).toEqual({ name: 'home' });
    expect(parseHash('')).toEqual({ name: 'home' });
    for (const view of ['library', 'pipeline', 'calendar', 'trash'] as const) expect(parseHash(paths[view]())).toEqual({ name: view });
    expect(parseHash(paths.doc('abc123'))).toEqual({ name: 'doc', id: 'abc123' });
    expect(parseHash(paths.space('space-personal'))).toEqual({ name: 'space', id: 'space-personal' });
    expect(parseHash(paths.folder('f 1'))).toEqual({ name: 'folder', id: 'f 1' });
  });

  it('still understands older #/path links', () => {
    expect(parseHash('#/doc/abc123')).toEqual({ name: 'doc', id: 'abc123' });
    expect(parseHash('#/pipeline')).toEqual({ name: 'pipeline' });
    expect(parseHash('#/')).toEqual({ name: 'home' });
  });

  it('marks unknown hashes as not found', () => {
    expect(parseHash('#settings')).toEqual({ name: 'notfound' });
    expect(parseHash('#doc-')).toEqual({ name: 'notfound' });
  });
});
