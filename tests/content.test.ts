import { describe, expect, it } from 'vitest';
import { countChars, countWords, formatDuration, makeExcerpt, spokenSeconds, toMarkdown, toPlainText } from '../src/lib/content';
import { TEMPLATES } from '../src/lib/templates';
import type { RichNode } from '../src/lib/types';

const t = (text: string, marks?: RichNode['marks']): RichNode => ({ type: 'text', text, ...(marks ? { marks } : {}) });
const p = (...content: RichNode[]): RichNode => ({ type: 'paragraph', content });
const li = (...content: RichNode[]): RichNode => ({ type: 'listItem', content });
const doc = (...content: RichNode[]): RichNode => ({ type: 'doc', content });

describe('toPlainText', () => {
  it('puts one paragraph per line and keeps blank lines', () => {
    const d = doc(p(t('Line one')), { type: 'paragraph' }, p(t('Line two')));
    expect(toPlainText(d)).toBe('Line one\n\nLine two');
  });

  it('formats bullets, numbers, tasks and nested lists', () => {
    const d = doc(
      { type: 'bulletList', content: [li(p(t('a'))), li(p(t('b')), { type: 'bulletList', content: [li(p(t('nested')))] })] },
      { type: 'orderedList', attrs: { start: 3 }, content: [li(p(t('third'))), li(p(t('fourth')))] },
      {
        type: 'taskList',
        content: [
          { type: 'taskItem', attrs: { checked: true }, content: [p(t('done'))] },
          { type: 'taskItem', attrs: { checked: false }, content: [p(t('todo'))] },
        ],
      },
    );
    expect(toPlainText(d)).toBe(['• a', '• b', '   • nested', '3. third', '4. fourth', '[x] done', '[ ] todo'].join('\n'));
  });

  it('turns hard breaks into newlines and drops trailing empty paragraphs', () => {
    const d = doc(p(t('a'), { type: 'hardBreak' }, t('b')), { type: 'paragraph' }, { type: 'paragraph' });
    expect(toPlainText(d)).toBe('a\nb');
  });

  it('ignores hint attributes from templates', () => {
    const d = doc({ type: 'paragraph', attrs: { hint: 'Write the hook' } });
    expect(toPlainText(d)).toBe('');
  });

  it('drops list items that were never filled in', () => {
    const d = doc(
      { type: 'bulletList', content: [li({ type: 'paragraph' }), li(p(t('kept'))), li({ type: 'paragraph', attrs: { hint: 'Point three' } })] },
      { type: 'orderedList', content: [li({ type: 'paragraph' }), li(p(t('first real')))] },
    );
    expect(toPlainText(d)).toBe('• kept\n1. first real');
  });

  it('handles missing input', () => {
    expect(toPlainText(undefined)).toBe('');
  });
});

describe('toMarkdown', () => {
  it('serialises headings, marks, links and lists', () => {
    const d = doc(
      { type: 'heading', attrs: { level: 2 }, content: [t('Hook')] },
      p(t('Plain '), t('bold', [{ type: 'bold' }]), t(' and '), t('a link', [{ type: 'link', attrs: { href: 'https://x.com' } }])),
      { type: 'bulletList', content: [li(p(t('one'))), li(p(t('two')))] },
      { type: 'horizontalRule' },
      { type: 'blockquote', content: [p(t('quoted'))] },
    );
    expect(toMarkdown(d)).toBe('## Hook\n\nPlain **bold** and [a link](https://x.com)\n\n- one\n- two\n\n---\n\n> quoted\n');
  });

  it('keeps whitespace outside emphasis markers and merges adjacent runs', () => {
    const d = doc(p(t('bold ', [{ type: 'bold' }]), t('still', [{ type: 'bold' }]), t(' after')));
    expect(toMarkdown(d)).toBe('**bold still** after\n');
  });

  it('adds front matter with publishing metadata', () => {
    const md = toMarkdown(doc(p(t('Body'))), {
      title: 'My "post"',
      kind: 'content',
      status: 'posted',
      platforms: ['instagram', 'tiktok'],
      publishDate: '2026-11-09',
      publishTime: '18:30',
      postUrl: 'https://instagram.com/p/1',
      tags: ['growth'],
    });
    expect(md).toContain('title: "My \\"post\\""');
    expect(md).toContain('platforms: [instagram, tiktok]');
    expect(md).toContain('publish_date: 2026-11-09 18:30');
    expect(md).toContain('tags: ["growth"]');
    expect(md).toContain('# My "post"\n\nBody');
  });
});

describe('counting', () => {
  it('counts words, ignoring stray punctuation', () => {
    expect(countWords('Hello,   world — this is 1 test!')).toBe(6);
    expect(countWords('')).toBe(0);
  });

  it('counts emoji as one character', () => {
    expect(countChars('hi 👋🏽')).toBe(4);
  });

  it('computes spoken time at a given pace', () => {
    expect(spokenSeconds(150, 150)).toBe(60);
    expect(spokenSeconds(0)).toBe(0);
    expect(formatDuration(125)).toBe('2:05');
    expect(formatDuration(3725)).toBe('1:02:05');
  });

  it('builds a trimmed single-line excerpt', () => {
    expect(makeExcerpt('a\n\n b   c')).toBe('a b c');
    expect(makeExcerpt('x'.repeat(300), 10)).toHaveLength(10);
  });
});

describe('templates', () => {
  it('all build valid docs whose text is empty until written in', () => {
    for (const template of TEMPLATES) {
      const json = template.build();
      expect(json.type).toBe('doc');
      expect(Array.isArray(json.content)).toBe(true);
      // Hints are ghost text: they must never leak into the copy.
      expect(toPlainText(json)).not.toMatch(/hook —|Point one|Caption and hashtags/);
    }
  });
});

describe('excerpt source', () => {
  it('can leave headings out', () => {
    const d = doc({ type: 'heading', attrs: { level: 2 }, content: [t('Hook · 0–3s')] }, p(t('The actual line')));
    expect(toPlainText(d, { headings: false })).toBe('The actual line');
    expect(toPlainText(d)).toBe('Hook · 0–3s\nThe actual line');
  });
});
