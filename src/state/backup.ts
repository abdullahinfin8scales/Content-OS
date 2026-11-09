import { create } from 'zustand';
import { createScheduler, writeBackupFiles, type DirLike } from '../lib/autoBackup';
import { exportBackup } from '../lib/backup';
import { todayISO } from '../lib/dates';
import { IS_PREVIEW } from '../lib/env';
import { db } from './repo';
import { useSettings } from './settings';

/* Chromium-only parts of the File System Access API, not in TypeScript's DOM lib. */
type Access = { mode: 'read' | 'readwrite' };
type FolderHandle = FileSystemDirectoryHandle & {
  queryPermission?: (d: Access) => Promise<PermissionState>;
  requestPermission?: (d: Access) => Promise<PermissionState>;
};
type DirectoryPicker = (options?: { id?: string; mode?: 'read' | 'readwrite'; startIn?: string }) => Promise<FolderHandle>;

const META_KEY = 'backupFolder';
const READWRITE: Access = { mode: 'readwrite' };

/** Folder backups need Chrome/Edge/Brave/Arc on a computer, running as a top-level page. */
export const autoBackupSupported =
  !IS_PREVIEW &&
  typeof window !== 'undefined' &&
  typeof (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker === 'function' &&
  window.self === window.top;

export type BackupStatus = 'unsupported' | 'off' | 'active' | 'needs-permission' | 'error';

interface BackupState {
  status: BackupStatus;
  folderName: string | null;
  error: string | null;
  busy: boolean;
}

export const useBackup = create<BackupState>()(() => ({
  status: autoBackupSupported ? 'off' : 'unsupported',
  folderName: null,
  error: null,
  busy: false,
}));

let folder: FolderHandle | null = null;
let listening = false;

/** Don't lose a pending backup when the tab goes to the background or closes. */
function listenForHide() {
  if (listening) return;
  listening = true;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && scheduler.pending) void scheduler.flush();
  });
}

async function permission(handle: FolderHandle, ask: boolean): Promise<PermissionState> {
  try {
    const fn = ask ? handle.requestPermission : handle.queryPermission;
    return fn ? await fn.call(handle, READWRITE) : 'granted';
  } catch {
    return 'prompt';
  }
}

function describe(err: unknown): string {
  const name = err instanceof DOMException ? err.name : '';
  if (name === 'NotFoundError') return 'The backup folder was moved or deleted. Choose a folder again.';
  if (name === 'QuotaExceededError') return 'The disk is full, so the backup could not be written.';
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'The browser blocked writing to the backup folder.';
  return 'The backup could not be written. Try “Back up now” again.';
}

/** Writes a full backup to the folder now. Returns true when files were written. */
export async function backupNow(): Promise<boolean> {
  if (!folder) return false;
  useBackup.setState({ busy: true });
  try {
    if ((await permission(folder, false)) !== 'granted') {
      useBackup.setState({ status: 'needs-permission' });
      return false;
    }
    const backup = await exportBackup(db);
    // Never replace a good backup with an empty one (e.g. right after "Delete all data").
    if (!backup.docs.some((d) => !d.deletedAt)) return false;
    await writeBackupFiles(folder as unknown as DirLike, JSON.stringify(backup), todayISO());
    useSettings.getState().set({ lastBackupAt: Date.now() });
    useBackup.setState({ status: 'active', error: null });
    return true;
  } catch (err) {
    console.error('Automatic backup failed', err);
    useBackup.setState({ status: 'error', error: describe(err) });
    return false;
  } finally {
    useBackup.setState({ busy: false });
  }
}

const scheduler = createScheduler(
  async () => {
    if (useBackup.getState().status === 'active') await backupNow();
  },
  { debounceMs: 20_000, maxWaitMs: 120_000 },
);

/** Call when content changes; backs up shortly after the user pauses. */
export function notifyContentChanged() {
  if (folder && useBackup.getState().status === 'active') scheduler.notify();
}

/** Restores the remembered folder on startup. */
export async function initAutoBackup() {
  if (!autoBackupSupported) return;
  const row = await db.meta.get(META_KEY).catch(() => undefined);
  const handle = row?.value as FolderHandle | undefined;
  if (!handle) return;
  folder = handle;
  const state = await permission(handle, false);
  useBackup.setState({ folderName: handle.name, status: state === 'granted' ? 'active' : 'needs-permission' });
  // Catch up if the last backup is more than a few hours old.
  const last = useSettings.getState().lastBackupAt ?? 0;
  if (state === 'granted' && Date.now() - last > 6 * 3600_000) scheduler.notify();
  listenForHide();
}

/** Asks the user for a folder (must run from a click). */
export async function chooseBackupFolder(): Promise<boolean> {
  const picker = (window as unknown as { showDirectoryPicker?: DirectoryPicker }).showDirectoryPicker;
  if (!picker) return false;
  let handle: FolderHandle;
  try {
    handle = await picker({ id: 'infin8-backups', mode: 'readwrite', startIn: 'documents' });
  } catch {
    return false; // cancelled
  }
  folder = handle;
  await db.meta.put({ key: META_KEY, value: handle });
  useBackup.setState({ folderName: handle.name, status: 'active', error: null });
  listenForHide();
  return backupNow();
}

/** Re-grants access after a browser restart (must run from a click). */
export async function reconnectBackupFolder(): Promise<boolean> {
  if (!folder) return false;
  if ((await permission(folder, true)) !== 'granted') {
    useBackup.setState({ status: 'needs-permission' });
    return false;
  }
  useBackup.setState({ status: 'active', error: null });
  return backupNow();
}

export async function turnOffAutoBackup() {
  scheduler.cancel();
  folder = null;
  await db.meta.delete(META_KEY);
  useBackup.setState({ status: autoBackupSupported ? 'off' : 'unsupported', folderName: null, error: null });
}
