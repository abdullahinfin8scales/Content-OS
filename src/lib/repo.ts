import type { ContentDB } from './db';
import { countChars, countWords, emptyDoc, makeExcerpt, toPlainText } from './content';
import { todayISO } from './dates';
import { uid } from './ids';
import { getTemplate } from './templates';
import { canNestFolder, descendantFolderIds } from './tree';
import { CUSTOM_PLATFORM_PREFIX } from './platforms';
import type {
  CustomPlatform,
  Doc,
  DocFont,
  DocKind,
  DocPatch,
  Folder,
  ID,
  ItemKind,
  Platform,
  PlatformIconData,
  RichNode,
  Space,
  SpaceColor,
  Status,
} from './types';

export class RepoError extends Error {}

export interface NewDocInput {
  spaceId: ID;
  folderId?: ID | null;
  title?: string;
  content?: RichNode;
  kind?: DocKind;
  status?: Status;
  platforms?: Platform[];
  publishDate?: string | null;
  tags?: string[];
  pinned?: boolean;
  font?: DocFont;
}

const byOrder = (a: Space, b: Space) => a.order - b.order;

/** Thread order: by position, then creation time for posts without one. */
export function byThreadOrder(a: Doc, b: Doc): number {
  return (a.position ?? Number.MAX_SAFE_INTEGER) - (b.position ?? Number.MAX_SAFE_INTEGER) || a.createdAt - b.createdAt;
}

function cleanLimit(limit: number | null | undefined): number | null {
  return typeof limit === 'number' && Number.isFinite(limit) && limit > 0 ? Math.round(limit) : null;
}

function derived(json: RichNode) {
  const text = toPlainText(json);
  // Card excerpts skip headings — template section titles would repeat on every card.
  const excerpt = makeExcerpt(toPlainText(json, { headings: false })) || makeExcerpt(text);
  return { text, excerpt, wordCount: countWords(text), charCount: countChars(text) };
}

/**
 * Every write the app makes goes through here, so the rules (cascading trash,
 * no folder cycles, cross-space moves) live in one tested place.
 */
export class Repo {
  constructor(readonly db: ContentDB) {}

  /* ----------------------------- Spaces ----------------------------- */

  async createSpace(input: { name: string; icon?: string; color?: SpaceColor }): Promise<Space> {
    return this.db.transaction('rw', this.db.spaces, async () => {
      const spaces = await this.db.spaces.toArray();
      const t = Date.now();
      const space: Space = {
        id: uid(),
        name: input.name.trim() || 'Untitled space',
        icon: input.icon ?? 'sparkles',
        color: input.color ?? 'white',
        order: spaces.reduce((max, s) => Math.max(max, s.order), -1) + 1,
        createdAt: t,
        updatedAt: t,
        deletedAt: null,
        trashRootId: null,
      };
      await this.db.spaces.add(space);
      return space;
    });
  }

  async updateSpace(id: ID, patch: Partial<Pick<Space, 'name' | 'icon' | 'color'>>): Promise<void> {
    const clean = { ...patch };
    if (clean.name !== undefined) clean.name = clean.name.trim() || 'Untitled space';
    await this.db.spaces.update(id, { ...clean, updatedAt: Date.now() });
  }

  /** Moves a space one step up (-1) or down (+1) in the sidebar. */
  async reorderSpace(id: ID, direction: -1 | 1): Promise<void> {
    await this.db.transaction('rw', this.db.spaces, async () => {
      const list = (await this.db.spaces.toArray()).filter((s) => !s.deletedAt).sort(byOrder);
      const i = list.findIndex((s) => s.id === id);
      const j = i + direction;
      if (i < 0 || j < 0 || j >= list.length) return;
      [list[i], list[j]] = [list[j], list[i]];
      list.forEach((s, k) => (s.order = k));
      await this.db.spaces.bulkPut(list);
    });
  }

  /* ----------------------------- Folders ---------------------------- */

