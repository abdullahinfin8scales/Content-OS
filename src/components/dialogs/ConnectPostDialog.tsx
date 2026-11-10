import { Search, Spool } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { formatRelative } from '../../lib/dates';
import { connectPostAfter } from '../../state/actions';
import { useUI } from '../../state/ui';
import { threadOf, useWorkspace } from '../../state/workspace';
import { locationLabel } from '../docs/DocItems';
import { StatusDot } from '../ui/Badges';
import { cx } from '../ui/Button';
import { Modal } from '../ui/Modal';

/** Pick an existing post to follow the current one in its thread. */
export function ConnectPostDialog() {
  const ws = useWorkspace();
  const request = useUI((s) => s.connectPost);
  const set = useUI((s) => s.set);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);

  useEffect(() => {
    setQuery('');
    setActive(0);
  }, [request]);

  const after = request ? ws.docById.get(request.afterDocId) : undefined;
  const place = after ? threadOf(ws, after) : null;

  const candidates = useMemo(() => {
    if (!after) return [];
    const exclude = new Set([after.id, ...(place?.posts.map((p) => p.id) ?? [])]);
    const q = query.trim().toLowerCase();
    return ws.docs
      .filter((d) => d.kind === 'content' && !exclude.has(d.id))
      .filter((d) => !q || (d.title || 'untitled').toLowerCase().includes(q) || d.excerpt.toLowerCase().includes(q))
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 60);
  }, [ws, after, place, query]);

  const close = () => set({ connectPost: null });
  const choose = (docId: string) => {
    if (!after) return;
    close();
    void connectPostAfter(after.id, docId, ws);
  };

  return (
    <Modal
      open={!!after}
      onClose={close}
      title="Connect an existing post"
      description={`It will follow “${after?.title || 'Untitled'}”${place ? ` in “${place.thread.name}”` : ' and the two become a thread'}.`}
      width={520}
      top
      labelledBy="connect-post-title"
    >
      <div className="px-6 pt-2 pb-3">
        <label className="relative flex items-center">
          <Search size={14} className="pointer-events-none absolute left-3 text-fg-4" />
          <input
            id="connect-post-search"
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActive((a) => Math.min(candidates.length - 1, a + 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActive((a) => Math.max(0, a - 1));
              } else if (e.key === 'Enter' && candidates[active]) {
                e.preventDefault();
                choose(candidates[active].id);
              }
            }}
            placeholder="Find a post"
            className="field h-9! pl-9! text-[13px]"
          />
        </label>
      </div>
      <div className="max-h-[50vh] overflow-y-auto px-3 pb-3" role="listbox" aria-label="Posts">
        {candidates.length === 0 && <div className="px-3 py-6 text-center text-[13px] text-fg-4">No other posts to connect</div>}
        {candidates.map((d, i) => {
          const other = threadOf(ws, d);
          return (
            <button
              key={d.id}
              role="option"
              aria-selected={i === active}
              onMouseEnter={() => setActive(i)}
              onClick={() => choose(d.id)}
              className={cx('flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors', i === active ? 'bg-hover' : '')}
            >
              <StatusDot status={d.status} className="h-1.5! w-1.5! shadow-none!" />
              <span className="min-w-0 flex-1">
                <span className={cx('block truncate text-[13.5px]', d.title ? 'text-fg' : 'text-fg-3')}>{d.title || 'Untitled'}</span>
                <span className="block truncate text-[12px] text-fg-4">
                  {locationLabel(ws, d)} · {formatRelative(d.updatedAt)}
                </span>
              </span>
              {other && (
                <span className="flex shrink-0 items-center gap-1 text-[11.5px] text-fg-4" data-tip={`Will leave “${other.thread.name}”`}>
                  <Spool size={12} /> in a thread
                </span>
              )}
            </button>
          );
        })}
      </div>
    </Modal>
  );
}
