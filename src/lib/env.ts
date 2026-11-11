/**
 * True in the claude.ai preview build (`npm run build:preview`). The preview
 * runs in a sandboxed frame where downloads, printing and folder access are
 * blocked, so those features are swapped for alternatives or hidden.
 */
export const IS_PREVIEW = import.meta.env.MODE === 'artifact';

/** Where the real app lives (data is stored per address, so this one is permanent). */
export const LIVE_URL = 'https://infin8-content-os.netlify.app';

/**
 * The cloud copy (Supabase). Both values are public by design: the key only
 * allows what the database's row-level security rules allow (each signed-in
 * user reaches only their own rows). Never put a secret key here.
 */
export const SUPABASE_URL = String(import.meta.env.VITE_SUPABASE_URL ?? '').replace(/\/+$/, '');
export const SUPABASE_KEY = String(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '');

/** Accounts and cloud sync are on in the real app once Supabase is configured; the preview stays local-only. */
export const SYNC_ENABLED = !IS_PREVIEW && SUPABASE_URL.startsWith('https://') && SUPABASE_KEY.length > 20;
