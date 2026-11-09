import { toPlainText } from '../lib/content';
import { RepoError, type NewDocInput } from '../lib/repo';
import { navigate, parseHash, paths } from '../lib/router';
import type { Doc, ID, ItemKind } from '../lib/types';
import { confirmDialog, toast } from './feedback';
import { repo } from './repo';
import { useSettings } from './settings';
import { useUI, type DocLocation } from './ui';
import type { Workspace } from './workspace';

/** Where new things go when nothing more specific is known. */
export function defaultLocation(ws: Workspace): DocLocation | null {
  const last = useUI.getState().lastLocation;
  if (last && ws.spaceById.get(last.spaceId) && !ws.spaceById.get(last.spaceId)!.deletedAt) {
    const folder = last.folderId ? ws.folderById.get(last.folderId) : null;
    if (!last.folderId || (folder && !folder.deletedAt)) return last;
    return { spaceId: last.spaceId, folderId: null };
  }
  const first = ws.spaces[0];
  return first ? { spaceId: first.id, folderId: null } : null;
}

export function rememberLocation(location: DocLocation) {
  const current = useUI.getState().lastLocation;
  if (current?.spaceId === location.spaceId && current.folderId === location.folderId) return;
  useUI.getState().set({ lastLocation: location });
}

function revealLocation(location: { spaceId: ID; folderId: ID | null }, ws?: Workspace) {
  const ui = useUI.getState();
  ui.setExpanded(location.spaceId, true);
  let folderId = location.folderId;
  const seen = new Set<ID>();
  while (folderId && ws && !seen.has(folderId)) {
    seen.add(folderId);
    ui.setExpanded(folderId, true);
    folderId = ws.folderById.get(folderId)?.parentId ?? null;
  }
}

function reportError(err: unknown) {
  const message = err instanceof RepoError ? err.message : 'Something went wrong. Please try again.';
  if (!(err instanceof RepoError)) console.error(err);
  toast(message, { tone: 'error' });
}

/* ------------------------------- Docs ------------------------------- */

export async function createDocFromTemplate(
  templateId: string,
  location: DocLocation,
  overrides: Partial<NewDocInput> = {},
  ws?: Workspace,
): Promise<Doc | null> {
  try {
    const doc = await repo.createFromTemplate(templateId, location, { font: useSettings.getState().defaultFont, ...overrides });
    revealLocation(location, ws);
    rememberLocation(location);
    navigate(paths.doc(doc.id));
    return doc;
  } catch (err) {
    reportError(err);
    return null;
  }
}

export async function quickNewDoc(ws: Workspace, location?: DocLocation) {
  const target = location ?? defaultLocation(ws);
  if (!target) {
    useUI.getState().set({ spaceDialog: {} });
    toast('Create a space first — documents live inside spaces.');
    return;
  }
  await createDocFromTemplate('blank', target, {}, ws);
}

export function openNewDocDialog(request: { spaceId?: ID; folderId?: ID | null; status?: Doc['status']; publishDate?: string } = {}) {
  useUI.getState().set({ newDoc: request, paletteOpen: false });
}

export async function duplicateDoc(id: ID) {
  try {
    const copy = await repo.duplicateDoc(id);
    navigate(paths.doc(copy.id));
    toast('Duplicated as a new draft');
  } catch (err) {
    reportError(err);
  }
}

export async function moveDocTo(id: ID, target: DocLocation, ws?: Workspace): Promise<boolean> {
  try {
    await repo.moveDoc(id, target);
    revealLocation(target, ws);
    return true;
  } catch (err) {
    reportError(err);
    return false;
  }
}

export async function moveFolderTo(id: ID, target: { spaceId: ID; parentId: ID | null }, ws?: Workspace): Promise<boolean> {
  try {
    await repo.moveFolder(id, target);
    revealLocation({ spaceId: target.spaceId, folderId: target.parentId }, ws);
    return true;
  } catch (err) {
    reportError(err);
    return false;
  }
}

/* ------------------------------ Folders ----------------------------- */

export async function newFolder(spaceId: ID, parentId: ID | null, ws?: Workspace) {
  try {
    const folder = await repo.createFolder({ spaceId, parentId, name: 'New folder' });
    revealLocation({ spaceId, folderId: parentId }, ws);
    useUI.getState().set({ renamingId: folder.id, sidebarOpen: true });
  } catch (err) {
    reportError(err);
  }
}

/* ------------------------------- Trash ------------------------------ */

const KIND_LABEL: Record<ItemKind, string> = { space: 'Space', folder: 'Folder', doc: 'Document' };

export async function trashItem(kind: ItemKind, id: ID, ws: Workspace) {
  const route = parseHash(window.location.hash);
  // Leave a page that is about to disappear.
  let leave = false;
  if (route.name === 'doc') {
    const doc = ws.docById.get(route.id);
    leave =
      (kind === 'doc' && route.id === id) ||
      (kind === 'space' && doc?.spaceId === id) ||
      (kind === 'folder' && !!doc && isInside(ws, doc.folderId, id));
  } else if (route.name === 'folder') {
    const folder = ws.folderById.get(route.id);
    leave = (kind === 'folder' && isInside(ws, route.id, id)) || (kind === 'space' && folder?.spaceId === id);
  } else if (route.name === 'space') {
    leave = kind === 'space' && route.id === id;
  }

  if (kind === 'space') {
    const space = ws.spaceById.get(id);
    const count = ws.docs.filter((d) => d.spaceId === id).length;
    const ok = await confirmDialog({
      title: `Move “${space?.name ?? 'this space'}” to Trash?`,
      message: count
        ? `Its folders and ${count} document${count === 1 ? '' : 's'} go with it. You can restore everything from Trash.`
        : 'You can restore it from Trash.',
      confirmLabel: 'Move to Trash',
      danger: true,
    });
    if (!ok) return;
  }

  try {
    await repo.trash(kind, id);
    if (leave) navigate(paths.home(), { replace: true });
    toast(`${KIND_LABEL[kind]} moved to Trash`, {
      action: { label: 'Undo', run: () => void repo.restore(kind, id) },
    });
  } catch (err) {
    reportError(err);
  }
}

function isInside(ws: Workspace, folderId: ID | null, ancestorId: ID): boolean {
  const seen = new Set<ID>();
  let current = folderId;
  while (current && !seen.has(current)) {
    if (current === ancestorId) return true;
    seen.add(current);
    current = ws.folderById.get(current)?.parentId ?? null;
  }
  return false;
}

/* --------------------------- Clipboard/files ------------------------ */

function legacyCopy(text: string): boolean {
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.appendChild(area);
  area.select();
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  area.remove();
  return ok;
}

export async function copyToClipboard(text: string, label = 'Copied to clipboard'): Promise<boolean> {
  let ok = false;
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      ok = true;
    }
  } catch {
    ok = false;
  }
  if (!ok) ok = legacyCopy(text);
  if (ok) toast(label, { tone: 'success' });
  else toast('Your browser blocked the clipboard here — select the text and press Ctrl+C instead.', { tone: 'error' });
  return ok;
}

export function downloadFile(filename: string, content: string | Blob, type = 'text/plain;charset=utf-8') {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function safeFileName(name: string, fallback = 'untitled'): string {
  const clean = name
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
  return clean || fallback;
}

export async function copyDocText(doc: Doc) {
  const content = await repo.getContent(doc.id);
  const text = toPlainText(content?.json);
  if (!text.trim()) {
    toast('Nothing to copy yet');
    return;
  }
  await copyToClipboard(text, 'Copied as plain text — ready to paste');
}

