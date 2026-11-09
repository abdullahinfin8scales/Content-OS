import { ShieldAlert, ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { formatRelative } from '../lib/dates';
import { reconnectBackupFolder, useBackup } from '../state/backup';
import { useSettings } from '../state/settings';
import { useUI } from '../state/ui';
import { cx } from './ui/Button';

const WEEK = 7 * 86_400_000;

/** One line in the sidebar that always says whether your posts are backed up. */
export function BackupStatus() {
  const status = useBackup((s) => s.status);
  const busy = useBackup((s) => s.busy);
  const folderName = useBackup((s) => s.folderName);
  const lastBackupAt = useSettings((s) => s.lastBackupAt);
  const openSettings = () => useUI.getState().set({ settingsOpen: true });
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 60_000);
    return () => clearInterval(t);
  }, []);

  let warn = false;
  let label: string;
  let tip: string;
  let onClick = openSettings;
  if (status === 'needs-permission') {
    warn = true;
    label = 'Reconnect backup folder';
    tip = `Allow the browser to keep saving to “${folderName}”`;
    onClick = () => void reconnectBackupFolder();
  } else if (status === 'error') {
    warn = true;
    label = 'Backup failed — open Settings';
    tip = 'Automatic backup could not write to its folder';
  } else if (status === 'active') {
    label = busy ? 'Backing up…' : lastBackupAt ? `Backed up ${formatRelative(lastBackupAt)}` : 'Automatic backup on';
    tip = `Saving automatically to “${folderName}”`;
  } else {
    warn = !lastBackupAt || Date.now() - lastBackupAt > WEEK;
    label = lastBackupAt ? `Last backup ${formatRelative(lastBackupAt)}` : 'Not backed up yet';
    tip = 'Your posts live only in this browser — set up a backup in Settings';
  }

  const Icon = warn ? ShieldAlert : ShieldCheck;
  return (
    <button
      onClick={onClick}
      data-tip={tip}
      className={cx(
        'mt-2 flex w-full items-center gap-1.5 rounded-md px-2.5 py-1 text-left text-[11.5px] transition-colors hover:bg-hover',
        warn ? 'text-[var(--st-drafting)]' : 'text-fg-4 hover:text-fg-2',
      )}
    >
      <Icon size={12} className={cx('shrink-0', !warn && status === 'active' && 'text-[var(--st-posted)]')} />
      <span className="truncate">{label}</span>
    </button>
  );
}
