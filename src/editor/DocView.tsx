import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import {
  ArchiveRestore,
  ChevronLeft,
  ChevronRight,
  ClipboardCopy,
  CopyPlus,
  Ellipsis,
  FileDown,
  FileText,
  FolderInput,
  Maximize2,
  Minimize2,
  PanelRight,
  Pin,
  PinOff,
  Presentation,
  Plus,
  Printer,
  Spool,
  StickyNote,
  Trash,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { MOD } from '../components/sidebar/Sidebar';
import { nextPostMenu } from '../components/itemMenus';
import { TopBar, type Crumb } from '../components/TopBar';
import { PlatformStack, SpaceGlyph, StatusPill } from '../components/ui/Badges';
import { Button, cx, IconButton } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { countChars, countWords, emptyDoc, formatDuration, spokenSeconds, toMarkdown, toPlainText } from '../lib/content';
import { formatDate, formatTime } from '../lib/dates';
import { IS_PREVIEW } from '../lib/env';
import { platformInfo } from '../lib/platforms';
import { SAVE_EVENT } from '../lib/events';
import { navigate, paths } from '../lib/router';
import { useMediaQuery } from '../lib/useMediaQuery';
import { folderChain } from '../lib/tree';
import type { Doc, ID, RichNode } from '../lib/types';
import { copyToClipboard, downloadFile, duplicateDoc, rememberLocation, safeFileName, trashItem } from '../state/actions';
import { openMenu, toast, type MenuItem } from '../state/feedback';
import { repo } from '../state/repo';
import { useSettings } from '../state/settings';
import { useUI } from '../state/ui';
import { threadOf, useWorkspace, type Workspace } from '../state/workspace';
import { DetailsPanel, type LiveStats } from './DetailsPanel';
import { buildExtensions } from './extensions';
import { LinkPopover } from './LinkPopover';
import { Teleprompter } from './Teleprompter';
import { Toolbar } from './Toolbar';

export default function DocView({ id }: { id: ID }) {
  const ws = useWorkspace();
  const doc = ws.docById.get(id);

  if (!doc || (!doc.deletedAt && !ws.spaceById.get(doc.spaceId))) {
    return (
      <>
        <TopBar crumbs={[{ label: 'Not found' }]} />
        <EmptyState
          title="This document doesn’t exist"
          body="It may have been deleted permanently, or the link is wrong."
          action={<Button onClick={() => navigate(paths.home())}>Go home</Button>}
        />
      </>
    );
  }
  if (doc.deletedAt) {
    return (
      <>
        <TopBar crumbs={[{ label: doc.title || 'Untitled' }]} />
        <EmptyState
          icon={<Trash size={26} />}
          title="This document is in the Trash"
          body="Restore it to keep editing."
          action={
            <div className="flex gap-2">
              <Button onClick={() => navigate(paths.trash())}>Open Trash</Button>
              <Button variant="primary" icon={<ArchiveRestore size={15} />} onClick={() => void repo.restore('doc', doc.id)}>
                Restore
              </Button>
            </div>
          }
        />
      </>
    );
  }
  return <DocLoader key={doc.id} doc={doc} ws={ws} />;
}

function crumbsFor(ws: Workspace, doc: Doc): Crumb[] {
  const space = ws.spaceById.get(doc.spaceId);
  const chain = folderChain(ws.folderById, doc.folderId);
  return [
    ...(space ? [{ label: space.name, href: paths.space(space.id), icon: <SpaceGlyph space={space} size="sm" /> }] : []),
    ...chain.map((f) => ({ label: f.name, href: paths.folder(f.id) })),
    { label: doc.title || 'Untitled' },
  ];
}

function DocLoader({ doc, ws }: { doc: Doc; ws: Workspace }) {
  const [initial, setInitial] = useState<RichNode | null>(null);

  useEffect(() => {
    let alive = true;
    repo.getContent(doc.id).then((c) => alive && setInitial(c?.json ?? emptyDoc()));
    return () => {
      alive = false;
    };
  }, [doc.id]);

  useEffect(() => {
    rememberLocation({ spaceId: doc.spaceId, folderId: doc.folderId });
  }, [doc.spaceId, doc.folderId]);

  if (!initial) {
    return (
      <>
        <TopBar crumbs={crumbsFor(ws, doc)} />
        <div className="mx-auto w-full max-w-[760px] px-6 pt-20">
          <div className="h-10 w-2/3 animate-pulse rounded-lg bg-hover" />
          <div className="mt-8 space-y-3">
            {[90, 75, 82, 60].map((w) => (
              <div key={w} className="h-4 animate-pulse rounded bg-hover" style={{ width: `${w}%` }} />
            ))}
          </div>
        </div>
      </>
    );
  }
  return <DocEditor doc={doc} ws={ws} initial={initial} />;
}

type SaveState = 'saved' | 'saving' | 'unsaved';

function computeStats(editor: Editor): Pick<LiveStats, 'words' | 'chars'> {
  const text = toPlainText(editor.getJSON());
  return { words: countWords(text), chars: countChars(text) };
}

function selectionStats(editor: Editor): Pick<LiveStats, 'selWords' | 'selChars'> {
  const { from, to, empty } = editor.state.selection;
  if (empty) return { selWords: 0, selChars: 0 };
  const text = editor.state.doc.textBetween(from, to, '\n', ' ');
  return { selWords: countWords(text), selChars: countChars(text) };
}

function DocEditor({ doc, ws, initial }: { doc: Doc; ws: Workspace; initial: RichNode }) {
  const detailsOpen = useUI((s) => s.detailsOpen);
  const focusMode = useUI((s) => s.focusMode);
  const setUI = useUI((s) => s.set);
  const wpm = useSettings((s) => s.wpm);

  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [stats, setStats] = useState<LiveStats>({ words: doc.wordCount, chars: doc.charCount, selWords: 0, selChars: 0 });
  const [linkAt, setLinkAt] = useState<{ left: number; top: number } | null>(null);
  const [prompterHtml, setPrompterHtml] = useState<string | null>(null);
  // Wide screens dock the panel (remembered); narrow screens overlay it on demand.
  const wide = useMediaQuery('(min-width: 1280px)');
  const [overlayDetails, setOverlayDetails] = useState(false);

  const docId = doc.id;
  const pending = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const statsTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const editorRef = useRef<Editor | null>(null);

  const flush = useCallback(async () => {
    clearTimeout(saveTimer.current);
    const editor = editorRef.current;
    if (!pending.current || !editor) return;
    pending.current = false;
    setSaveState('saving');
    try {
      await repo.saveContent(docId, editor.getJSON());
      setSaveState(pending.current ? 'unsaved' : 'saved');
    } catch (err) {
      console.error(err);
      pending.current = true;
      setSaveState('unsaved');
      toast('Couldn’t save — your browser storage may be full', { tone: 'error' });
    }
  }, [docId]);

  const openLinkAtSelection = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return false;
    const { from } = editor.state.selection;
    const coords = editor.view.coordsAtPos(from);
    setLinkAt({ left: coords.left, top: coords.bottom + 8 });
    return true;
  }, []);

  const handlers = useRef<{ onLink: () => boolean; onSave: () => boolean }>({ onLink: () => false, onSave: () => false });
  handlers.current = {
    onLink: () => {
      const editor = editorRef.current;
      // With nothing selected, ⌘K stays the global search shortcut.
      if (!editor || (editor.state.selection.empty && !editor.isActive('link'))) return false;
      return openLinkAtSelection();
    },
    onSave: () => {
      void flush();
      return true;
    },
  };

  const extensions = useMemo(
    () => buildExtensions({ onLink: () => handlers.current.onLink(), onSave: () => handlers.current.onSave() }),
    [],
  );

  const editor = useEditor({
    extensions,
    content: initial,
    immediatelyRender: true,
    shouldRerenderOnTransaction: false,
    editorProps: {
      attributes: { spellcheck: 'true', 'aria-label': 'Document body', class: 'ProseMirror' },
      // ⌘C gives one line per paragraph (ProseMirror's default doubles them),
      // so copied captions paste into social apps exactly as written.
      clipboardTextSerializer: (slice) => toPlainText({ type: 'doc', content: slice.content.toJSON() ?? [] }),
    },
    onUpdate: () => {
      pending.current = true;
      setSaveState('unsaved');
      clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => void flush(), 700);
      if (!statsTimer.current) {
        statsTimer.current = setTimeout(() => {
          statsTimer.current = undefined;
          if (editorRef.current) setStats((s) => ({ ...s, ...computeStats(editorRef.current!) }));
        }, 250);
      }
    },
    onSelectionUpdate: ({ editor: e }) => setStats((s) => ({ ...s, ...selectionStats(e) })),
  });
  editorRef.current = editor;

  // Accurate counts once the editor has parsed the content.
  useEffect(() => {
    if (editor) setStats((s) => ({ ...s, ...computeStats(editor) }));
  }, [editor]);

  // Save on leave, tab hide and explicit ⌘S from anywhere on the page.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') void flush();
    };
    const onSave = () => void flush();
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onSave);
    window.addEventListener(SAVE_EVENT, onSave);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onSave);
      window.removeEventListener(SAVE_EVENT, onSave);
      clearTimeout(statsTimer.current);
      void flush();
    };
  }, [flush]);

  // Leaving the page always exits focus mode.
  useEffect(() => () => useUI.getState().set({ focusMode: false }), []);

  const plainText = () => (editor ? toPlainText(editor.getJSON()) : '');

  // Downloads and printing are blocked inside the claude.ai preview frame.
  const fileItems: MenuItem[] = IS_PREVIEW
    ? []
    : [
        { type: 'separator' },
        {
          label: 'Download .md',
          icon: <FileDown size={15} />,
          onSelect: () => downloadFile(`${safeFileName(doc.title)}.md`, toMarkdown(editor?.getJSON(), doc, (id) => platformInfo(ws.platforms, id).name), 'text/markdown;charset=utf-8'),
        },
        {
          label: 'Download .txt',
          icon: <FileDown size={15} />,
          onSelect: () => downloadFile(`${safeFileName(doc.title)}.txt`, (doc.title ? doc.title + '\n\n' : '') + plainText() + '\n'),
        },
        { label: 'Print / Save as PDF', icon: <Printer size={15} />, onSelect: () => window.print() },
      ];

  const moreMenu = (): MenuItem[] => [
    { label: 'Copy as plain text', icon: <ClipboardCopy size={15} />, onSelect: () => void copyToClipboard(plainText(), 'Copied as plain text — ready to paste') },
    {
      label: 'Copy as Markdown',
      icon: <FileText size={15} />,
      onSelect: () => void copyToClipboard(toMarkdown(editor?.getJSON()), 'Copied as Markdown'),
    },
    ...fileItems,
    { type: 'separator' as const },
    {
      label: doc.pinned ? 'Unpin from Home' : 'Pin to Home',
      icon: doc.pinned ? <PinOff size={15} /> : <Pin size={15} />,
      onSelect: () => void repo.updateDoc(doc.id, { pinned: !doc.pinned }),
    },
    {
      label: 'Duplicate',
      icon: <CopyPlus size={15} />,
      onSelect: async () => {
        await flush();
        void duplicateDoc(doc.id);
      },
    },
    { label: 'Move to…', icon: <FolderInput size={15} />, onSelect: () => setUI({ moveItem: { kind: 'doc', id: doc.id } }) },
    { type: 'separator' as const },
    { label: 'Delete', icon: <Trash size={15} />, danger: true, onSelect: () => void trashItem('doc', doc.id, ws) },
  ];

  const openPrompter = async () => {
    if (!editor) return;
    await flush();
    if (!plainText().trim()) {
      toast('Write something first — the teleprompter reads this document');
      return;
    }
    setPrompterHtml(editor.getHTML());
  };

  const showDetails = !focusMode && (wide ? detailsOpen : overlayDetails);
  const setDetails = (open: boolean) => (wide ? setUI({ detailsOpen: open }) : setOverlayDetails(open));

  return (
    <div className="flex min-h-0 flex-1 print:block">
      <div className="relative flex min-w-0 flex-1 flex-col print:block">
        <TopBar
          crumbs={focusMode ? [] : crumbsFor(ws, doc)}
          actions={
            <>
              <IconButton label={focusMode ? 'Exit focus mode' : 'Focus mode'} shortcut={`${MOD} ⇧ F`} active={focusMode} onClick={() => setUI({ focusMode: !focusMode })}>
                {focusMode ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
              </IconButton>
              <IconButton label="Teleprompter" onClick={() => void openPrompter()}>
                <Presentation size={16} />
              </IconButton>
              <IconButton label="Copy as plain text" className="max-sm:hidden" onClick={() => void copyToClipboard(plainText(), 'Copied as plain text — ready to paste')}>
                <ClipboardCopy size={16} />
              </IconButton>
              <IconButton label="More" onClick={(e) => openMenu(e.currentTarget, moreMenu(), { align: 'end', minWidth: 220 })}>
                <Ellipsis size={16} />
              </IconButton>
              {!focusMode && (
                <IconButton label={showDetails ? 'Hide details' : 'Show details'} active={showDetails} onClick={() => setDetails(!showDetails)}>
                  <PanelRight size={16} />
                </IconButton>
              )}
            </>
          }
        />
        {editor && <Toolbar editor={editor} subtle={focusMode} onLink={(el) => {
          const r = el.getBoundingClientRect();
          setLinkAt({ left: r.left, top: r.bottom + 8 });
        }} />}
        <div
          data-print-scroll
          className="min-h-0 flex-1 overflow-y-auto canvas-glow print:overflow-visible"
          onMouseDown={(e) => {
            // Clicking the empty canvas below the text puts the caret at the end.
            if (e.target === e.currentTarget && editor) {
              e.preventDefault();
              editor.commands.focus('end');
            }
          }}
        >
          <div
            data-print-page
            className={cx(
              'mx-auto w-full px-5 pt-8 pb-16 sm:px-10 sm:pt-12',
              focusMode ? 'max-w-[760px]' : 'max-w-[860px] lg:mt-8 lg:mb-24 lg:rounded-[22px] lg:border lg:border-line lg:bg-raised lg:px-16 lg:pt-14 lg:shadow-card',
            )}
          >
            {!focusMode && <ThreadBar doc={doc} ws={ws} />}
            {!focusMode && <MetaChips doc={doc} ws={ws} onOpen={() => setDetails(true)} />}
            <TitleField doc={doc} editor={editor} />
            <div className="prose-editor mt-6" data-font={doc.font}>
              {editor && <EditorContent editor={editor} />}
            </div>
          </div>
        </div>
        <StatusBar stats={stats} wpm={wpm} save={saveState} />
      </div>

      {showDetails && (
        <>
          <div className="fixed inset-0 z-20 bg-black/40 xl:hidden" data-print-hide onClick={() => setDetails(false)} />
          <DetailsPanel doc={doc} ws={ws} stats={stats} onClose={() => setDetails(false)} />
        </>
      )}
      {linkAt && editor && <LinkPopover editor={editor} at={linkAt} onClose={() => setLinkAt(null)} />}
      {prompterHtml !== null && <Teleprompter title={doc.title} html={prompterHtml} onClose={() => setPrompterHtml(null)} />}
    </div>
  );
}

