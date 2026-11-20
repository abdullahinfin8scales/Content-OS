import { describe, expect, it } from 'vitest';
import { parseHash, paths, sectionOf } from '../src/lib/router';

describe('router', () => {
  it('round-trips every route through plain #name hashes', () => {
    expect(parseHash(paths.home())).toEqual({ name: 'home' });
    expect(parseHash('')).toEqual({ name: 'home' });
    expect(parseHash('#today')).toEqual({ name: 'home' });
    for (const view of ['library', 'pipeline', 'calendar', 'trash', 'content', 'goals', 'nonnegotiables', 'journal', 'notes'] as const) {
      expect(parseHash(paths[view]())).toEqual({ name: view });
    }
    expect(parseHash(paths.doc('abc123'))).toEqual({ name: 'doc', id: 'abc123' });
    expect(parseHash(paths.space('space-personal'))).toEqual({ name: 'space', id: 'space-personal' });
    expect(parseHash(paths.folder('f 1'))).toEqual({ name: 'folder', id: 'f 1' });
    expect(parseHash(paths.goal('g1'))).toEqual({ name: 'goal', id: 'g1' });
    expect(parseHash(paths.note('n1'))).toEqual({ name: 'note', id: 'n1' });
    expect(parseHash(paths.day('2026-11-20'))).toEqual({ name: 'day', date: '2026-11-20' });
  });

  it('still understands older #/path links', () => {
    expect(parseHash('#/doc/abc123')).toEqual({ name: 'doc', id: 'abc123' });
    expect(parseHash('#/pipeline')).toEqual({ name: 'pipeline' });
    expect(parseHash('#/')).toEqual({ name: 'home' });
  });

  it('marks unknown hashes as not found', () => {
    expect(parseHash('#settings')).toEqual({ name: 'notfound' });
    expect(parseHash('#doc-')).toEqual({ name: 'notfound' });
    expect(parseHash('#day-tomorrow')).toEqual({ name: 'notfound' });
  });

  it('puts each route in its sidebar section', () => {
    expect(sectionOf(parseHash('#'))).toBe('personal');
    expect(sectionOf(parseHash('#goals'))).toBe('personal');
    expect(sectionOf(parseHash('#content'))).toBe('content');
    expect(sectionOf(parseHash('#doc-x'))).toBe('content');
    expect(sectionOf(parseHash('#trash'))).toBeNull();
  });
});
