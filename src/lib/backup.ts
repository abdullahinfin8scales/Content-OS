import type { ContentDB } from './db';
import { countChars, countWords, emptyDoc, makeExcerpt, toPlainText } from './content';
import { isISODate } from './dates';
import {
  METRIC_KEYS,
  PLATFORMS,
  SPACE_COLORS,
  STATUSES,
  type Doc,
  type DocContent,
  type DocText,
  type Folder,
  type Metrics,
  type CustomPlatform,
  type PlatformIconData,
  type RichNode,
  type Space,
  type SpaceColor,
  type Status,
} from './types';

export const BACKUP_APP = 'infin8-content-os';
export const BACKUP_VERSION = 1;

export interface BackupFile {
  app: typeof BACKUP_APP;
  version: number;
  exportedAt: string;
  spaces: Space[];
  folders: Folder[];
  docs: Doc[];
  contents: DocContent[];
  /** Platforms the user added (missing in backups made before they existed). */
  platforms: CustomPlatform[];
}

export class BackupError extends Error {}

export async function exportBackup(db: ContentDB): Promise<BackupFile> {
  return db.transaction('r', [db.spaces, db.folders, db.docs, db.contents, db.platforms], async () => ({
    app: BACKUP_APP,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    spaces: await db.spaces.toArray(),
    folders: await db.folders.toArray(),
    docs: await db.docs.toArray(),
    contents: await db.contents.toArray(),
    platforms: await db.platforms.toArray(),
  }));
}

/* --------------------------- validation --------------------------- */

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);
const num = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const nullableNum = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const nullableStr = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);
const oneOf = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.includes(v as T) ? (v as T) : fallback;

function requireId(record: Obj, label: string): string {
  if (typeof record.id !== 'string' || !record.id) throw new BackupError(`A ${label} is missing its id.`);
  return record.id;
}

function normalizeSpace(raw: unknown, index: number): Space {
  if (!isObj(raw)) throw new BackupError('A space entry is malformed.');
  const t = Date.now();
  return {
    id: requireId(raw, 'space'),
    name: str(raw.name, 'Untitled space'),
    icon: str(raw.icon, 'sparkles'),
    color: oneOf<SpaceColor>(raw.color, SPACE_COLORS, 'white'),
    order: num(raw.order, index),
    createdAt: num(raw.createdAt, t),
    updatedAt: num(raw.updatedAt, t),
    deletedAt: nullableNum(raw.deletedAt),
    trashRootId: nullableStr(raw.trashRootId),
  };
}

function normalizeFolder(raw: unknown): Folder {
  if (!isObj(raw)) throw new BackupError('A folder entry is malformed.');
  const t = Date.now();
  if (typeof raw.spaceId !== 'string') throw new BackupError('A folder is missing its space.');
  return {
    id: requireId(raw, 'folder'),
    spaceId: raw.spaceId,
    parentId: nullableStr(raw.parentId),
    name: str(raw.name, 'Untitled folder'),
    ...(raw.kind === 'thread' ? { kind: 'thread' as const } : {}),
    createdAt: num(raw.createdAt, t),
    updatedAt: num(raw.updatedAt, t),
    deletedAt: nullableNum(raw.deletedAt),
    trashRootId: nullableStr(raw.trashRootId),
  };
}

function normalizeMetrics(raw: unknown): Metrics {
  const out: Metrics = {};
  if (!isObj(raw)) return out;
  for (const key of METRIC_KEYS) {
    const v = raw[key];
    if (typeof v === 'number' && Number.isFinite(v) && v >= 0) out[key] = v;
  }
  return out;
}

function normalizeDoc(raw: unknown, platformIds: Set<string>): Doc {
  if (!isObj(raw)) throw new BackupError('A document entry is malformed.');
  const t = Date.now();
  if (typeof raw.spaceId !== 'string') throw new BackupError('A document is missing its space.');
  return {
    id: requireId(raw, 'document'),
    spaceId: raw.spaceId,
    folderId: nullableStr(raw.folderId),
    title: str(raw.title),
    kind: oneOf(raw.kind, ['content', 'note'] as const, 'content'),
    status: oneOf<Status>(raw.status, STATUSES, 'drafting'),
    platforms: Array.isArray(raw.platforms)
      ? [...new Set(raw.platforms.filter((p): p is string => typeof p === 'string' && ((PLATFORMS as readonly string[]).includes(p) || platformIds.has(p))))]
      : [],
    publishDate: isISODate(raw.publishDate) ? raw.publishDate : null,
    publishTime: typeof raw.publishTime === 'string' && /^\d{2}:\d{2}$/.test(raw.publishTime) ? raw.publishTime : null,
    postUrl: str(raw.postUrl),
    tags: Array.isArray(raw.tags) ? raw.tags.filter((x): x is string => typeof x === 'string' && x.trim() !== '') : [],
    metrics: normalizeMetrics(raw.metrics),
    pinned: raw.pinned === true,
    font: oneOf(raw.font, ['sans', 'serif', 'mono'] as const, 'sans'),
    excerpt: str(raw.excerpt),
    wordCount: num(raw.wordCount, 0),
    charCount: num(raw.charCount, 0),
    ...(typeof raw.position === 'number' && Number.isFinite(raw.position) ? { position: raw.position } : {}),
    createdAt: num(raw.createdAt, t),
    updatedAt: num(raw.updatedAt, t),
    deletedAt: nullableNum(raw.deletedAt),
    trashRootId: nullableStr(raw.trashRootId),
  };
}