  async createFolder(input: { spaceId: ID; parentId?: ID | null; name?: string }): Promise<Folder> {
    return this.db.transaction('rw', this.db.spaces, this.db.folders, async () => {
      const space = await this.db.spaces.get(input.spaceId);
      if (!space || space.deletedAt) throw new RepoError('Space not found');
      let parentId = input.parentId ?? null;
      if (parentId) {
        const parent = await this.db.folders.get(parentId);
        if (!parent || parent.deletedAt || parent.spaceId !== space.id) parentId = null;
        else if (parent.kind === 'thread') throw new RepoError('A thread holds posts only — add the folder next to it instead.');
      }
      const t = Date.now();
      const folder: Folder = {
        id: uid(),
        spaceId: space.id,
        parentId,
        name: input.name?.trim() || 'New folder',
        createdAt: t,
        updatedAt: t,
        deletedAt: null,
        trashRootId: null,
      };
      await this.db.folders.add(folder);
      return folder;
    });
  }

  async renameFolder(id: ID, name: string): Promise<void> {
    await this.db.folders.update(id, { name: name.trim() || 'Untitled folder', updatedAt: Date.now() });
  }

  /** Re-parents a folder; moving across spaces carries every nested folder and doc along. */
  async moveFolder(id: ID, target: { spaceId: ID; parentId: ID | null }): Promise<void> {
    await this.db.transaction('rw', this.db.spaces, this.db.folders, this.db.docs, async () => {
      const folder = await this.db.folders.get(id);
      if (!folder || folder.deletedAt) throw new RepoError('Folder not found');
      let spaceId = target.spaceId;
      const parentId = target.parentId;
      if (parentId) {
        const parent = await this.db.folders.get(parentId);
        if (!parent || parent.deletedAt) throw new RepoError('Destination folder not found');
        if (parent.kind === 'thread') throw new RepoError('Folders can’t go inside a thread.');
        spaceId = parent.spaceId;
      }
      const space = await this.db.spaces.get(spaceId);
      if (!space || space.deletedAt) throw new RepoError('Destination space not found');

      const folders = await this.db.folders.toArray();
      if (!canNestFolder(folders, id, parentId)) throw new RepoError('A folder can’t be moved into itself.');
      if (folder.parentId === parentId && folder.spaceId === spaceId) return;

      const t = Date.now();
      await this.db.folders.update(id, { parentId, spaceId, updatedAt: t });
      if (folder.spaceId !== spaceId) {
        const nested = descendantFolderIds(folders, id);
        await Promise.all([...nested].map((fid) => this.db.folders.update(fid, { spaceId })));
        const affected = new Set([id, ...nested]);
        const docs = await this.db.docs.where('folderId').anyOf([...affected]).toArray();
        await Promise.all(docs.map((d) => this.db.docs.update(d.id, { spaceId })));
      }
    });
  }

  /* ------------------------------ Docs ------------------------------ */

  async createDoc(input: NewDocInput): Promise<Doc> {
    return this.db.transaction('rw', [this.db.spaces, this.db.folders, this.db.docs, this.db.contents, this.db.texts], async () => {
      const space = await this.db.spaces.get(input.spaceId);
      if (!space || space.deletedAt) throw new RepoError('Space not found');
      let folderId = input.folderId ?? null;
      let position: number | undefined;
      if (folderId) {
        const folder = await this.db.folders.get(folderId);
        if (!folder || folder.deletedAt || folder.spaceId !== space.id) folderId = null;
        else if (folder.kind === 'thread') position = await this.nextPosition(folder.id);
      }
      const json = input.content ?? emptyDoc();
      const { text, excerpt, wordCount, charCount } = derived(json);
      const t = Date.now();
      const doc: Doc = {
        id: uid(),
        spaceId: space.id,
        folderId,
        title: input.title ?? '',
        kind: input.kind ?? 'content',
        status: input.status ?? 'drafting',
        platforms: input.platforms ?? [],
        publishDate: input.publishDate ?? null,
        publishTime: null,
        postUrl: '',
        tags: input.tags ?? [],
        metrics: {},
        pinned: input.pinned ?? false,
        font: input.font ?? 'sans',
        excerpt,
        wordCount,
        charCount,
        ...(position !== undefined ? { position } : {}),
        createdAt: t,
        updatedAt: t,
        deletedAt: null,
        trashRootId: null,
      };
      await this.db.docs.add(doc);
      await this.db.contents.put({ id: doc.id, json });
      await this.db.texts.put({ id: doc.id, text });
      return doc;
    });
  }

