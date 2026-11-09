import { ContentDB } from '../lib/db';
import { Repo } from '../lib/repo';

export const db = new ContentDB();
export const repo = new Repo(db);
