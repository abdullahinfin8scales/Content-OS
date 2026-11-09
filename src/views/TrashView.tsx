import { ArchiveRestore, FileText, Folder as FolderIcon, Trash, X } from 'lucide-react';
import { useMemo, type ReactNode } from 'react';
import { TopBar } from '../components/TopBar';
import { SpaceGlyph } from '../components/ui/Badges';
import { Button, IconButton } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { formatRelative } from '../lib/dates';
import type { ID, ItemKind } from '../lib/types';
import { confirmDialog, toast } from '../state/feedback';
import { repo } from '../state/repo';
import { useWorkspace } from '../state/workspace';

interface TrashEntry {
  kind: ItemKind;
  id: ID;
  name: string;
  deletedAt: number;
  icon: ReactNode;
  detail: string;
}

export function TrashView() {
  const ws = useWorkspace();

  const entries = useMemo(() => {
    const out: TrashEntry[] = [];
    const nested = (rootId: ID) => {
      const docs = ws.trash.docs.filter((d) => d.trashRootId === rootId).length;
      const folders = ws.trash.folders.filter((f) => f.trashRootId === rootId && f.id !== rootId).length;
      const parts = [];
      if (folders) parts.push(`${folders} folder${folders === 1 ? '' : 's'}`);
      if (docs) parts.push(`${docs} document${docs === 1 ? '' : 's'}`);
      return parts.join(' · ') || 'Empty';
    };
    for (const s of ws.trash.spaces)
      out.push({ kind: 'space', id: s.id, name: s.name, deletedAt: s.deletedAt!, icon: <SpaceGlyph space={s} size="md" />, detail: `Space · ${nested(s.id)}` });
    for (const f of ws.trash.folders.filter((f) => f.trashRootId === f.id))
      out.push({ kind: 'folder', id: f.id, name: f.name, deletedAt: f.deletedAt!, icon: <FolderIcon size={16} className="text-fg-3" />, detail: `Folder · ${nested(f.id)}` });
    for (const d of ws.trash.docs.filter((d) => d.trashRootId === d.id))
      out.push({
        kind: 'doc',
        id: d.id,
        name: d.title || 'Untitled',
        deletedAt: d.deletedAt!,
        icon: <FileText size={16} className="text-fg-3" />,
        detail: d.excerpt ? d.excerpt.slice(0, 90) : 'Empty document',
      });
    return out.sort((a, b) => b.deletedAt - a.deletedAt);
  }, [ws]);

  const empty = async () => {
    const ok = await confirmDialog({
      title: 'Empty the Trash?',
      message: 'Everything in the Trash will be deleted permanently. This can’t be undone.',
      confirmLabel: 'Delete permanently',
      danger: true,
    });
    if (!ok) return;
    await repo.emptyTrash();
    toast('Trash emptied');
  };

  const purge = async (entry: TrashEntry) => {
    const ok = await confirmDialog({
      title: `Delete “${entry.name}” permanently?`,
      message: entry.kind === 'doc' ? 'This can’t be undone.' : 'It and everything that was deleted with it will be gone for good.',
      confirmLabel: 'Delete permanently',
      danger: true,
    });
    if (ok) await repo.purge(entry.kind, entry.id);
  };

  return (
    <>
      <TopBar
        crumbs={[{ label: 'Trash', icon: <Trash size={14} /> }]}
        actions={
          entries.length > 0 && (
            <Button size="sm" variant="ghost" className="text-danger!" onClick={() => void empty()}>
              Empty trash
            </Button>
          )
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto canvas-glow">
        <div className="mx-auto w-full max-w-[860px] px-4 pt-8 pb-24 sm:px-8">
          <div className="mb-6">
            <div className="label-display mb-2">Recover anything</div>
            <h1 className="text-[26px] leading-tight font-[680] tracking-[-0.025em] text-fg sm:text-[30px]">Trash</h1>
            <p className="mt-1.5 text-[13px] text-fg-3">Items stay here until you delete them permanently.</p>
          </div>
          {entries.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-line-strong">
              <EmptyState compact icon={<Trash size={24} />} title="Trash is empty" body="Deleted spaces, folders and documents land here first." />
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-line bg-raised shadow-card">
              {entries.map((e) => (
                <div key={`${e.kind}:${e.id}`} className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-b-0">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-line bg-sunken">{e.icon}</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13.5px] font-medium text-fg">{e.name}</div>
                    <div className="truncate text-[12px] text-fg-4">
                      {e.detail} · deleted {formatRelative(e.deletedAt)}
                    </div>
                  </div>
                  <Button size="sm" icon={<ArchiveRestore size={14} />} onClick={() => void repo.restore(e.kind, e.id).then(() => toast('Restored'))}>
                    Restore
                  </Button>
                  <IconButton label="Delete permanently" size="sm" className="hover:text-danger!" onClick={() => void purge(e)}>
                    <X size={15} />
                  </IconButton>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