  async createFromTemplate(templateId: string, location: { spaceId: ID; folderId?: ID | null }, overrides: Partial<NewDocInput> = {}): Promise<Doc> {
    const template = getTemplate(templateId);
    return this.createDoc({
      spaceId: location.spaceId,
      folderId: location.folderId ?? null,
      title: template.title,
      content: template.build(),
      kind: template.kind,
      status: template.status,
      platforms: [...template.platforms],
      publishDate: template.datedToday ? todayISO() : null,
      ...overrides,
    });
  }

  async updateDoc(id: ID, patch: DocPatch): Promise<void> {
    const clean: DocPatch = { ...patch };
    if (clean.tags) clean.tags = [...new Set(clean.tags.map((t) => t.trim()).filter(Boolean))];
    if (clean.platforms) clean.platforms = [...new Set(clean.platforms)];
    await this.db.docs.update(id, { ...clean, updatedAt: Date.now() });
  }

  /** Persists editor content and refreshes the derived excerpt/counts. */
  async saveContent(id: ID, json: RichNode): Promise<void> {
    const { text, excerpt, wordCount, charCount } = derived(json);
    await this.db.transaction('rw', this.db.docs, this.db.contents, this.db.texts, async () => {
      const doc = await this.db.docs.get(id);
      if (!doc) return;
      await this.db.contents.put({ id, json });
      await this.db.texts.put({ id, text });
      await this.db.docs.update(id, { excerpt, wordCount, charCount, updatedAt: Date.now() });
    });
  }

  getContent(id: ID) {
    return this.db.contents.get(id);
  }

  async moveDoc(id: ID, target: { spaceId: ID; folderId: ID | null }): Promise<void> {
    await this.db.transaction('rw', this.db.spaces, this.db.folders, this.db.docs, async () => {
      const doc = await this.db.docs.get(id);
      if (!doc || doc.deletedAt) throw new RepoError('Document not found');
      let spaceId = target.spaceId;
      const folderId = target.folderId;
      let intoThread = false;
      if (folderId) {
        const folder = await this.db.folders.get(folderId);
        if (!folder || folder.deletedAt) throw new RepoError('Destination folder not found');
        spaceId = folder.spaceId;
        intoThread = folder.kind === 'thread';
      }
      const space = await this.db.spaces.get(spaceId);
      if (!space || space.deletedAt) throw new RepoError('Destination space not found');
      if (doc.spaceId === spaceId && doc.folderId === folderId) return;
      const position = intoThread ? await this.nextPosition(folderId!) : undefined;
      await this.db.docs.update(id, { spaceId, folderId, position, updatedAt: Date.now() });
    });
  }

  /* ----------------------------- Threads ---------------------------- */

  /** Posts of a thread, in order. */
  async threadPosts(threadId: ID): Promise<Doc[]> {
    const docs = await this.db.docs.where('folderId').equals(threadId).toArray();
    return docs.filter((d) => !d.deletedAt).sort(byThreadOrder);
  }

  private async nextPosition(threadId: ID): Promise<number> {
    const posts = await this.threadPosts(threadId);
    return posts.reduce((max, d) => Math.max(max, d.position ?? -1), -1) + 1;
  }

  private async writeOrder(posts: Doc[]) {
    await Promise.all(posts.map((d, i) => (d.position === i ? null : this.db.docs.update(d.id, { position: i }))));
  }

  /**
   * Makes a post the first of a new thread: a thread container is created where
   * the post is and the post moves into it. Returns the existing thread if the
   * post already belongs to one.
   */
  async ensureThread(docId: ID): Promise<Folder> {
    return this.db.transaction('rw', this.db.spaces, this.db.folders, this.db.docs, async () => {
      const doc = await this.db.docs.get(docId);
      if (!doc || doc.deletedAt) throw new RepoError('Document not found');
      if (doc.folderId) {
        const current = await this.db.folders.get(doc.folderId);
        if (current?.kind === 'thread' && !current.deletedAt) return current;
      }
      const t = Date.now();
      const thread: Folder = {
        id: uid(),
        spaceId: doc.spaceId,
        parentId: doc.folderId,
        name: doc.title.trim() || 'Untitled thread',
        kind: 'thread',
        createdAt: t,
        updatedAt: t,
        deletedAt: null,
        trashRootId: null,
      };
      await this.db.folders.add(thread);
      await this.db.docs.update(docId, { folderId: thread.id, position: 0, updatedAt: t });
      return thread;
    });
  }

