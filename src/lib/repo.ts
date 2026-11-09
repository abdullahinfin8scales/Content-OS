import type { ContentDB } from './db';
import { countChars, countWords, emptyDoc, makeExcerpt, toPlainText } from './content';
import { todayISO } from './dates';
import { uid } from './ids';
import { getTemplate, welcomeContent } from './templates';
import { canNestFolder, descendantFolderIds } from './tree';
import type { Doc, DocFont, DocKind, DocPatch, Folder, ID, ItemKind, Platform, RichNode, Space, SpaceColor, Status } from './types';

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
      if (folderId) {
        const folder = await this.db.folders.get(folderId);
        if (!folder || folder.deletedAt || folder.spaceId !== space.id) folderId = null;
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
      if (folderId) {
        const folder = await this.db.folders.get(folderId);
        if (!folder || folder.deletedAt) throw new RepoError('Destination folder not found');
        spaceId = folder.spaceId;
      }
      const space = await this.db.spaces.get(spaceId);
      if (!space || space.deletedAt) throw new RepoError('Destination space not found');
      if (doc.spaceId === spaceId && doc.folderId === folderId) return;
      await this.db.docs.update(id, { spaceId, folderId, updatedAt: Date.now() });
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

  /* ------------------------------ Seed ------------------------------ */

  /** First run: one space, three folders and a pinned welcome note. */
  async seedIfEmpty(): Promise<boolean> {
    const seeded = await this.db.transaction('rw', this.db.spaces, async () => {
      if ((await this.db.spaces.count()) > 0) return false;
      const t = Date.now();
      await this.db.spaces.add({
        id: 'space-personal',
        name: 'Personal Brand',
        icon: 'sparkles',
        color: 'white',
        order: 0,
        createdAt: t,
        updatedAt: t,
        deletedAt: null,
        trashRootId: null,
      });
      return true;
    });
    if (!seeded) return false;
    for (const name of ['Ideas', 'Scripts', 'Published']) {
      await this.createFolder({ spaceId: 'space-personal', name });
    }
    await this.createDoc({
      spaceId: 'space-personal',
      title: 'Welcome to your Content OS',
      content: welcomeContent(),
      kind: 'note',
      pinned: true,
    });
    return true;
  }
}
