import { ClipboardCopy, Cloud, Download, FolderOpen, HardDrive, KeyRound, Lock, LogOut, Pencil, Plus, RefreshCw, ShieldCheck, Upload, X } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Mark } from '../../brand/Logo';
import { backupFileName, BackupError, clearAll, exportBackup, parseBackup, restoreBackup } from '../../lib/backup';
import { IS_PREVIEW, SYNC_ENABLED } from '../../lib/env';
import { formatRelative } from '../../lib/dates';
import type { PlatformInfo } from '../../lib/platforms';
import { navigate, paths } from '../../lib/router';
import type { DocFont } from '../../lib/types';
import { copyToClipboard, downloadFile } from '../../state/actions';
import { confirmDialog, toast } from '../../state/feedback';
import { setNewPassword, signOut, useAuth } from '../../state/auth';
import { backupNow, chooseBackupFolder, reconnectBackupFolder, turnOffAutoBackup, useBackup } from '../../state/backup';
import { db, repo } from '../../state/repo';
import { useSettings, type ThemePref } from '../../state/settings';
import { syncNow, useSync } from '../../state/sync';
import { useUI } from '../../state/ui';
import { useWorkspace } from '../../state/workspace';
import { PlatformGlyph } from '../ui/Badges';
import { Button, cx } from '../ui/Button';
import { Modal } from '../ui/Modal';