  /** Places `docId` right after `afterId` in the thread and renumbers the posts. */
  private async placeAfter(threadId: ID, afterId: ID, docId: ID) {
    const posts = (await this.threadPosts(threadId)).filter((d) => d.id !== docId);
    const moving = await this.db.docs.get(docId);
    if (!moving) return;
    const index = posts.findIndex((d) => d.id === afterId);
    posts.splice(index < 0 ? posts.length : index + 1, 0, moving);
    await this.writeOrder(posts);
  }

  /** Creates a new post right after `afterId`, starting a thread if needed. */
  async addPostAfter(afterId: ID): Promise<Doc> {
    const thread = await this.ensureThread(afterId);
    const after = (await this.db.docs.get(afterId))!;
    const status = after.status === 'posted' ? 'drafting' : after.status;
    const doc = await this.createDoc({
      spaceId: thread.spaceId,
      folderId: thread.id,
      kind: after.kind,
      status,
      platforms: [...after.platforms],
      tags: [...after.tags],
      font: after.font,
      publishDate: status === 'scheduled' ? after.publishDate : null,
    });
    await this.db.transaction('rw', this.db.docs, () => this.placeAfter(thread.id, afterId, doc.id));
    return (await this.db.docs.get(doc.id))!;
  }

  /** Connects an existing post so it follows `afterId`, starting a thread if needed. */
  async connectAfter(afterId: ID, docId: ID): Promise<void> {
    if (afterId === docId) throw new RepoError('A post can’t follow itself.');
    const doc = await this.db.docs.get(docId);
    if (!doc || doc.deletedAt) throw new RepoError('Document not found');
    const thread = await this.ensureThread(afterId);
    await this.db.transaction('rw', this.db.docs, async () => {
      if (doc.folderId !== thread.id) {
        await this.db.docs.update(docId, { spaceId: thread.spaceId, folderId: thread.id, updatedAt: Date.now() });
      }
      await this.placeAfter(thread.id, afterId, docId);
    });
  }

  /** Moves a post one place earlier (-1) or later (+1) in its thread. */
  async movePost(docId: ID, direction: -1 | 1): Promise<void> {
    await this.db.transaction('rw', this.db.folders, this.db.docs, async () => {
      const doc = await this.db.docs.get(docId);
      if (!doc?.folderId) return;
      const posts = await this.threadPosts(doc.folderId);
      const i = posts.findIndex((d) => d.id === docId);
      const j = i + direction;
      if (i < 0 || j < 0 || j >= posts.length) return;
      [posts[i], posts[j]] = [posts[j], posts[i]];
      await this.writeOrder(posts);
    });
  }

  /** Takes a post out of its thread and puts it where the thread lives. */
  async detachPost(docId: ID): Promise<void> {
    await this.db.transaction('rw', this.db.folders, this.db.docs, async () => {
      const doc = await this.db.docs.get(docId);
      if (!doc?.folderId) return;
      const thread = await this.db.folders.get(doc.folderId);
      if (thread?.kind !== 'thread') return;
      await this.db.docs.update(docId, { spaceId: thread.spaceId, folderId: thread.parentId, position: undefined, updatedAt: Date.now() });
      await this.writeOrder(await this.threadPosts(thread.id));
    });
  }

  /* ----------------------------- Platforms ---------------------------- */

  async createPlatform(input: { name: string; url: string; domain: string; icon: PlatformIconData; limit: number | null }): Promise<CustomPlatform> {
    const t = Date.now();
    const platform: CustomPlatform = {
      id: CUSTOM_PLATFORM_PREFIX + uid(),
      name: input.name.trim() || input.domain || 'Platform',
      url: input.url.trim(),
      domain: input.domain.trim(),
      icon: input.icon,
      limit: cleanLimit(input.limit),
      createdAt: t,
      updatedAt: t,
    };
    await this.db.platforms.add(platform);
    return platform;
  }