/** Shown on posts inside a thread: where this post sits, with previous/next. */
function ThreadBar({ doc, ws }: { doc: Doc; ws: Workspace }) {
  const place = threadOf(ws, doc);
  if (!place) return null;
  const { thread, posts, index } = place;
  const prev = posts[index - 1];
  const next = posts[index + 1];
  return (
    <div data-print-hide className="mb-5 flex flex-wrap items-center gap-x-2 gap-y-2 rounded-xl border border-line bg-sunken py-1.5 pr-1.5 pl-3 text-[12.5px]">
      <Spool size={14} className="shrink-0 text-fg-3" />
      <a href={paths.folder(thread.id)} className="min-w-0 truncate font-medium text-fg hover:underline">
        {thread.name}
      </a>
      <span className="shrink-0 text-fg-4 tabular-nums">
        · Post {index + 1} of {posts.length}
      </span>
      <span className="flex-1" />
      <IconButton label="Go to previous post" size="sm" disabled={!prev} onClick={() => prev && navigate(paths.doc(prev.id))}>
        <ChevronLeft size={15} />
      </IconButton>
      <IconButton label="Go to next post" size="sm" disabled={!next} onClick={() => next && navigate(paths.doc(next.id))}>
        <ChevronRight size={15} />
      </IconButton>
      <Button size="sm" icon={<Plus size={14} />} onClick={(e) => openMenu(e.currentTarget, nextPostMenu(ws, doc), { align: 'end' })}>
        Add post
      </Button>
    </div>
  );
}

