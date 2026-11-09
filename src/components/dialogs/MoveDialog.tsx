import { Check, Folder as FolderIcon, Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { descendantFolderIds } from '../../lib/tree';
import { moveDocTo, moveFolderTo } from '../../state/actions';
import { toast } from '../../state/feedback';
import { useUI } from '../../state/ui';
import { useWorkspace } from '../../state/workspace';
import { SpaceGlyph } from '../ui/Badges';
import { cx } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { locationOptions, optionKey, type LocationOption } from './locations';

export function MoveDialog() {
  const ws = useWorkspace();
  const item = useUI((s) => s.moveItem);
  const set = useUI((s) => s.set);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);

  useEffect(() => {
    setQuery('');
    setActive(0);
  }, [item]);

  const subject = item ? (item.kind === 'doc' ? ws.docById.get(item.id) : ws.folderById.get(item.id)) : undefined;
  const name = !subject ? '' : 'title' in subject ? subject.title || 'Untitled' : subject.name;
  const currentKey = !subject ? '' : 'title' in subject ? optionKey(subject.spaceId, subject.folderId) : optionKey(subject.spaceId, subject.parentId);

  const options = useMemo(() => {
    if (!item) return [];
    const exclude = item.kind === 'folder' ? new Set([item.id, ...descendantFolderIds(ws.folders, item.id)]) : undefined;
    const all = locationOptions(ws, exclude);
    const q = query.trim().toLowerCase();
    return q ? all.filter((o) => o.path.toLowerCase().includes(q)) : all;
  }, [ws, item, query]);

  const close = () => set({ moveItem: null });

  const choose = async (o: LocationOption) => {
    if (!item) return;
    close();
    if (o.key === currentKey) return;
    const ok =
      item.kind === 'doc'
        ? await moveDocTo(item.id, { spaceId: o.spaceId, folderId: o.folderId }, ws)
        : await moveFolderTo(item.id, { spaceId: o.spaceId, parentId: o.folderId }, ws);
    if (ok) toast(`Moved to ${o.path}`);
  };

  return (
    <Modal open={!!item && !!subject} onClose={close} title={`Move “${name}”`} width={480} top labelledBy="move-title">
      <div className="px-6 pt-2 pb-3">
        <label className="relative flex items-center">
          <Search size={14} className="pointer-events-none absolute left-3 text-fg-4" />
          <input
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActive((a) => Math.min(options.length - 1, a + 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActive((a) => Math.max(0, a - 1));
              } else if (e.key === 'Enter' && options[active]) {
                e.preventDefault();
                void choose(options[active]);
              }
            }}
            placeholder="Find a space or folder"
            className="field h-9! pl-9! text-[13px]"
          />
        </label>
      </div>
      <div className="max-h-[50vh] overflow-y-auto px-3 pb-3" role="listbox">
        {options.length === 0 && <div className="px-3 py-6 text-center text-[13px] text-fg-4">No matching location</div>}
        {options.map((o, i) => (
          <button
            key={o.key}
            role="option"
            aria-selected={i === active}
            onMouseEnter={() => setActive(i)}
            onClick={() => void choose(o)}
            className={cx('flex h-9 w-full items-center gap-2.5 rounded-lg pr-3 text-left text-[13px] transition-colors', i === active ? 'bg-hover text-fg' : 'text-fg-2')}
            style={{ paddingLeft: 12 + (query ? 0 : o.depth * 16) }}
          >
            {o.folderId ? <FolderIcon size={15} className="text-fg-3" /> : <SpaceGlyph space={o.space} size="sm" />}
            <span className="min-w-0 flex-1 truncate">{query ? o.path : o.label}</span>
            {o.key === currentKey && (
              <span className="flex items-center gap-1 text-[11.5px] text-fg-4">
                <Check size={12} /> Current
              </span>
            )}
          </button>
        ))}
      </div>
    </Modal>
  );
}