  async updatePlatform(id: ID, patch: Partial<Pick<CustomPlatform, 'name' | 'limit'>>): Promise<void> {
    const clean: Partial<CustomPlatform> = { updatedAt: Date.now() };
    if (patch.name !== undefined) clean.name = patch.name.trim() || 'Platform';
    if (patch.limit !== undefined) clean.limit = cleanLimit(patch.limit);
    await this.db.platforms.update(id, clean);
  }

  /** Deletes a custom platform and takes it off every document. Returns how many documents changed. */
  async deletePlatform(id: ID): Promise<number> {
    return this.db.transaction('rw', this.db.platforms, this.db.docs, async () => {
      await this.db.platforms.delete(id);
      const docs = (await this.db.docs.toArray()).filter((d) => d.platforms.includes(id));
      await Promise.all(docs.map((d) => this.db.docs.update(d.id, { platforms: d.platforms.filter((p) => p !== id) })));
      return docs.length;
    });
  }

  /** Copies a doc as a fresh draft (publishing details are not carried over). */
  async duplicateDoc(id: ID): Promise<Doc> {
    const [doc, content] = await Promise.all([this.db.docs.get(id), this.db.contents.get(id)]);
    if (!doc) throw new RepoError('Document not found');
    const copy = await this.createDoc({
      spaceId: doc.spaceId,
      folderId: doc.folderId,
      title: doc.title ? `${doc.title} (copy)` : '',
      content: content ? structuredClone(content.json) : emptyDoc(),
      kind: doc.kind,
      status: doc.status === 'posted' || doc.status === 'scheduled' ? 'drafting' : doc.status,
      platforms: [...doc.platforms],
      tags: [...doc.tags],
      font: doc.font,
    });
    return copy;
  }

  /* ------------------------------ Trash ----------------------------- */

  async trash(kind: ItemKind, id: ID): Promise<void> {
    const t = Date.now();
    const mark = { deletedAt: t, trashRootId: id };
    await this.db.transaction('rw', this.db.spaces, this.db.folders, this.db.docs, async () => {
      if (kind === 'doc') {
        const doc = await this.db.docs.get(id);
        if (doc && !doc.deletedAt) await this.db.docs.update(id, mark);
        return;
      }
      if (kind === 'folder') {
        const folder = await this.db.folders.get(id);
        if (!folder || folder.deletedAt) return;
        const folders = await this.db.folders.where('spaceId').equals(folder.spaceId).toArray();
        const ids = [id, ...descendantFolderIds(folders, id)];
        const live = folders.filter((f) => ids.includes(f.id) && !f.deletedAt);
        await Promise.all(live.map((f) => this.db.folders.update(f.id, mark)));
        const docs = await this.db.docs.where('folderId').anyOf(ids).toArray();
        await Promise.all(docs.filter((d) => !d.deletedAt).map((d) => this.db.docs.update(d.id, mark)));
        return;
      }
      const space = await this.db.spaces.get(id);
      if (!space || space.deletedAt) return;
      await this.db.spaces.update(id, mark);
      const folders = await this.db.folders.where('spaceId').equals(id).toArray();
      await Promise.all(folders.filter((f) => !f.deletedAt).map((f) => this.db.folders.update(f.id, mark)));
      const docs = await this.db.docs.where('spaceId').equals(id).toArray();
      await Promise.all(docs.filter((d) => !d.deletedAt).map((d) => this.db.docs.update(d.id, mark)));
    });
  }