function normalizeIcon(raw: unknown, name: string): PlatformIconData {
  if (isObj(raw) && raw.kind === 'path' && typeof raw.path === 'string' && raw.path.length > 0 && raw.path.length < 20000 && /^[MmZzLlHhVvCcSsQqTtAaEe0-9.,\s-]+$/.test(raw.path)) {
    return { kind: 'path', path: raw.path, ...(typeof raw.slug === 'string' ? { slug: raw.slug } : {}) };
  }
  const text = isObj(raw) && typeof raw.text === 'string' && raw.text.trim() ? raw.text.trim().slice(0, 2) : (name.trim()[0] ?? '?');
  return { kind: 'monogram', text: text.toUpperCase() };
}

function normalizePlatform(raw: unknown): CustomPlatform[] {
  if (!isObj(raw) || typeof raw.id !== 'string' || !raw.id.startsWith('custom-')) return [];
  const t = Date.now();
  const name = str(raw.name, 'Platform').slice(0, 60);
  const limit = typeof raw.limit === 'number' && Number.isFinite(raw.limit) && raw.limit > 0 ? Math.round(raw.limit) : null;
  return [
    {
      id: raw.id,
      name,
      url: str(raw.url),
      domain: str(raw.domain),
      icon: normalizeIcon(raw.icon, name),
      limit,
      createdAt: num(raw.createdAt, t),
      updatedAt: num(raw.updatedAt, t),
    },
  ];
}

/** Validates an untrusted parsed JSON value and fills in defaults. */
export function parseBackup(value: unknown): BackupFile {
  if (!isObj(value) || value.app !== BACKUP_APP) {
    throw new BackupError('This file is not an Infin8 Content OS backup.');
  }
  if (typeof value.version !== 'number' || value.version > BACKUP_VERSION) {
    throw new BackupError('This backup was made by a newer version of the app.');
  }
  for (const key of ['spaces', 'folders', 'docs', 'contents'] as const) {
    if (!Array.isArray(value[key])) throw new BackupError(`The backup is missing its ${key}.`);
  }
  const platforms = Array.isArray(value.platforms) ? (value.platforms as unknown[]).flatMap(normalizePlatform) : [];
  const platformIds = new Set(platforms.map((p) => p.id));
  const spaces = (value.spaces as unknown[]).map(normalizeSpace);
  const folders = (value.folders as unknown[]).map(normalizeFolder);
  const docs = (value.docs as unknown[]).map((raw) => normalizeDoc(raw, platformIds));
  const contents: DocContent[] = (value.contents as unknown[]).flatMap((raw) => {
    if (!isObj(raw) || typeof raw.id !== 'string' || !isObj(raw.json)) return [];
    return [{ id: raw.id, json: raw.json as RichNode }];
  });

  // Referential integrity: drop records that point at nothing.
  const spaceIds = new Set(spaces.map((s) => s.id));
  const validFolders = folders.filter((f) => spaceIds.has(f.spaceId));
  const folderIds = new Set(validFolders.map((f) => f.id));
  for (const f of validFolders) if (f.parentId && !folderIds.has(f.parentId)) f.parentId = null;
  const validDocs = docs.filter((d) => spaceIds.has(d.spaceId));
  for (const d of validDocs) if (d.folderId && !folderIds.has(d.folderId)) d.folderId = null;
  const docIds = new Set(validDocs.map((d) => d.id));

  return {
    app: BACKUP_APP,
    version: BACKUP_VERSION,
    exportedAt: str(value.exportedAt, new Date().toISOString()),
    spaces,
    folders: validFolders,
    docs: validDocs,
    contents: contents.filter((c) => docIds.has(c.id)),
    platforms,
  };
}

/** Replaces everything in the database with the backup's contents. */
export async function restoreBackup(db: ContentDB, backup: BackupFile): Promise<void> {
  const contentById = new Map(backup.contents.map((c) => [c.id, c]));
  const contents: DocContent[] = [];
  const texts: DocText[] = [];
  const docs: Doc[] = [];
  for (const doc of backup.docs) {
    const json = contentById.get(doc.id)?.json ?? emptyDoc();
    const text = toPlainText(json);
    contents.push({ id: doc.id, json });
    texts.push({ id: doc.id, text });
    const excerpt = makeExcerpt(toPlainText(json, { headings: false })) || makeExcerpt(text);
    docs.push({ ...doc, excerpt, wordCount: countWords(text), charCount: countChars(text) });
  }
  await db.transaction('rw', [db.spaces, db.folders, db.docs, db.contents, db.texts, db.platforms], async () => {
    await Promise.all([db.spaces.clear(), db.folders.clear(), db.docs.clear(), db.contents.clear(), db.texts.clear(), db.platforms.clear()]);
    await db.platforms.bulkAdd(backup.platforms);
    await db.spaces.bulkAdd(backup.spaces);
    await db.folders.bulkAdd(backup.folders);
    await db.docs.bulkAdd(docs);
    await db.contents.bulkAdd(contents);
    await db.texts.bulkAdd(texts);
  });
}

export async function clearAll(db: ContentDB): Promise<void> {
  await db.transaction('rw', [db.spaces, db.folders, db.docs, db.contents, db.texts, db.platforms], async () => {
    await Promise.all([db.spaces.clear(), db.folders.clear(), db.docs.clear(), db.contents.clear(), db.texts.clear(), db.platforms.clear()]);
  });
}

export function backupFileName(d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `infin8-content-os-backup-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.json`;
}
