/**
 * Automatic backups to a folder on disk (File System Access API).
 *
 * Folder layout:
 *   infin8-content-os-latest.json          ← always the newest full backup
 *   snapshots/infin8-content-os-YYYY-MM-DD.json  ← one per day, last 30 kept
 *
 * Kept free of app state and browser globals so it can be unit-tested with an
 * in-memory directory.
 */

export const LATEST_FILE = 'infin8-content-os-latest.json';
export const SNAPSHOT_DIR = 'snapshots';
export const KEEP_SNAPSHOTS = 30;
const SNAPSHOT_RE = /^infin8-content-os-\d{4}-\d{2}-\d{2}\.json$/;

export interface WritableLike {
  write(data: string): Promise<void>;
  close(): Promise<void>;
}
export interface FileLike {
  createWritable(): Promise<WritableLike>;
}
export interface DirLike {
  readonly name: string;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<FileLike>;
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<DirLike>;
  removeEntry(name: string): Promise<void>;
  entries(): AsyncIterable<[string, { readonly kind: 'file' | 'directory' }]>;
}

export function snapshotName(dateISO: string): string {
  return `infin8-content-os-${dateISO}.json`;
}

async function writeText(dir: DirLike, name: string, text: string) {
  const file = await dir.getFileHandle(name, { create: true });
  // The browser writes to a temporary file and swaps it in on close(), so a
  // failed write never leaves a half-written backup behind.
  const out = await file.createWritable();
  await out.write(text);
  await out.close();
}

/** Deletes the oldest daily snapshots beyond `keep`. Returns the names removed. */
export async function pruneSnapshots(dir: DirLike, keep = KEEP_SNAPSHOTS): Promise<string[]> {
  const names: string[] = [];
  for await (const [name, handle] of dir.entries()) {
    if (handle.kind === 'file' && SNAPSHOT_RE.test(name)) names.push(name);
  }
  names.sort();
  const remove = names.slice(0, Math.max(0, names.length - keep));
  for (const name of remove) await dir.removeEntry(name);
  return remove;
}

export async function writeBackupFiles(dir: DirLike, json: string, dateISO: string, keep = KEEP_SNAPSHOTS): Promise<void> {
  await writeText(dir, LATEST_FILE, json);
  const snapshots = await dir.getDirectoryHandle(SNAPSHOT_DIR, { create: true });
  await writeText(snapshots, snapshotName(dateISO), json);
  await pruneSnapshots(snapshots, keep);
}

export interface Scheduler {
  /** Something changed: back up after a quiet period, but never wait longer than maxWait. */
  notify(): void;
  /** Run now (cancels any pending timer). */
  flush(): Promise<void>;
  cancel(): void;
  readonly pending: boolean;
}

/**
 * Debounced runner: waits for `debounceMs` of quiet after the last change,
 * while guaranteeing a run at most `maxWaitMs` after the first unsaved change
 * (so a long writing session still gets backed up). Runs never overlap.
 */
export function createScheduler(run: () => Promise<void>, opts: { debounceMs: number; maxWaitMs: number }): Scheduler {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let firstChangeAt = 0;
  let running: Promise<void> | null = null;
  let again = false;

  const fire = async (): Promise<void> => {
    timer = undefined;
    firstChangeAt = 0;
    if (running) {
      again = true;
      return running;
    }
    running = (async () => {
      try {
        await run();
      } finally {
        running = null;
        if (again) {
          again = false;
          notify();
        }
      }
    })();
    return running;
  };

  const notify = () => {
    const now = Date.now();
    if (!firstChangeAt) firstChangeAt = now;
    clearTimeout(timer);
    const wait = Math.max(0, Math.min(opts.debounceMs, firstChangeAt + opts.maxWaitMs - now));
    timer = setTimeout(() => void fire(), wait);
  };

  const cancel = () => {
    clearTimeout(timer);
    timer = undefined;
    firstChangeAt = 0;
  };

  return {
    notify,
    cancel,
    flush: () => {
      cancel();
      return fire();
    },
    get pending() {
      return timer !== undefined;
    },
  };
}