  /** Brings back an item and everything trashed together with it. */
  async restore(kind: ItemKind, id: ID): Promise<void> {
    const live = { deletedAt: null, trashRootId: null };
    await this.db.transaction('rw', this.db.spaces, this.db.folders, this.db.docs, async () => {
      if (kind === 'space') {
        const space = await this.db.spaces.get(id);
        if (!space?.deletedAt) return;
        const spaces = await this.db.spaces.toArray();
        const order = spaces.filter((s) => !s.deletedAt).reduce((m, s) => Math.max(m, s.order), -1) + 1;
        await this.db.spaces.update(id, { ...live, order });
        await this.restoreBatch(id, {});
        return;
      }

      if (kind === 'folder') {
        const folder = await this.db.folders.get(id);
        if (!folder?.deletedAt) return;
        const spaceId = await this.liveSpaceOr(folder.spaceId);
        let parentId = folder.parentId;
        if (parentId) {
          const parent = await this.db.folders.get(parentId);
          if (!parent || parent.deletedAt || parent.spaceId !== spaceId) parentId = null;
        }
        await this.db.folders.update(id, { ...live, parentId, spaceId });
        await this.restoreBatch(id, spaceId !== folder.spaceId ? { spaceId } : {});
        return;
      }

      const doc = await this.db.docs.get(id);
      if (!doc?.deletedAt) return;
      const spaceId = await this.liveSpaceOr(doc.spaceId);
      let folderId = doc.folderId;
      if (folderId) {
        const folder = await this.db.folders.get(folderId);
        if (!folder || folder.deletedAt || folder.spaceId !== spaceId) folderId = null;
      }
      await this.db.docs.update(id, { ...live, spaceId, folderId });
    });
  }

  private async restoreBatch(rootId: ID, patch: { spaceId?: ID }) {
    const live = { deletedAt: null, trashRootId: null, ...patch };
    const folders = (await this.db.folders.toArray()).filter((f) => f.trashRootId === rootId && f.id !== rootId);
    await Promise.all(folders.map((f) => this.db.folders.update(f.id, live)));
    const docs = (await this.db.docs.toArray()).filter((d) => d.trashRootId === rootId);
    await Promise.all(docs.map((d) => this.db.docs.update(d.id, live)));
  }

  /** The given space if it is alive, otherwise the first live space (created if needed). */
  private async liveSpaceOr(spaceId: ID): Promise<ID> {
    const space = await this.db.spaces.get(spaceId);
    if (space && !space.deletedAt) return space.id;
    const first = (await this.db.spaces.toArray()).filter((s) => !s.deletedAt).sort(byOrder)[0];
    if (first) return first.id;
    const t = Date.now();
    const restored: Space = {
      id: uid(),
      name: 'Restored',
      icon: 'archive',
      color: 'white',
      order: 0,
      createdAt: t,
      updatedAt: t,
      deletedAt: null,
      trashRootId: null,
    };
    await this.db.spaces.add(restored);
    return restored.id;
  }

  /** Permanently deletes a trashed item and everything trashed with it. */
  async purge(kind: ItemKind, id: ID): Promise<void> {
    await this.db.transaction('rw', [this.db.spaces, this.db.folders, this.db.docs, this.db.contents, this.db.texts], async () => {
      if (kind === 'doc') {
        await this.deleteDocs([id]);
        return;
      }
      const folders = (await this.db.folders.toArray()).filter((f) => f.trashRootId === id).map((f) => f.id);
      const docs = (await this.db.docs.toArray()).filter((d) => d.trashRootId === id).map((d) => d.id);
      await this.db.folders.bulkDelete(kind === 'folder' ? [...new Set([id, ...folders])] : folders);
      await this.deleteDocs(docs);
      if (kind === 'space') await this.db.spaces.delete(id);
    });
  }

  async emptyTrash(): Promise<void> {
    await this.db.transaction('rw', [this.db.spaces, this.db.folders, this.db.docs, this.db.contents, this.db.texts], async () => {
      const spaces = (await this.db.spaces.toArray()).filter((s) => s.deletedAt).map((s) => s.id);
      const folders = (await this.db.folders.toArray()).filter((f) => f.deletedAt).map((f) => f.id);
      const docs = (await this.db.docs.toArray()).filter((d) => d.deletedAt).map((d) => d.id);
      await this.db.spaces.bulkDelete(spaces);
      await this.db.folders.bulkDelete(folders);
      await this.deleteDocs(docs);
    });
  }

  private async deleteDocs(ids: ID[]) {
    await this.db.docs.bulkDelete(ids);
    await this.db.contents.bulkDelete(ids);
    await this.db.texts.bulkDelete(ids);
  }
}
