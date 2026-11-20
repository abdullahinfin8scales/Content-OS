import { useLiveQuery } from 'dexie-react-hooks';
import { Ellipsis, Pin, PinOff, Plus, StickyNote, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { PageHeader, TopBar } from '../../components/TopBar';
import { Button, cx, IconButton } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { formatRelative } from '../../lib/dates';
import { navigate, paths } from '../../lib/router';
import { openMenu } from '../../state/feedback';
import { deleteNoteWithConfirm, newNote, usePersonalLists } from '../../state/personal';
import { db, personal } from '../../state/repo';
import { DeleteButton, Page } from './parts';
import { RichNote } from './RichNote';

export function NotesView() {
  const lists = usePersonalLists();
  const notes = lists?.notes;
  return (
    <>
      <TopBar crumbs={[{ label: 'Notes', icon: <StickyNote size={14} /> }]} />
      <Page>
        <PageHeader
          eyebrow="Your space"
          title="Notes"
          meta={notes?.length ? `${notes.length} note${notes.length === 1 ? '' : 's'}` : undefined}
          actions={
            <Button variant="primary" icon={<Plus size={15} />} onClick={() => void newNote()}>
              New note
            </Button>
          }
        />
        {notes && notes.length === 0 ? (
          <EmptyState compact icon={<StickyNote size={26} />} title="No notes yet" body="Ideas, plans, lists — anything that isn’t tied to a day." />
        ) : (
          <div className="divide-y divide-line border-y border-line">
            {notes?.map((n) => (
              <div key={n.id} className="group relative flex items-start gap-3 px-1 py-4 transition-colors hover:bg-hover">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    {n.pinned && <Pin size={12} className="shrink-0 text-fg-3" />}
                    {/* The title link stretches over the whole row; the trash button sits above it. */}
                    <a
                      href={paths.note(n.id)}
                      className={cx('truncate text-[14.5px] font-medium outline-none after:absolute after:inset-0 focus-visible:after:outline-2 focus-visible:after:outline-[var(--ring)]', n.title ? 'text-fg' : 'text-fg-3')}
                    >
                      {n.title || 'Untitled'}
                    </a>
                  </div>
                  {n.excerpt && <p className="mt-1 line-clamp-2 text-[13.5px] leading-relaxed text-fg-3">{n.excerpt}</p>}
                </div>
                <span className="shrink-0 pt-0.5 text-[12px] text-fg-3">{formatRelative(n.updatedAt)}</span>
                <DeleteButton label={`Delete note “${n.title || 'Untitled'}”`} className="-mt-1" onClick={() => void deleteNoteWithConfirm(n, false)} />
              </div>
            ))}
          </div>
        )}
      </Page>
    </>
  );
}

export function NoteView({ id }: { id: string }) {
  const note = useLiveQuery(async () => (await db.notes.get(id)) ?? null, [id]);
  // The editor takes the content once; later saves don't re-seed it.
  const [initial, setInitial] = useState<typeof note>(undefined);
  useEffect(() => {
    if (note !== undefined && initial === undefined) setInitial(note);
  }, [note, initial]);

  if (note === undefined || initial === undefined) return <TopBar crumbs={[{ label: 'Notes', href: paths.notes() }]} />;
  if (!note || !initial) {
    return (
      <>
        <TopBar crumbs={[{ label: 'Notes', href: paths.notes() }, { label: 'Not found' }]} />
        <EmptyState title="This note doesn’t exist" body="It may have been deleted." action={<Button onClick={() => navigate(paths.notes())}>All notes</Button>} />
      </>
    );
  }

  return (
    <>
      <TopBar
        crumbs={[{ label: 'Notes', href: paths.notes(), icon: <StickyNote size={14} /> }, { label: note.title || 'Untitled' }]}
        actions={
          <>
            <DeleteButton label="Delete note" size="md" onClick={() => void deleteNoteWithConfirm(note, true)} />
            <IconButton label={note.pinned ? 'Unpin' : 'Pin to top'} active={note.pinned} onClick={() => void personal.updateNote(note.id, { pinned: !note.pinned })}>
              {note.pinned ? <PinOff size={16} /> : <Pin size={16} />}
            </IconButton>
            <IconButton
              label="Note options"
              onClick={(e) =>
                openMenu(
                  e.currentTarget,
                  [
                    {
                      label: 'Delete note',
                      icon: <Trash2 size={14} />,
                      danger: true,
                      onSelect: () => void deleteNoteWithConfirm(note, true),
                    },
                  ],
                  { align: 'end', minWidth: 180 },
                )
              }
            >
              <Ellipsis size={16} />
            </IconButton>
          </>
        }
      />
      <RichNote
        key={note.id}
        page
        initial={initial.json}
        onSave={(json) => personal.saveNoteContent(note.id, json)}
        placeholder="Write anything…"
        label="Note"
        header={<NoteTitle id={note.id} title={initial.title} />}
      />
    </>
  );
}

function NoteTitle({ id, title: start }: { id: string; title: string }) {
  const [title, setTitle] = useState(start);
  const timer = useState<{ t?: ReturnType<typeof setTimeout> }>({})[0];
  const save = (value: string) => {
    clearTimeout(timer.t);
    timer.t = setTimeout(() => void personal.updateNote(id, { title: value }), 400);
  };
  return (
    <input
      autoFocus={!start}
      value={title}
      onChange={(e) => {
        setTitle(e.target.value);
        save(e.target.value);
      }}
      onBlur={() => {
        clearTimeout(timer.t);
        void personal.updateNote(id, { title });
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          (document.querySelector('.prose-editor .ProseMirror') as HTMLElement | null)?.focus();
        }
      }}
      placeholder="Untitled"
      className="doc-title mb-5 w-full bg-transparent text-fg outline-none placeholder:text-fg-4"
      aria-label="Note title"
    />
  );
}
