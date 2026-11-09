import Dexie, { type Table } from 'dexie';
import type { Doc, DocContent, DocText, Folder, ID, Space } from './types';

export const DB_NAME = 'infin8-content-os';

export class ContentDB extends Dexie {
  declare spaces: Table<Space, ID>;
  declare folders: Table<Folder, ID>;
  declare docs: Table<Doc, ID>;
  declare contents: Table<DocContent, ID>;
  declare texts: Table<DocText, ID>;

  constructor(name = DB_NAME) {
    super(name);
    this.version(1).stores({
      spaces: 'id',
      folders: 'id, spaceId, parentId',
      docs: 'id, spaceId, folderId, updatedAt',
      contents: 'id',
      texts: 'id',
    });
  }
}
