import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowDown, ArrowUp, ClipboardCopy, Ellipsis, Plus, Spool } from 'lucide-react';
import { useEffect } from 'react';
import { folderMenu, docMenu } from '../components/itemMenus';
import { PageHeader, TopBar, type Crumb } from '../components/TopBar';
import { PlatformStack, SpaceGlyph, StatusPill } from '../components/ui/Badges';
import { Button, cx, IconButton } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { platformInfo } from '../lib/platforms';
import { paths } from '../lib/router';
import { folderChain } from '../lib/tree';
import type { Doc, Folder, Space } from '../lib/types';
import { addNextPost, appendPost, copyThread, rememberLocation } from '../state/actions';
import { openMenu } from '../state/feedback';
import { db, repo } from '../state/repo';
import { useWorkspace, type Workspace } from '../state/workspace';

/** A thread: its posts in order, each with its full text and length check. */
export function ThreadView({ thread, space }: { thread: Folder; space: Space }) {
  const ws = useWorkspace();
  const posts = ws.docsIn.get(thread.id) ?? [];
  const ids = posts.map((p) => p.id);
  const texts = useLiveQuery(() => db.texts.bulkGet(ids), [ids.join('|')]);

  // New documents from elsewhere go next to the thread, not into it.
  useEffect(() => {
    rememberLocation({ spaceId: thread.spaceId, folderId: thread.parentId });
  }, [thread.spaceId, thread.parentId]);

  const crumbs: Crumb[] = [
    { label: space.name, href: paths.space(space.id), icon: <SpaceGlyph space={space} size="sm" /> },
    ...folderChain(ws.folderById, thread.parentId).map((f) => ({ label: f.name, href: paths.folder(f.id) })),
    { label: thread.name, icon: <Spool size={14} /> },
  ];
  const totalChars = posts.reduce((n, p) => n + p.charCount, 0);

  return (
    <>
      <TopBar
        crumbs={crumbs}
        actions={
          <IconButton label="More" onClick={(e) => openMenu(e.currentTarget, folderMenu(ws, thread), { align: 'end' })}>
            <Ellipsis size={16} />
          </IconButton>
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto canvas-glow">
        <div className="mx-auto w-full max-w-[780px] px-4 pt-8 pb-24 sm:px-8">
          <PageHeader
            eyebrow="Thread"
            title={thread.name}
            meta={`${posts.length} post${posts.length === 1 ? '' : 's'} · ${totalChars.toLocaleString()} characters`}
            icon={
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] border border-line-strong bg-raised text-fg">
                <Spool size={22} />
              </span>
            }
            actions={
              <>
                <Button icon={<ClipboardCopy size={15} />} onClick={() => void copyThread(thread.id, ws)}>
                  Copy whole thread
                </Button>
                <Button variant="primary" icon={<Plus size={15} />} onClick={() => void appendPost(thread.id, ws)}>
                  Add post
                </Button>
              </>
            }
          />
          {posts.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-line-strong">
              <EmptyState compact title="This thread has no posts" body="Add the first post, or connect existing posts from their menu." />
            </div>
          ) : (
            <ol aria-label="Posts in this thread">
              {posts.map((doc, i) => (
                <ThreadPost key={doc.id} doc={doc} index={i} total={posts.length} text={texts?.[i]?.text ?? ''} ws={ws} />
              ))}
            </ol>
          )}
        </div>
      </div>
    </>
  );
}

function ThreadPost({ doc, index, total, text, ws }: { doc: Doc; index: number; total: number; text: string; ws: Workspace }) {
  // Check the length against the strictest limit among the post's platforms.
  const strictest = doc.platforms
    .map((id) => platformInfo(ws.platforms, id))
    .filter((p) => p.limit !== null)
    .sort((a, b) => a.limit! - b.limit!)[0];
  const over = !!strictest && doc.charCount > strictest.limit!;

  return (
    <li className="flex gap-4">
      <div className="flex flex-col items-center" aria-hidden>
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line-strong bg-raised text-[12px] font-semibold text-fg tabular-nums">
          {index + 1}
        </span>
        {index < total - 1 && <span className="my-1 w-px flex-1 bg-line-strong" />}
      </div>
      <article className="mb-4 min-w-0 flex-1 rounded-2xl border border-line bg-raised p-4 shadow-card">
        <div className="flex flex-wrap items-center gap-2">
          <a href={paths.doc(doc.id)} className={cx('min-w-0 flex-1 truncate text-[14px] font-semibold hover:underline', doc.title ? 'text-fg' : 'text-fg-3')}>
            {doc.title || `Post ${index + 1}`}
          </a>
          {doc.kind === 'content' && <StatusPill status={doc.status} size="sm" />}
          <PlatformStack platforms={doc.platforms} size={12} />
        </div>
        <a href={paths.doc(doc.id)} className="mt-2 block">
          {text.trim() ? (
            <p className="line-clamp-10 text-[13.5px] leading-relaxed whitespace-pre-wrap text-fg-2">{text}</p>
          ) : (
            <p className="text-[13px] text-fg-4">Empty post — click to write it.</p>
          )}
        </a>
        <div className="mt-3 flex items-center gap-1 text-[12px] text-fg-4">
          <span className={cx('tabular-nums', over && 'font-semibold text-danger')}>
            {strictest
              ? `${doc.charCount.toLocaleString()} / ${strictest.limit!.toLocaleString()} · ${strictest.name}`
              : `${doc.charCount.toLocaleString()} characters`}
          </span>
          <span className="flex-1" />
          <IconButton label="Move up" size="xs" disabled={index === 0} onClick={() => void repo.movePost(doc.id, -1)}>
            <ArrowUp size={14} />
          </IconButton>
          <IconButton label="Move down" size="xs" disabled={index === total - 1} onClick={() => void repo.movePost(doc.id, 1)}>
            <ArrowDown size={14} />
          </IconButton>
          <IconButton label="Add a post after this" size="xs" onClick={() => void addNextPost(doc.id, ws)}>
            <Plus size={14} />
          </IconButton>
          <IconButton label="More" size="xs" onClick={(e) => openMenu(e.currentTarget, docMenu(ws, doc), { align: 'end' })}>
            <Ellipsis size={14} />
          </IconButton>
        </div>
      </article>
    </li>
  );
}
