import Dexie, { type Table } from 'dexie';
import type { CustomPlatform, Doc, DocContent, DocText, Folder, ID, Space } from './types';

/** A change waiting to be uploaded: the latest local change to one record. */
export interface OutboxEntry {
  /** `kind:id`, e.g. `doc:abc123`. */
  key: string;
  kind: 'space' | 'folder' | 'doc' | 'content' | 'platform';
  id: ID;
  /** When the change was made on this device (ms). */
  at: number;
  /** Why the last upload of this change failed, if it did. */
  error?: string;
}

export const DB_NAME = 'infin8-content-os';

export class ContentDB extends Dexie {
  declare spaces: Table<Space, ID>;
  declare folders: Table<Folder, ID>;
  declare docs: Table<Doc, ID>;
  declare contents: Table<DocContent, ID>;
  declare texts: Table<DocText, ID>;
  /** Small app-level records (e.g. the automatic-backup folder handle). */
  declare meta: Table<{ key: string; value: unknown }, string>;
  /** Social platforms the user added. */
  declare platforms: Table<CustomPlatform, ID>;
  /** Local changes not yet uploaded to the cloud copy (see src/sync). */
  declare outbox: Table<OutboxEntry, string>;

  constructor(name = DB_NAME) {
    super(name);
    this.version(1).stores({
      spaces: 'id',
      folders: 'id, spaceId, parentId',
      docs: 'id, spaceId, folderId, updatedAt',
      contents: 'id',
      texts: 'id',
    });
    this.version(2).stores({ meta: 'key' });
    this.version(3).stores({ platforms: 'id' });
    this.version(4).stores({ outbox: 'key' });
  }
}
