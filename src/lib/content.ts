import type { Doc, RichMark, RichNode } from './types';

export const EMPTY_DOC: RichNode = { type: 'doc', content: [{ type: 'paragraph' }] };

export function emptyDoc(): RichNode {
  return structuredClone(EMPTY_DOC);
}

/* ------------------------------------------------------------------ */
/* Plain text — what you paste into a social platform                  */
/* ------------------------------------------------------------------ */

function inlineText(node: RichNode): string {
  switch (node.type) {
    case 'text':
      return node.text ?? '';
    case 'hardBreak':
      return '\n';
    case 'image':
      return '';
    default:
      return (node.content ?? []).map(inlineText).join('');
  }
}

const NESTED_INDENT = '   ';

/** True when a node holds no text (e.g. a template bullet never filled in). */
function isBlank(node: RichNode): boolean {
  if (node.type === 'text') return !(node.text ?? '').trim();
  if (node.type === 'image' || node.type === 'horizontalRule') return false;
  return (node.content ?? []).every(isBlank);
}

function listItemLines(item: RichNode, indent: string, marker: string): string[] {
  const children = item.content ?? [];
  if (children.length === 0) return [indent + marker.trimEnd()];
  const lines: string[] = [];
  children.forEach((child, i) => {
    if (i === 0 && (child.type === 'paragraph' || child.type === 'heading')) {
      lines.push(indent + marker + inlineText(child));
    } else {
      lines.push(...blockLines(child, indent + NESTED_INDENT));
    }
  });
  return lines;
}

function blockLines(node: RichNode, indent = ''): string[] {
  const children = node.content ?? [];
  switch (node.type) {
    case 'doc':
    case 'blockquote':
      return children.flatMap((c) => blockLines(c, indent));
    case 'paragraph':
    case 'heading':
      return [indent + inlineText(node)];
    // Empty items (unfilled template bullets) are dropped from the copy.
    case 'bulletList':
      return children.filter((c) => !isBlank(c)).flatMap((item) => listItemLines(item, indent, '• '));
    case 'orderedList': {
      const start = typeof node.attrs?.start === 'number' ? node.attrs.start : 1;
      return children.filter((c) => !isBlank(c)).flatMap((item, i) => listItemLines(item, indent, `${start + i}. `));
    }
    case 'taskList':
      return children.filter((c) => !isBlank(c)).flatMap((item) => listItemLines(item, indent, item.attrs?.checked ? '[x] ' : '[ ] '));
    case 'codeBlock':
      return inlineText(node)
        .split('\n')
        .map((l) => indent + l);
    case 'horizontalRule':
      return [indent + '———'];
    case 'image':
      return [];
    default:
      if (children.length) return children.flatMap((c) => blockLines(c, indent));
      return node.text ? [indent + node.text] : [];
  }
}

/**
 * Converts rich content to plain text with one line per paragraph — the same
 * shape social composers expect, so "copy as text" pastes cleanly.
 */
export function toPlainText(doc: RichNode | null | undefined, opts: { headings?: boolean } = {}): string {
  if (!doc) return '';
  const source = opts.headings === false ? { ...doc, content: (doc.content ?? []).filter((n) => n.type !== 'heading') } : doc;
  const lines = blockLines(source);
  // Trim trailing empty lines (the editor keeps a trailing paragraph around).
  while (lines.length && lines[lines.length - 1].trim() === '') lines.pop();
  return lines.join('\n');
}

/* ------------------------------------------------------------------ */
/* Markdown export                                                     */
/* ------------------------------------------------------------------ */

const MARK_ORDER = ['link', 'bold', 'italic', 'strike', 'code'];

