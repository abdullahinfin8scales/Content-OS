import { ContentDB } from '../lib/db';
import { SYNC_ENABLED } from '../lib/env';
import { Repo } from '../lib/repo';
import { trackChanges } from '../sync/outbox';

export const db = new ContentDB();
// Queue every change for the cloud copy. Must run before the database is first used.
if (SYNC_ENABLED) trackChanges(db);
export const repo = new Repo(db);
