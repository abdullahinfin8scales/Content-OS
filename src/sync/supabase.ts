import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_KEY, SUPABASE_URL } from '../lib/env';
import { SyncError, type Change, type ServerRow, type SyncServer } from './engine';

/** Where the browser keeps the sign-in session. */
export const AUTH_STORAGE_KEY = 'infin8-content-os-auth';

let client: SupabaseClient | null = null;

export function supabase(): SupabaseClient {
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: {
        // Links in emails come back as ?code=… (not #…), so they never clash with the app's #routes.
        flowType: 'pkce',
        storageKey: AUTH_STORAGE_KEY,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }
  return client;
}

interface RpcFailure {
  message?: string;
  code?: string;
  details?: string | null;
  hint?: string | null;
}

/** Sorts a failed request into: offline, signed out, refused content, or a server problem. */
export function toSyncError(status: number, error: RpcFailure): SyncError {
  const message = error.message || 'Unknown error';
  const code = error.code ?? '';
  if (status === 0 || /failed to fetch|networkerror|load failed|fetch failed|network request failed/i.test(message)) {
    return new SyncError('Can’t reach the cloud — check the connection.', 'network');
  }
  if (status === 401 || status === 403 || code === '28000' || code === 'PGRST301' || code === 'PGRST302' || /jwt|not signed in/i.test(message)) {
    return new SyncError('Your sign-in has expired.', 'auth');
  }
  if (status === 413 || code === '54000' || code === '22P02' || code === '22023' || /too large|payload/i.test(message)) {
    return new SyncError(`The cloud refused this item: ${message}`, 'payload');
  }
  if (status >= 500 || status === 429) {
    return new SyncError('The cloud isn’t answering right now (a free Supabase project pauses after a week without use).', 'server');
  }
  return new SyncError(message, 'server');
}

/** The cloud copy, reached through the two database functions in supabase/migrations. */
export const supabaseServer: SyncServer = {
  async push(changes: Change[]): Promise<ServerRow[]> {
    const { data, error, status } = await supabase().rpc('push_records', { changes });
    if (error) throw toSyncError(status, error);
    return (data ?? []) as ServerRow[];
  },
  async pull(since: string, afterKind: string, afterId: string, pageSize: number): Promise<ServerRow[]> {
    const { data, error, status } = await supabase().rpc('pull_records', {
      since,
      after_kind: afterKind,
      after_id: afterId,
      page_size: pageSize,
    });
    if (error) throw toSyncError(status, error);
    return (data ?? []) as ServerRow[];
  },
};