function MetaChips({ doc, ws, onOpen }: { doc: Doc; ws: Workspace; onOpen: () => void }) {
  const chip = 'inline-flex h-7 items-center gap-1.5 rounded-full border border-line px-2.5 text-[12px] text-fg-3 transition-colors hover:border-line-strong hover:text-fg';
  return (
    <div className="mb-5 flex flex-wrap items-center gap-1.5" data-print-hide>
      {doc.kind === 'content' ? (
        <button onClick={onOpen} className="rounded-full">
          <StatusPill status={doc.status} />
        </button>
      ) : (
        <button onClick={onOpen} className={chip}>
          <StickyNote size={12} /> Note
        </button>
      )}
      {doc.kind === 'content' && doc.platforms.length > 0 && (
        <button onClick={onOpen} className={chip}>
          <PlatformStack platforms={doc.platforms} size={12} max={7} className="text-current" />
        </button>
      )}
      {doc.kind === 'content' && doc.publishDate && (
        <button onClick={onOpen} className={chip}>
          {formatDate(doc.publishDate, { weekday: true })}
          {doc.publishTime && ` · ${formatTime(doc.publishTime)}`}
        </button>
      )}
      {doc.tags.slice(0, 4).map((t) => (
        <button key={t} onClick={onOpen} className={chip}>
          #{t}
        </button>
      ))}
      {doc.kind === 'content' && !doc.platforms.length && !doc.publishDate && (
        <button onClick={onOpen} className={cx(chip, 'border-dashed')}>
          Add platforms & date
        </button>
      )}
      {doc.kind === 'content' && !threadOf(ws, doc) && (
        <button
          onClick={(e) => openMenu(e.currentTarget, nextPostMenu(ws, doc))}
          className={cx(chip, 'border-dashed')}
          data-tip="Add or connect a post after this one"
        >
          <Spool size={12} /> Start a thread
        </button>
      )}
    </div>
  );
}

