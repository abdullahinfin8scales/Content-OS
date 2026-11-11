import { CloudAlert, CloudCheck, CloudOff, CloudUpload, LoaderCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { formatRelative } from '../lib/dates';
import { useAuth } from '../state/auth';
import { useSync } from '../state/sync';
import { useUI } from '../state/ui';
import { cx } from './ui/Button';

/** One line in the sidebar that always says whether your posts are in the cloud. */
export function SyncStatus() {
  const { phase, pending, failed, lastSyncedAt, message } = useSync();
  const offlineStart = useAuth((s) => s.offline);
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  const waiting = `${pending} change${pending === 1 ? '' : 's'}`;
  let Icon = CloudCheck;
  let label = lastSyncedAt ? `Synced ${formatRelative(lastSyncedAt)}` : 'Synced';
  let tone: 'ok' | 'quiet' | 'warn' = 'ok';
  let tip = 'Your posts are saved to your account';

  if (phase === 'reauth') {
    Icon = CloudAlert;
    label = 'Sign in again to sync';
    tone = 'warn';
    tip = 'Your sign-in expired. Changes stay on this laptop until you sign in.';
  } else if (phase === 'offline' || (offlineStart && phase !== 'synced')) {
    Icon = CloudOff;
    label = pending ? `Offline · ${waiting} on this laptop` : 'Offline';
    tone = pending ? 'warn' : 'quiet';
    tip = 'Changes are saved on this laptop and upload when you’re back online';
  } else if (phase === 'error') {
    Icon = CloudAlert;
    label = 'Sync problem — retrying';
    tone = 'warn';
    tip = message ?? 'The cloud copy could not be updated';
  } else if (failed > 0 && phase !== 'syncing') {
    Icon = CloudAlert;
    label = `${failed} item${failed === 1 ? '' : 's'} not synced`;
    tone = 'warn';
    tip = 'The cloud refused some items — see Settings';
  } else if (phase === 'syncing' || pending > 0) {
    Icon = phase === 'syncing' ? LoaderCircle : CloudUpload;
    label = pending ? `Saving ${waiting} to the cloud…` : 'Syncing…';
    tone = 'quiet';
    tip = 'Uploading your latest changes';
  }

  return (
    <button
      onClick={() => useUI.getState().set({ settingsOpen: true })}
      data-tip={tip}
      className={cx(
        'mt-2 flex w-full items-center gap-1.5 rounded-md px-2.5 py-1 text-left text-[11.5px] transition-colors hover:bg-hover',
        tone === 'warn' ? 'text-[var(--st-drafting)]' : 'text-fg-4 hover:text-fg-2',
      )}
    >
      <Icon size={12} className={cx('shrink-0', Icon === LoaderCircle && 'spinner', tone === 'ok' && 'text-[var(--st-posted)]')} />
      <span className="truncate">{label}</span>
    </button>
  );
}