function wrapMarks(text: string, marks: RichMark[]): string {
  if (!text) return '';
  const lead = text.match(/^\s*/)?.[0] ?? '';
  const trail = text.slice(lead.length).match(/\s*$/)?.[0] ?? '';
  let core = text.slice(lead.length, text.length - trail.length);
  if (!core) return text;
  const types = new Set(marks.map((m) => m.type));
  const isCode = types.has('code');
  if (!isCode) core = core.replace(/([\\*`])/g, '\\$1');
  const sorted = [...marks].sort((a, b) => MARK_ORDER.indexOf(b.type) - MARK_ORDER.indexOf(a.type));
  for (const mark of sorted) {
    switch (mark.type) {
      case 'code':
        core = '`' + core + '`';
        break;
      case 'bold':
        core = `**${core}**`;
        break;
      case 'italic':
        core = `*${core}*`;
        break;
      case 'strike':
        core = `~~${core}~~`;
        break;
      case 'link': {
        const href = String(mark.attrs?.href ?? '');
        if (href) core = `[${core}](${href})`;
        break;
      }
    }
  }
  return lead + core + trail;
}

function markKey(marks: RichMark[] | undefined): string {
  return (marks ?? [])
    .map((m) => (m.type === 'link' ? `link:${String(m.attrs?.href ?? '')}` : m.type))
    .sort()
    .join('|');
}

function inlineMarkdown(node: RichNode): string {
  const out: string[] = [];
  let buffer = '';
  let bufferMarks: RichMark[] = [];
  let bufferKey = '';
  const flush = () => {
    if (buffer) out.push(wrapMarks(buffer, bufferMarks));
    buffer = '';
  };
  for (const child of node.content ?? []) {
    if (child.type === 'text') {
      const key = markKey(child.marks);
      if (buffer && key !== bufferKey) flush();
      if (!buffer) {
        bufferMarks = child.marks ?? [];
        bufferKey = key;
      }
      buffer += child.text ?? '';
    } else if (child.type === 'hardBreak') {
      flush();
      out.push('  \n');
    } else if (child.type === 'image') {
      flush();
      out.push(`![${String(child.attrs?.alt ?? '')}](${String(child.attrs?.src ?? '')})`);
    }
  }
  flush();
  return out.join('');
}

function prefixLines(text: string, first: string, rest: string): string {
  return text
    .split('\n')
    .map((line, i) => (i === 0 ? first : line ? rest : rest.trimEnd()) + line)
    .join('\n');
}

function mdListItem(item: RichNode, marker: string): string {
  const pad = ' '.repeat(marker.length);
  const parts = (item.content ?? []).map((child) => mdBlock(child)).filter((s) => s !== null) as string[];
  if (!parts.length) return marker.trimEnd();
  const [first, ...rest] = parts;
  let out = prefixLines(first, marker, pad);
  for (const part of rest) out += '\n' + prefixLines(part, pad, pad);
  return out;
}

function mdBlock(node: RichNode): string | null {
  const children = node.content ?? [];
  switch (node.type) {
    case 'paragraph': {
      const text = inlineMarkdown(node);
      return text.trim() ? text : null;
    }
    case 'heading': {
      const level = Math.min(6, Math.max(1, Number(node.attrs?.level ?? 1)));
      return '#'.repeat(level) + ' ' + inlineMarkdown(node);
    }
    case 'blockquote': {
      const inner = mdBlocks(children);
      return inner ? prefixLines(inner, '> ', '> ') : null;
    }
    case 'bulletList':
      return children.map((item) => mdListItem(item, '- ')).join('\n');
    case 'orderedList': {
      const start = typeof node.attrs?.start === 'number' ? node.attrs.start : 1;
      return children.map((item, i) => mdListItem(item, `${start + i}. `)).join('\n');
    }
    case 'taskList':
      return children.map((item) => mdListItem(item, item.attrs?.checked ? '- [x] ' : '- [ ] ')).join('\n');
    case 'codeBlock': {
      const lang = String(node.attrs?.language ?? '');
      return '```' + lang + '\n' + inlineText(node) + '\n```';
    }
    case 'horizontalRule':
      return '---';
    case 'image':
      return `![${String(node.attrs?.alt ?? '')}](${String(node.attrs?.src ?? '')})`;
    default:
      return children.length ? mdBlocks(children) : null;
  }
}

function mdBlocks(nodes: RichNode[]): string {
  return nodes
    .map(mdBlock)
    .filter((s): s is string => s !== null && s !== '')
    .join('\n\n');
}

function yamlString(value: string): string {
  return JSON.stringify(value);
}

/** Markdown with YAML front matter — portable to Obsidian and similar tools. */
export function toMarkdown(doc: RichNode | null | undefined, meta?: Pick<Doc, 'title'> & Partial<Doc>): string {
  const body = doc ? mdBlocks(doc.content ?? []) : '';
  if (!meta) return body + '\n';
  const fm: string[] = ['---', `title: ${yamlString(meta.title || 'Untitled')}`];
  if (meta.kind === 'content') {
    if (meta.status) fm.push(`status: ${meta.status}`);
    if (meta.platforms?.length) fm.push(`platforms: [${meta.platforms.join(', ')}]`);
    if (meta.publishDate) fm.push(`publish_date: ${meta.publishDate}${meta.publishTime ? ' ' + meta.publishTime : ''}`);
    if (meta.postUrl) fm.push(`url: ${yamlString(meta.postUrl)}`);
  }
  if (meta.tags?.length) fm.push(`tags: [${meta.tags.map(yamlString).join(', ')}]`);
  fm.push('---', '');
  return fm.join('\n') + `# ${meta.title || 'Untitled'}\n\n` + body + '\n';
}

/* ------------------------------------------------------------------ */
/* Counting                                                            */
/* ------------------------------------------------------------------ */

const WORDLIKE = /[\p{L}\p{N}]/u;

export function countWords(text: string): number {
  let n = 0;
  for (const token of text.split(/\s+/)) if (token && WORDLIKE.test(token)) n++;
  return n;
}

let segmenter: Intl.Segmenter | null | undefined;

/** Counts user-perceived characters (an emoji counts once). */
export function countChars(text: string): number {
  if (segmenter === undefined) {
    segmenter = typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;
  }
  if (!segmenter) return Array.from(text).length;
  let n = 0;
  for (const _ of segmenter.segment(text)) n++;
  return n;
}

export function makeExcerpt(text: string, max = 220): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > max ? flat.slice(0, max - 1).trimEnd() + '…' : flat;
}

/** Spoken duration in seconds at a given words-per-minute pace. */
export function spokenSeconds(words: number, wpm = 150): number {
  if (words <= 0 || wpm <= 0) return 0;
  return Math.round((words / wpm) * 60);
}

export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

export interface TextStats {
  text: string;
  words: number;
  chars: number;
}

export function textStats(doc: RichNode | null | undefined): TextStats {
  const text = toPlainText(doc);
  return { text, words: countWords(text), chars: countChars(text) };
}
