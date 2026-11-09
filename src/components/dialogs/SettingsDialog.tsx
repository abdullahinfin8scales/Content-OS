import { Download, HardDrive, Lock, ShieldCheck, Upload } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Mark } from '../../brand/Logo';
import { backupFileName, BackupError, clearAll, exportBackup, parseBackup, restoreBackup } from '../../lib/backup';
import { navigate, paths } from '../../lib/router';
import type { DocFont } from '../../lib/types';
import { downloadFile } from '../../state/actions';
import { confirmDialog, toast } from '../../state/feedback';
import { db } from '../../state/repo';
import { useSettings, type ThemePref } from '../../state/settings';
import { useUI } from '../../state/ui';
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

  const refreshStorage = async () => {
    const est = await navigator.storage?.estimate?.().catch(() => undefined);
    const persisted = await navigator.storage?.persisted?.().catch(() => undefined);
    setStorage({ usage: est?.usage, quota: est?.quota, persisted });
  };

  useEffect(() => {
    if (open) void refreshStorage();
  }, [open]);

  const close = () => setUI({ settingsOpen: false });

  const doExport = async () => {
    const backup = await exportBackup(db);
    downloadFile(backupFileName(), JSON.stringify(backup, null, 2), 'application/json');
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
            {parsed.docs.length === 1 ? '' : 's'}. <strong className="text-fg">Everything currently in the app will be replaced.</strong> Export a backup
            first if you are unsure.
          </>
        ),
        confirmLabel: 'Replace and restore',
        danger: true,
      });
      if (!ok) return;
      await restoreBackup(db, parsed);
      localStorage.setItem('infin8.seeded', '1');
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
      message: 'Every space, folder and document in this browser will be erased permanently. Export a backup first if you might need it.',
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

  return (
    <Modal open={open} onClose={close} title="Settings" width={620} labelledBy="settings-title">
      <div className="px-6 pb-6">
        <div className="label-display mt-3 mb-1">Profile</div>
        <Row title="Your name" hint="Used for the greeting on Home.">
          <input
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

        <div className="label-display mt-6 mb-1">Your data</div>
        <div className="mt-2 flex items-start gap-3 rounded-xl border border-line bg-sunken p-3.5 text-[12.5px] leading-relaxed text-fg-2">
          <Lock size={15} className="mt-0.5 shrink-0 text-fg-3" />
          <div>
            Everything is stored privately in this browser (IndexedDB) — nothing is uploaded. That also means it lives on this device only: clearing site data
            or switching browsers will not bring it along. <span className="text-fg">Export a backup regularly.</span>
          </div>
        </div>
        <Row
          title="Backup"
          hint={storage.usage !== undefined ? `Using ${formatBytes(storage.usage)}${storage.quota ? ` of ${formatBytes(storage.quota)} available` : ''}.` : 'A single JSON file with every space, folder and document.'}
        >
          <div className="flex gap-2">
            <Button size="sm" icon={<Download size={14} />} onClick={() => void doExport()}>
              Export
            </Button>
            <Button size="sm" icon={<Upload size={14} />} onClick={() => fileInput.current?.click()}>
              Restore…
            </Button>
            <input
              ref={fileInput}
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
        <Row title="Erase everything" hint="Deletes all spaces, folders and documents from this browser.">
          <Button size="sm" variant="ghost" className="text-danger! hover:bg-danger/10!" onClick={() => void doErase()}>
            Delete all data
          </Button>
        </Row>

        <div className="mt-6 flex items-center gap-3 border-t border-line pt-5 text-[12px] text-fg-4">
          <Mark className="h-3.5 w-auto text-fg-3" />
          <span>Infin8 Content OS · v0.1.0</span>
        </div>
      </div>
    </Modal>
  );
}