/**
 * Moves the caret from the title into the body. Enter lands on the first
 * writable line: past leading headings (templates) into an empty paragraph,
 * or a fresh line at the top when the body already starts with text.
 */
function focusBodyFromTitle(editor: Editor, fromEnter: boolean) {
  // Focus synchronously — TipTap's focus command waits a frame, and keys
  // typed right after Enter must land in the body.
  editor.view.focus();
  if (!fromEnter) {
    editor.commands.focus('start');
    return;
  }
  const { doc } = editor.state;
  let pos = 0;
  for (let i = 0; i < doc.childCount; i++) {
    const node = doc.child(i);
    if (node.type.name === 'heading' || node.type.name === 'horizontalRule') {
      pos += node.nodeSize;
      continue;
    }
    if (node.type.name === 'paragraph' && node.content.size === 0) {
      editor.commands.focus(pos + 1);
      return;
    }
    break;
  }
  editor.chain().insertContentAt(0, { type: 'paragraph' }).focus(1).run();
}

function TitleField({ doc, editor }: { doc: Doc; editor: Editor | null }) {
  const [value, setValue] = useState(doc.title);
  const focused = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const latest = useRef(doc.title);
  const ref = useRef<HTMLTextAreaElement>(null);
  const docId = doc.id;

  useEffect(() => {
    if (!focused.current) {
      setValue(doc.title);
      latest.current = doc.title;
    }
  }, [doc.title]);

  // Auto-grow.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = `${el.scrollHeight}px`;
  }, [value, doc.font]);

  // New, empty docs start with the cursor in the title.
  useEffect(() => {
    if (!doc.title && ref.current) ref.current.focus();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const commit = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = undefined;
    void repo.updateDoc(docId, { title: latest.current.trim() });
  }, [docId]);

  useEffect(
    () => () => {
      if (timer.current) commit();
    },
    [commit],
  );

  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      placeholder="Untitled"
      aria-label="Title"
      data-font={doc.font}
      className="doc-title block w-full resize-none overflow-hidden bg-transparent text-fg outline-none placeholder:text-fg-4"
      style={{ minHeight: '1.15em' } as CSSProperties}
      onFocus={() => (focused.current = true)}
      onBlur={() => {
        focused.current = false;
        if (timer.current) commit();
      }}
      onChange={(e) => {
        const next = e.target.value.replace(/\n/g, ' ');
        setValue(next);
        latest.current = next;
        clearTimeout(timer.current);
        timer.current = setTimeout(commit, 400);
      }}
      onKeyDown={(e) => {
        const atEnd = e.currentTarget.selectionStart === e.currentTarget.value.length;
        if (e.key === 'Enter' || (e.key === 'ArrowDown' && atEnd)) {
          e.preventDefault();
          if (editor) focusBodyFromTitle(editor, e.key === 'Enter');
        }
      }}
    />
  );
}

