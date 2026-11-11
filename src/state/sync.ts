import { liveQuery } from 'dexie';
import { create } from 'zustand';
import { getMeta, LAST_SYNC_KEY, pullChanges, pushPending, setMeta, SyncError, type SyncServer } from '../sync/engine';
import { db } from './repo';

/**
 * Runs sync in the background while signed in:
 * - uploads 1.5 s after the last change (at most 10 s after the first),
 * - downloads on start, when the window regains focus, when the connection
 *   comes back, and every minute while the app is visible,
 * - backs off on errors and keeps every change queued until it is accepted.
 */

export type SyncPhase = 'off' | 'syncing' | 'synced' | 'offline' | 'error' | 'reauth';

interface SyncState {
  phase: SyncPhase;
  /** Changes on this laptop not yet in the cloud. */
  pending: number;
  /** Changes the cloud refused (shown in Settings). */
  failed: number;
  lastSyncedAt: number | null;
  message: string | null;
}

export const useSync = create<SyncState>(() => ({ phase: 'off', pending: 0, failed: 0, lastSyncedAt: null, message: null }));

const PUSH_DELAY = 1500;
const MAX_WAIT = 10_000;
const POLL = 60_000;
const FOCUS_GAP = 15_000;
const BACKOFF = [5, 15, 30, 60, 120, 300];

let server: SyncServer | null = null;
let refreshSession: (() => Promise<boolean>) | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let dueAt = 0;
let firstWaitingAt = 0;
let running: Promise<void> | null = null;
let lastRunAt = 0;
let failures = 0;
let teardown: (() => void)[] = [];

function setTimer(at: number) {
  if (timer) clearTimeout(timer);
  dueAt = at;
  timer = setTimeout(() => {
    timer = null;
    void syncNow();
  }, Math.max(0, at - Date.now()));
}

/** Sync no later than `delay` from now. */
function soon(delay: number) {
  if (!server) return;
  const at = Date.now() + delay;
  if (timer && dueAt <= at) return;
  setTimer(at);
}

function onPending(count: number) {
  useSync.setState({ pending: count });
  if (!server) return;
  if (!count) {
    firstWaitingAt = 0;
    return;
  }
  const now = Date.now();
  if (!firstWaitingAt) firstWaitingAt = now;
  const phase = useSync.getState().phase;
  if (phase === 'offline' || phase === 'error' || phase === 'reauth') return; // retry timer already set
  setTimer(Math.min(now + PUSH_DELAY, firstWaitingAt + MAX_WAIT));
}

async function countFailed() {
  return db.outbox.filter((e) => !!e.error).count();
}

async function handleError(err: unknown) {
  const e = err instanceof SyncError ? err : new SyncError(err instanceof Error ? err.message : String(err), 'server');
  failures++;
  const wait = BACKOFF[Math.min(failures - 1, BACKOFF.length - 1)] * 1000;
  if (e.kind === 'auth') {
    if (failures <= 2 && refreshSession && (await refreshSession())) {
      soon(1000);
      return;
    }
    useSync.setState({ phase: 'reauth', message: e.message });
    return;
  }
  const offline = e.kind === 'network' || (typeof navigator !== 'undefined' && navigator.onLine === false);
  useSync.setState({ phase: offline ? 'offline' : 'error', message: e.message });
  soon(wait);
}

/** Uploads waiting changes, then downloads new ones. Concurrent calls share one run. */
export function syncNow(): Promise<void> {
  if (!server) return Promise.resolve();
  if (running) return running;
  const s = server;
  running = (async () => {
    lastRunAt = Date.now();
    useSync.setState({ phase: 'syncing' });
    try {
      await pushPending(db, s);
      await pullChanges(db, s);
      failures = 0;
      firstWaitingAt = 0;
      const now = Date.now();
      await setMeta(db, LAST_SYNC_KEY, now);
      if (server === s) useSync.setState({ phase: 'synced', lastSyncedAt: now, message: null, failed: await countFailed() });
      // Changes made while this ran are uploaded next.
      const waiting = (await db.outbox.toArray()).some((e) => !e.error);
      if (waiting) soon(PUSH_DELAY);
    } catch (err) {
      if (server === s) await handleError(err);
    } finally {
      running = null;
    }
  })();
  return running;
}

export function startSync(s: SyncServer, opts: { refreshSession: () => Promise<boolean> }) {
  stopSync();
  server = s;
  refreshSession = opts.refreshSession;
  failures = 0;
  void getMeta<number>(db, LAST_SYNC_KEY).then((t) => useSync.setState({ lastSyncedAt: t ?? null }));
  void countFailed().then((failed) => useSync.setState({ failed }));

  const sub = liveQuery(() => db.outbox.count()).subscribe({ next: onPending, error: () => {} });
  const onOnline = () => soon(0);
  const onFocus = () => {
    if (document.visibilityState === 'visible' && Date.now() - lastRunAt > FOCUS_GAP) soon(0);
  };
  const poll = setInterval(() => {
    if (document.visibilityState === 'visible') soon(0);
  }, POLL);
  window.addEventListener('online', onOnline);
  window.addEventListener('focus', onFocus);
  document.addEventListener('visibilitychange', onFocus);
  teardown = [
    () => sub.unsubscribe(),
    () => clearInterval(poll),
    () => window.removeEventListener('online', onOnline),
    () => window.removeEventListener('focus', onFocus),
    () => document.removeEventListener('visibilitychange', onFocus),
  ];
  useSync.setState({ phase: 'syncing', message: null });
  soon(0);
}

export function stopSync() {
  for (const f of teardown) f();
  teardown = [];
  if (timer) clearTimeout(timer);
  timer = null;
  server = null;
  refreshSession = null;
  firstWaitingAt = 0;
  useSync.setState({ phase: 'off', message: null });
}

/** First download on this laptop, with progress (rows received so far). */
export async function downloadAll(s: SyncServer, onProgress: (rows: number) => void) {
  await pullChanges(db, s, onProgress);
  await setMeta(db, LAST_SYNC_KEY, Date.now());
}
