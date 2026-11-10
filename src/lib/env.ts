/**
 * True in the claude.ai preview build (`npm run build:preview`). The preview
 * runs in a sandboxed frame where downloads, printing and folder access are
 * blocked, so those features are swapped for alternatives or hidden.
 */
export const IS_PREVIEW = import.meta.env.MODE === 'artifact';

/** Where the real app lives (data is stored per address, so this one is permanent). */
export const LIVE_URL = 'https://infin8-content-os.netlify.app';
