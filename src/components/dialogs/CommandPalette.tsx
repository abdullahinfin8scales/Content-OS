import {
  CalendarDays,
  CornerDownLeft,
  FilePlus,
  FileText,
  Folder as FolderIcon,
  FolderPlus,
  House,
  LayoutGrid,
  Library,
  Moon,
  Search,
  Settings,
  SquareKanban,
  Trash,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { navigate, paths } from '../../lib/router';
import { db } from '../../state/repo';
import { defaultLocation, newFolder, openNewDocDialog, quickNewDoc } from '../../state/actions';
import { resolveTheme, useSettings } from '../../state/settings';
import { useUI } from '../../state/ui';
import { useWorkspace, type Workspace } from '../../state/workspace';
import { locationLabel } from '../docs/DocItems';
import { SpaceGlyph, StatusDot } from '../ui/Badges';
import { cx } from '../ui/Button';
import { Modal } from '../ui/Modal';

interface Result {
  id: string;
  group: string;
  label: string;
  detail?: string;
  icon: ReactNode;
  run: () => void;
  score: number;
}

/** Cheap fuzzy score: prefix > word-start > substring > in-order letters. */
function score(text: string, query: string): number {
  const t = text.toLowerCase();
  const q = query.toLowerCase();
  if (!q) return 1;
  if (t.startsWith(q)) return 100 - Math.min(40, t.length - q.length);
  const idx = t.indexOf(q);
  if (idx > 0 && /\W/.test(t[idx - 1])) return 70;
  if (idx >= 0) return 50;
  let i = 0;
  for (const ch of t) if (ch === q[i]) i++;
  return i === q.length ? 20 : 0;
}

function snippet(text: string, query: string): string {
  const i = text.toLowerCase().indexOf(query.toLowerCase());
  if (i < 0) return '';
  const start = Math.max(0, i - 40);
  const s = text.slice(start, i + query.length + 60).replace(/\s+/g, ' ');
  return (start > 0 ? '…' : '') + s + '…';
}

function buildActions(ws: Workspace, close: () => void): Omit<Result, 'score'>[] {
  const set = useUI.getState().set;
  const go = (to: string) => () => {
    close();
    navigate(to);
  };
  const loc = defaultLocation(ws);
  return [
    { id: 'a:new', group: 'Actions', label: 'New document', detail: 'Blank', icon: <FilePlus size={15} />, run: () => (close(), void quickNewDoc(ws)) },
    { id: 'a:tpl', group: 'Actions', label: 'New from template…', icon: <LayoutGrid size={15} />, run: () => (close(), openNewDocDialog()) },
    ...(loc
      ? [{ id: 'a:folder', group: 'Actions', label: 'New folder', icon: <FolderPlus size={15} />, run: () => (close(), void newFolder(loc.spaceId, loc.folderId, ws)) }]
      : []),
    { id: 'a:space', group: 'Actions', label: 'New space', icon: <SpaceGlyph space={{ icon: 'sparkles', color: 'white' }} size="sm" />, run: () => (close(), set({ spaceDialog: {} })) },
    { id: 'g:home', group: 'Go to', label: 'Home', icon: <House size={15} />, run: go(paths.home()) },
    { id: 'g:library', group: 'Go to', label: 'Library', icon: <Library size={15} />, run: go(paths.library()) },
    { id: 'g:pipeline', group: 'Go to', label: 'Pipeline', icon: <SquareKanban size={15} />, run: go(paths.pipeline()) },
    { id: 'g:calendar', group: 'Go to', label: 'Calendar', icon: <CalendarDays size={15} />, run: go(paths.calendar()) },
    { id: 'g:trash', group: 'Go to', label: 'Trash', icon: <Trash size={15} />, run: go(paths.trash()) },
    { id: 'a:settings', group: 'Actions', label: 'Settings', detail: 'Theme, backup, speaking pace', icon: <Settings size={15} />, run: () => (close(), set({ settingsOpen: true })) },
    {
      id: 'a:theme',
      group: 'Actions',
      label: 'Toggle light / dark',
      icon: <Moon size={15} />,
      run: () => {
        const s = useSettings.getState();
        s.set({ theme: resolveTheme(s.theme) === 'dark' ? 'light' : 'dark' });
        close();
      },
    },
  ];
}

export function CommandPalette() {
  const ws = useWorkspace();
  const open = useUI((s) => s.paletteOpen);
  const set = useUI((s) => s.set);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [texts, setTexts] = useState<Map<string, string> | null>(null);
  const list = useRef<HTMLDivElement>(null);

  const close = () => set({ paletteOpen: false });

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActive(0);
    let alive = true;
    // Full-text index is loaded on demand; titles work instantly.
    db.texts.toArray().then((rows) => alive && setTexts(new Map(rows.map((r) => [r.id, r.text]))));
    return () => {
      alive = false;
    };
  }, [open]);

  const results = useMemo(() => {
    if (!open) return [];
    const q = query.trim();
    const actions = buildActions(ws, close);
    if (!q) {
      const recent = [...ws.docs]
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, 6)
        .map<Result>((d) => ({
          id: d.id,
          group: 'Recent',
          label: d.title || 'Untitled',
          detail: locationLabel(ws, d),
          icon: d.kind === 'content' ? <StatusDot status={d.status} className="h-1.5! w-1.5! shadow-none!" /> : <FileText size={15} />,
          run: () => (close(), navigate(paths.doc(d.id))),
          score: 0,
        }));
      return [...recent, ...actions.map((a) => ({ ...a, score: 0 }))];
    }

    const out: Result[] = [];
    const seen = new Set<string>();
    for (const d of ws.docs) {
      const s = Math.max(score(d.title || 'Untitled', q), ...d.tags.map((t) => score(t, q) * 0.8));
      if (s > 0) {
        seen.add(d.id);
        out.push({
          id: d.id,
          group: 'Documents',
          label: d.title || 'Untitled',
          detail: locationLabel(ws, d),
          icon: d.kind === 'content' ? <StatusDot status={d.status} className="h-1.5! w-1.5! shadow-none!" /> : <FileText size={15} />,
          run: () => (close(), navigate(paths.doc(d.id))),
          score: s + 10,
        });
      }
    }
    if (texts && q.length >= 2) {
      for (const d of ws.docs) {
        if (seen.has(d.id)) continue;
        const text = texts.get(d.id);
        if (!text || !text.toLowerCase().includes(q.toLowerCase())) continue;
        out.push({
          id: d.id,
          group: 'Found in text',
          label: d.title || 'Untitled',
          detail: snippet(text, q),
          icon: <FileText size={15} />,
          run: () => (close(), navigate(paths.doc(d.id))),
          score: 5,
        });
      }
    }
    for (const f of ws.folders) {
      const s = score(f.name, q);
      if (s > 0)
        out.push({
          id: f.id,
          group: 'Folders',
          label: f.name,
          detail: ws.spaceById.get(f.spaceId)?.name,
          icon: <FolderIcon size={15} />,
          run: () => (close(), navigate(paths.folder(f.id))),
          score: s,
        });
    }
    for (const sp of ws.spaces) {
      const s = score(sp.name, q);
      if (s > 0)
        out.push({ id: sp.id, group: 'Spaces', label: sp.name, icon: <SpaceGlyph space={sp} size="sm" />, run: () => (close(), navigate(paths.space(sp.id))), score: s });
    }
    for (const a of actions) {
      const s = score(a.label, q);
      if (s > 0) out.push({ ...a, score: s - 5 });
    }
    const order = ['Documents', 'Spaces', 'Folders', 'Actions', 'Go to', 'Found in text'];
    return out
      .sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group) || b.score - a.score)
      .slice(0, 40);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, query, ws, texts]);

  useEffect(() => {
    list.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  let lastGroup = '';

  return (
    <Modal open={open} onClose={close} width={620} top hideClose className="rounded-[18px]">
      <div className="flex items-center gap-3 border-b border-line px-4">
        <Search size={17} className="shrink-0 text-fg-3" />
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
              setActive((a) => Math.min(results.length - 1, a + 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((a) => Math.max(0, a - 1));
            } else if (e.key === 'Enter') {
              e.preventDefault();
              results[active]?.run();
            }
          }}
          placeholder="Search documents, folders, spaces — or run a command"
          className="h-14 min-w-0 flex-1 bg-transparent text-[15px] text-fg outline-none placeholder:text-fg-4"
          aria-label="Search"
        />
        <span className="kbd">Esc</span>
      </div>
      <div ref={list} className="max-h-[min(460px,60vh)] overflow-y-auto p-2" role="listbox">
        {results.length === 0 && (
          <div className="px-3 py-10 text-center text-[13px] text-fg-4">
            No results for “{query}”
            {!texts && <div className="mt-1">Searching inside documents…</div>}
          </div>
        )}
        {results.map((r, i) => {
          const header = r.group !== lastGroup;
          lastGroup = r.group;
          return (
            <div key={`${r.group}:${r.id}`}>
              {header && <div className="label-display px-3 pt-3 pb-1.5">{r.group}</div>}
              <button
                data-index={i}
                role="option"
                aria-selected={i === active}
                onMouseMove={() => i !== active && setActive(i)}
                onClick={() => r.run()}
                className={cx('flex min-h-10 w-full items-center gap-3 rounded-[10px] px-3 py-2 text-left transition-colors', i === active ? 'bg-hover' : '')}
              >
                <span className="flex w-5 shrink-0 justify-center text-fg-3">{r.icon}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] text-fg">{r.label}</span>
                  {r.detail && <span className="block truncate text-[12px] text-fg-4">{r.detail}</span>}
                </span>
                {i === active && <CornerDownLeft size={14} className="shrink-0 text-fg-4" />}
              </button>
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-4 border-t border-line px-4 py-2.5 text-[11.5px] text-fg-4">
        <span className="flex items-center gap-1.5">
          <span className="kbd">↑</span>
          <span className="kbd">↓</span> navigate
        </span>
        <span className="flex items-center gap-1.5">
          <span className="kbd">↵</span> open
        </span>
        <span className="ml-auto">Searches titles, tags and the text inside every document</span>
      </div>
    </Modal>
  );
}
