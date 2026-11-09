import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createScheduler, LATEST_FILE, pruneSnapshots, snapshotName, SNAPSHOT_DIR, writeBackupFiles, type DirLike } from '../src/lib/autoBackup';

/** Minimal in-memory stand-in for a FileSystemDirectoryHandle. */
class MemDir implements DirLike {
  files = new Map<string, string>();
  dirs = new Map<string, MemDir>();
  constructor(readonly name: string) {}
  async getFileHandle(name: string, options?: { create?: boolean }) {
    if (!this.files.has(name)) {
      if (!options?.create) throw new Error('NotFoundError');
      this.files.set(name, '');
    }
    return {
      createWritable: async () => {
        let buffer = '';
        return {
          write: async (data: string) => {
            buffer += data;
          },
          close: async () => {
            this.files.set(name, buffer);
          },
        };
      },
    };
  }
  async getDirectoryHandle(name: string, options?: { create?: boolean }) {
    if (!this.dirs.has(name)) {
      if (!options?.create) throw new Error('NotFoundError');
      this.dirs.set(name, new MemDir(name));
    }
    return this.dirs.get(name)!;
  }
  async removeEntry(name: string) {
    this.files.delete(name);
    this.dirs.delete(name);
  }
  async *entries(): AsyncGenerator<[string, { kind: 'file' | 'directory' }]> {
    for (const name of this.files.keys()) yield [name, { kind: 'file' }];
    for (const name of this.dirs.keys()) yield [name, { kind: 'directory' }];
  }
}

describe('writeBackupFiles', () => {
  it('writes the latest file and a dated snapshot', async () => {
    const root = new MemDir('Backups');
    await writeBackupFiles(root, '{"v":1}', '2026-11-09');
    expect(root.files.get(LATEST_FILE)).toBe('{"v":1}');
    expect(root.dirs.get(SNAPSHOT_DIR)!.files.get(snapshotName('2026-11-09'))).toBe('{"v":1}');
  });

  it('overwrites the same day and keeps only the newest snapshots', async () => {
    const root = new MemDir('Backups');
    for (let d = 1; d <= 5; d++) await writeBackupFiles(root, `{"day":${d}}`, `2026-11-0${d}`, 3);
    await writeBackupFiles(root, '{"day":5,"later":true}', '2026-11-05', 3);
    const snaps = root.dirs.get(SNAPSHOT_DIR)!;
    expect([...snaps.files.keys()].sort()).toEqual([snapshotName('2026-11-03'), snapshotName('2026-11-04'), snapshotName('2026-11-05')]);
    expect(snaps.files.get(snapshotName('2026-11-05'))).toBe('{"day":5,"later":true}');
    expect(root.files.get(LATEST_FILE)).toBe('{"day":5,"later":true}');
  });

  it('never prunes files it did not create', async () => {
    const dir = new MemDir('snapshots');
    dir.files.set('notes.txt', 'mine');
    dir.files.set(snapshotName('2026-01-01'), '{}');
    dir.files.set(snapshotName('2026-01-02'), '{}');
    expect(await pruneSnapshots(dir, 1)).toEqual([snapshotName('2026-01-01')]);
    expect(dir.files.has('notes.txt')).toBe(true);
  });
});

describe('createScheduler', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('waits for a quiet period before running', async () => {
    const run = vi.fn(async () => {});
    const s = createScheduler(run, { debounceMs: 1000, maxWaitMs: 10_000 });
    s.notify();
    await vi.advanceTimersByTimeAsync(600);
    s.notify();
    await vi.advanceTimersByTimeAsync(600);
    expect(run).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(500);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('still runs within maxWait during constant changes', async () => {
    const run = vi.fn(async () => {});
    const s = createScheduler(run, { debounceMs: 1000, maxWaitMs: 3000 });
    for (let t = 0; t < 3500; t += 500) {
      s.notify();
      await vi.advanceTimersByTimeAsync(500);
    }
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('does not overlap runs and catches up afterwards', async () => {
    let release!: () => void;
    const run = vi.fn(() => new Promise<void>((r) => (release = r)));
    const s = createScheduler(run, { debounceMs: 100, maxWaitMs: 1000 });
    const first = s.flush();
    s.notify();
    await vi.advanceTimersByTimeAsync(200);
    expect(run).toHaveBeenCalledTimes(1);
    release();
    await first;
    await vi.advanceTimersByTimeAsync(200);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('can be cancelled', async () => {
    const run = vi.fn(async () => {});
    const s = createScheduler(run, { debounceMs: 100, maxWaitMs: 1000 });
    s.notify();
    expect(s.pending).toBe(true);
    s.cancel();
    await vi.advanceTimersByTimeAsync(500);
    expect(run).not.toHaveBeenCalled();
  });
});