function StatusBar({ stats, wpm, save }: { stats: LiveStats; wpm: number; save: SaveState }) {
  const selected = stats.selChars > 0;
  const words = selected ? stats.selWords : stats.words;
  const label = save === 'saved' ? 'Saved on this device' : save === 'saving' ? 'Saving…' : 'Editing';
  return (
    <div data-print-hide className="flex h-8 shrink-0 items-center gap-3 border-t border-line px-4 text-[11.5px] text-fg-4 tabular-nums">
      <span className="flex items-center gap-1.5" aria-live="polite">
        <span className={cx('h-1.5 w-1.5 rounded-full transition-colors', save === 'saved' ? 'bg-[var(--st-posted)]' : 'bg-[var(--st-drafting)]')} />
        {label}
      </span>
      <span className="flex-1" />
      {selected && <span className="font-medium text-fg-2">Selection</span>}
      <span>
        <span className="text-fg-2">{words.toLocaleString()}</span> words
      </span>
      <span className="max-sm:hidden">
        <span className="text-fg-2">{(selected ? stats.selChars : stats.chars).toLocaleString()}</span> characters
      </span>
      <span data-tip={`At ${wpm} words per minute — change it in Settings`}>
        <span className="text-fg-2">{formatDuration(spokenSeconds(words, wpm))}</span> spoken
      </span>
    </div>
  );
}