function Row({ title, hint, children }: { title: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 border-b border-line py-4 last:border-b-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="text-[13.5px] font-medium text-fg">{title}</div>
        {hint && <div className="mt-0.5 text-[12.5px] leading-relaxed text-fg-3">{hint}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Choice<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex rounded-[10px] border border-line bg-sunken p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            'h-7 rounded-lg px-3 text-[12.5px] font-medium transition-colors',
            value === o.value ? 'bg-raised text-fg ring-1 ring-line-strong' : 'text-fg-3 hover:text-fg',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(1)} GB`;
}

export function SettingsDialog() {
  const open = useUI((s) => s.settingsOpen);
  const setUI = useUI((s) => s.set);
  const settings = useSettings();
  const fileInput = useRef<HTMLInputElement>(null);
  const [storage, setStorage] = useState<{ usage?: number; quota?: number; persisted?: boolean }>({});
  // Preview only: the backup text is prepared up front so "Copy" runs inside the click.
  const [previewJson, setPreviewJson] = useState('');
  const [showJson, setShowJson] = useState(false);

  const refreshStorage = async () => {
    const est = await navigator.storage?.estimate?.().catch(() => undefined);
    const persisted = await navigator.storage?.persisted?.().catch(() => undefined);
    setStorage({ usage: est?.usage, quota: est?.quota, persisted });
  };

  useEffect(() => {
    if (!open) return;
    void refreshStorage();
    setShowJson(false);
    if (IS_PREVIEW) void exportBackup(db).then((b) => setPreviewJson(JSON.stringify(b)));
  }, [open]);

  const close = () => setUI({ settingsOpen: false });

  const doExport = async () => {
    const backup = await exportBackup(db);
    downloadFile(backupFileName(), JSON.stringify(backup, null, 2), 'application/json');
    settings.set({ lastBackupAt: Date.now() });
    toast(`Backup saved — ${backup.docs.length} document${backup.docs.length === 1 ? '' : 's'}`, { tone: 'success' });
  };

  const doImport = async (file: File) => {
    try {
      const parsed = parseBackup(JSON.parse(await file.text()));
      const ok = await confirmDialog({
        title: 'Restore this backup?',
        message: (
          <>
            It contains {parsed.spaces.length} space{parsed.spaces.length === 1 ? '' : 's'} and {parsed.docs.length} document
            {parsed.docs.length === 1 ? '' : 's'}. <strong className="text-fg">Everything currently in the app{SYNC_ENABLED ? ' and in your account' : ''} will be replaced.</strong> Export a backup
            first if you are unsure.
          </>
        ),
        confirmLabel: 'Replace and restore',
        danger: true,
      });
      if (!ok) return;
      await restoreBackup(db, parsed);
      close();
      navigate(paths.home(), { replace: true });
      toast('Backup restored', { tone: 'success' });
    } catch (err) {
      toast(err instanceof BackupError ? err.message : 'That file could not be read as a backup.', { tone: 'error' });
    }
  };

  const doErase = async () => {
    const ok = await confirmDialog({
      title: 'Delete all data?',
      message: SYNC_ENABLED
        ? 'Every space, folder and document will be erased permanently — from your account and from this laptop. Export a backup first if you might need it.'
        : 'Every space, folder and document in this browser will be erased permanently. Export a backup first if you might need it.',
      confirmLabel: 'Erase everything',
      danger: true,
    });
    if (!ok) return;
    await clearAll(db);
    close();
    navigate(paths.home(), { replace: true });
    toast('All data erased');
  };

  const requestPersist = async () => {
    const granted = await navigator.storage?.persist?.().catch(() => false);
    await refreshStorage();
    toast(granted ? 'Storage is now protected from automatic cleanup' : 'The browser declined — keep regular backups', { tone: granted ? 'success' : 'default' });
  };

  const profileAndWriting = (
    <>
      <div className="label-display mt-7 mb-1">Profile</div>
      <Row title="Your name" hint="Used for the greeting on Home.">
        <input
          id="settings-name"
          value={settings.displayName}
          onChange={(e) => settings.set({ displayName: e.target.value })}
          placeholder="Your name"
          className="field w-full text-[13px] sm:w-[220px]"
          maxLength={40}
        />
      </Row>

      <div className="label-display mt-6 mb-1">Appearance & writing</div>
      <Row title="Theme" hint="The infin8scale look is dark-first.">
        <Choice<ThemePref>
          value={settings.theme}
          onChange={(theme) => settings.set({ theme })}
          options={[
            { value: 'dark', label: 'Dark' },
            { value: 'light', label: 'Light' },
            { value: 'system', label: 'System' },
          ]}
        />
      </Row>
      <Row title="Default font" hint="For new documents. Each document can switch in its Details panel.">
        <Choice<DocFont>
          value={settings.defaultFont}
          onChange={(defaultFont) => settings.set({ defaultFont })}
          options={[
            { value: 'sans', label: 'Sans' },
            { value: 'serif', label: 'Serif' },
            { value: 'mono', label: 'Mono' },
          ]}
        />
      </Row>
      <Row title="Speaking pace" hint={`Used for “spoken time” on scripts. Most creators land between 140 and 170 words per minute.`}>
        <div className="flex items-center gap-3">
          <input
            id="settings-wpm"
            type="range"
            min={100}
            max={220}
            step={5}
            value={settings.wpm}
            onChange={(e) => settings.set({ wpm: Number(e.target.value) })}
            className="w-[150px] accent-[var(--brand)]"
            aria-label="Words per minute"
          />
          <span className="w-[64px] text-right text-[12.5px] text-fg-2 tabular-nums">{settings.wpm} wpm</span>
        </div>
      </Row>
    </>
  );

  return (
    <Modal open={open} onClose={close} title="Settings" width={640} labelledBy="settings-title">
      <div className="px-6 pb-6">
        {SYNC_ENABLED && <AccountSection onDone={close} />}
        {/* The first section heading takes focus, so Settings opens at the top instead of jumping to "Your name". */}
        <div className={cx('label-display mb-1 outline-none', SYNC_ENABLED ? 'mt-7' : 'mt-3')} tabIndex={-1} data-autofocus>
          Backups & data
        </div>
        <div className="mt-2 flex items-start gap-3 rounded-xl border border-line bg-sunken p-3.5 text-[12.5px] leading-relaxed text-fg-2">
          <Lock size={15} className="mt-0.5 shrink-0 text-fg-3" />
          {IS_PREVIEW ? (
            <div>
              This is a preview for trying the app. What you write stays in this browser, for this page only, and the browser can clear it.{' '}
              <span className="text-fg">Keep the posts you care about in the app on your laptop.</span> To carry anything over, copy the backup here and
              restore it there.
            </div>
          ) : (
            <div>
              {SYNC_ENABLED ? (
                <>
                  Your posts are saved to your account (Supabase) and kept in this browser, so they work offline and come back after the browser is
                  cleared. The free plan has no automatic cloud backups, so <span className="text-fg">keep a backup file outside the browser too.</span>
                </>
              ) : (
                <>
                  Everything stays in this browser on this laptop — nothing is uploaded. Browser storage can still be wiped (clearing site data, a
                  reinstall, a broken laptop), so <span className="text-fg">keep a copy outside the browser.</span>
                </>
              )}
            </div>
          )}
        </div>
        {!IS_PREVIEW && <AutoBackupRow />}
        <Row
          title="Backup file"
          hint={
            <>
              {settings.lastBackupAt ? `Last backup ${formatRelative(settings.lastBackupAt)}. ` : ''}
              {storage.usage !== undefined
                ? `Using ${formatBytes(storage.usage)}${storage.quota ? ` of ${formatBytes(storage.quota)} available` : ''}.`
                : 'One JSON file with every space, folder and document.'}
            </>
          }
        >
          <div className="flex gap-2">
            {IS_PREVIEW ? (
              <Button
                size="sm"
                icon={<ClipboardCopy size={14} />}
                disabled={!previewJson}
                onClick={() => {
                  void copyToClipboard(previewJson, 'Backup copied — paste it into a .json file to keep it').then((ok) => setShowJson(!ok));
                }}
              >
                Copy backup
              </Button>
            ) : (
              <Button size="sm" icon={<Download size={14} />} onClick={() => void doExport()}>
                Export
              </Button>
            )}
            <Button size="sm" icon={<Upload size={14} />} onClick={() => fileInput.current?.click()}>
              Restore…
            </Button>
            <input
              ref={fileInput}
              id="settings-restore"
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (f) void doImport(f);
              }}
            />
          </div>
        </Row>
        {showJson && (
          <textarea
            id="settings-backup-json"
            readOnly
            value={previewJson}
            aria-label="Backup data"
            className="field mb-2 h-32! font-mono text-[11px]"
            onFocus={(e) => e.currentTarget.select()}
            ref={(el) => el?.select()}
          />
        )}
        {!IS_PREVIEW && (
          <Row
            title="Protect from cleanup"
            hint={
              storage.persisted
                ? 'The browser has agreed not to clear this data when space runs low.'
                : 'Browsers may clear site data when the disk is nearly full. Ask this one to keep it.'
            }
          >
            {storage.persisted ? (
              <span className="flex items-center gap-1.5 text-[12.5px] text-[var(--st-posted)]">
                <ShieldCheck size={15} /> Protected
              </span>
            ) : (
              <Button size="sm" icon={<HardDrive size={14} />} onClick={() => void requestPersist()}>
                Request
              </Button>
            )}
          </Row>
        )}
        <Row
          title="Erase everything"
          hint={SYNC_ENABLED ? 'Deletes all spaces, folders and documents from your account and this laptop.' : 'Deletes all spaces, folders and documents from this browser.'}
        >
          <Button size="sm" variant="ghost" className="text-danger! hover:bg-danger/10!" onClick={() => void doErase()}>
            Delete all data
          </Button>
        </Row>

        <PlatformsSection />

        {profileAndWriting}

        <div className="mt-5 flex items-center gap-3 text-[12px] text-fg-4">
          <Mark className="h-3.5 w-auto text-fg-3" />
          <span>Infin8 Content OS · v0.1.0</span>
        </div>
      </div>
    </Modal>
  );
}

/** Folder backups: off → choose folder; on → back up now / change / turn off. */
function AutoBackupRow() {
  const status = useBackup((st) => st.status);
  const folderName = useBackup((st) => st.folderName);
  const error = useBackup((st) => st.error);
  const busy = useBackup((st) => st.busy);
  const lastBackupAt = useSettings((st) => st.lastBackupAt);
  const last = lastBackupAt ? ` Last backup ${formatRelative(lastBackupAt)}.` : '';
  const title = 'Automatic backup';

  const choose = async () => {
    if (await chooseBackupFolder()) toast('Automatic backup is on — a copy is in your folder now', { tone: 'success' });
  };

  if (status === 'unsupported') {
    return (
      <Row title={title} hint="Needs Chrome, Edge, Brave or Arc on a computer. Until then, export a backup file after you post.">
        <span className="text-[12px] text-fg-4">Not available in this browser</span>
      </Row>
    );
  }
  if (status === 'off') {
    return (
      <Row
        title={title}
        hint={
          <>
            Saves everything to a folder on this laptop shortly after each change, plus one dated copy per day (the last 30 are kept).{' '}
            <span className="text-fg-2">Choose a folder inside Google Drive, Dropbox or iCloud Drive</span> to also keep a copy off this laptop.
          </>
        }
      >
        <Button size="sm" variant="primary" icon={<FolderOpen size={14} />} onClick={() => void choose()}>
          Choose folder…
        </Button>
      </Row>
    );
  }
  if (status === 'needs-permission') {
    return (
      <Row title={title} hint={`The browser needs your OK to keep saving to “${folderName}”.${last}`}>
        <div className="flex gap-2">
          <Button size="sm" variant="primary" onClick={() => void reconnectBackupFolder()}>
            Reconnect
          </Button>
          <Button size="sm" variant="ghost" onClick={() => void turnOffAutoBackup()}>
            Turn off
          </Button>
        </div>
      </Row>
    );
  }
  if (status === 'error') {
    return (
      <Row title={title} hint={<span className="text-danger">{error}</span>}>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => void backupNow()}>
            Try again
          </Button>
          <Button size="sm" variant="ghost" icon={<FolderOpen size={14} />} onClick={() => void choose()}>
            Choose folder…
          </Button>
        </div>
      </Row>
    );
  }
  return (
    <Row
      title={title}
      hint={
        <>
          On — saving to <span className="text-fg-2">“{folderName}”</span>.{last}
        </>
      }
    >
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={busy}
          onClick={async () => {
            if (await backupNow()) toast('Backed up', { tone: 'success' });
          }}
        >
          {busy ? 'Backing up…' : 'Back up now'}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => void choose()}>
          Change…
        </Button>
        <Button size="sm" variant="ghost" onClick={() => void turnOffAutoBackup()}>
          Turn off
        </Button>
      </div>
    </Row>
  );
}

/** Platforms the user added from a link, with a way to remove them. */
function PlatformsSection() {
  const ws = useWorkspace();
  const custom = ws.platforms.list.filter((p) => p.custom);
  const builtIn = ws.platforms.list.filter((p) => !p.custom);

  const remove = async (id: string, name: string) => {
    const uses = ws.docs.filter((d) => d.platforms.includes(id)).length;
    const ok = await confirmDialog({
      title: `Remove ${name}?`,
      message: uses
        ? `It is on ${uses} post${uses === 1 ? '' : 's'}; it will be taken off ${uses === 1 ? 'it' : 'them'}. The posts themselves stay.`
        : 'No posts use it.',
      confirmLabel: 'Remove platform',
      danger: true,
    });
    if (!ok) return;
    await repo.deletePlatform(id);
    toast(`${name} removed`);
  };

  return (
    <>
      <div className="label-display mt-7 mb-1">Platforms</div>
      <Row title="Your platforms" hint={`Built in: ${builtIn.map((p) => p.name).join(', ')}. Add any other platform from a link.`}>
        <Button size="sm" icon={<Plus size={14} />} onClick={() => useUI.getState().set({ addPlatform: {} })}>
          Add platform
        </Button>
      </Row>
      {custom.length > 0 && (
        <div className="mb-2 overflow-hidden rounded-xl border border-line">
          {custom.map((p) => (
            <PlatformRow key={p.id} platform={p} onRemove={() => void remove(p.id, p.name)} />
          ))}
        </div>
      )}
    </>
  );
}

/** One custom platform: name and limit can be corrected without taking it off posts. */
function PlatformRow({ platform: p, onRemove }: { platform: PlatformInfo; onRemove: () => void }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [limit, setLimit] = useState('');

  const start = () => {
    setName(p.name);
    setLimit(p.limit ? String(p.limit) : '');
    setEditing(true);
  };
  const save = async () => {
    await repo.updatePlatform(p.id, { name, limit: limit ? Number(limit) : null });
    setEditing(false);
    toast('Platform updated');
  };

  return (
    <div className="flex items-center gap-3 border-b border-line px-3.5 py-2.5 last:border-b-0">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-line bg-sunken text-fg">
        <PlatformGlyph icon={p.icon} name={editing ? name : p.name} size={16} />
      </span>
      {editing ? (
        <form
          className="flex min-w-0 flex-1 items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={40}
            aria-label="Platform name"
            className="field h-8! min-w-0 flex-1 text-[13px]"
            autoFocus
          />
          <input
            value={limit}
            onChange={(e) => setLimit(e.target.value.replace(/[^\d]/g, ''))}
            inputMode="numeric"
            placeholder="No limit"
            aria-label="Character limit"
            className="field h-8! w-[96px] text-[13px] tabular-nums"
          />
          <Button size="sm" variant="primary" type="submit">
            Save
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        </form>
      ) : (
        <>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-medium text-fg">{p.name}</span>
            <span className="block truncate text-[11.5px] text-fg-4">
              {[p.domain, p.limit ? `${p.limit.toLocaleString()} characters` : 'no character limit'].filter(Boolean).join(' · ')}
            </span>
          </span>
          <button
            aria-label={`Edit ${p.name}`}
            data-tip="Edit name and limit"
            onClick={start}
            className="rounded-md p-1.5 text-fg-4 transition-colors hover:bg-hover hover:text-fg"
          >
            <Pencil size={14} />
          </button>
          <button
            aria-label={`Remove ${p.name}`}
            data-tip="Remove"
            onClick={onRemove}
            className="rounded-md p-1.5 text-fg-4 transition-colors hover:bg-hover hover:text-danger"
          >
            <X size={14} />
          </button>
        </>
      )}
    </div>
  );
}

/** Who is signed in, whether the cloud copy is up to date, and signing out. */
function AccountSection({ onDone }: { onDone: () => void }) {
  const user = useAuth((s) => s.user);
  const { phase, pending, failed, lastSyncedAt, message } = useSync();
  const [changing, setChanging] = useState(false);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const status =
    phase === 'syncing'
      ? 'Syncing…'
      : phase === 'offline'
        ? `Offline — ${pending} change${pending === 1 ? '' : 's'} waiting on this laptop`
        : phase === 'reauth'
          ? 'Sign-in expired — sign out and back in to keep syncing'
          : phase === 'error'
            ? `Problem: ${message ?? 'retrying'}`
            : pending
              ? `${pending} change${pending === 1 ? '' : 's'} waiting to upload`
              : lastSyncedAt
                ? `Up to date · synced ${formatRelative(lastSyncedAt)}`
                : 'Up to date';

  const doSignOut = async () => {
    setBusy(true);
    let res = await signOut();
    if (res.pending) {
      const ok = await confirmDialog({
        title: 'Sign out with unsynced changes?',
        message: `${res.pending} change${res.pending === 1 ? '' : 's'} haven’t reached your account yet (you may be offline). If you sign out now, ${res.pending === 1 ? 'it' : 'they'} will be lost.`,
        confirmLabel: 'Sign out anyway',
        danger: true,
      });
      if (!ok) {
        setBusy(false);
        return;
      }
      res = await signOut({ discard: true });
    }
    setBusy(false);
    if (res.error) {
      toast(res.error, { tone: 'error' });
      return;
    }
    onDone();
  };

  const savePassword = async () => {
    if (password.length < 8) {
      toast('Use at least 8 characters.', { tone: 'error' });
      return;
    }
    setBusy(true);
    const err = await setNewPassword(password);
    setBusy(false);
    if (err) {
      toast(err, { tone: 'error' });
      return;
    }
    setChanging(false);
    setPassword('');
    toast('Password changed', { tone: 'success' });
  };

  return (
    <>
      <div className="label-display mt-3 mb-1 outline-none" tabIndex={-1} data-autofocus>
        Account
      </div>
      <Row title="Signed in" hint={user?.email ?? ''}>
        <Button size="sm" icon={<LogOut size={14} />} disabled={busy} onClick={() => void doSignOut()}>
          Sign out
        </Button>
      </Row>
      <Row title="Cloud sync" hint={failed ? `${status}. ${failed} item${failed === 1 ? '' : 's'} refused by the cloud (often a very large image).` : status}>
        <Button size="sm" icon={phase === 'syncing' ? <Cloud size={14} /> : <RefreshCw size={14} />} disabled={phase === 'syncing'} onClick={() => void syncNow()}>
          Sync now
        </Button>
      </Row>
      <Row title="Password" hint="Change the password you sign in with.">
        {changing ? (
          <form
            className="flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void savePassword();
            }}
          >
            <input
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="New password"
              aria-label="New password"
              className="field h-8! w-[170px] text-[13px]"
              autoFocus
            />
            <Button size="sm" variant="primary" type="submit" disabled={busy}>
              Save
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setChanging(false)}>
              Cancel
            </Button>
          </form>
        ) : (
          <Button size="sm" icon={<KeyRound size={14} />} onClick={() => setChanging(true)}>
            Change
          </Button>
        )}
      </Row>
    </>
  );
}
