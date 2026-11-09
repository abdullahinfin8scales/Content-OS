import { siFacebook, siInstagram, siThreads, siTiktok, siX, siYoutube } from 'simple-icons';
import type { Platform, SpaceColor, Status } from './types';

export interface StatusMeta {
  label: string;
  /** CSS custom property holding the status color. */
  color: string;
  hint: string;
}

export const STATUS_META: Record<Status, StatusMeta> = {
  idea: { label: 'Idea', color: 'var(--st-idea)', hint: 'Captured, not started' },
  drafting: { label: 'Drafting', color: 'var(--st-drafting)', hint: 'Being written' },
  ready: { label: 'Ready', color: 'var(--st-ready)', hint: 'Done, waiting for a slot' },
  scheduled: { label: 'Scheduled', color: 'var(--st-scheduled)', hint: 'Has a date' },
  posted: { label: 'Posted', color: 'var(--st-posted)', hint: 'Live — archived with its numbers' },
};

/** LinkedIn's mark is not in simple-icons; a plain "in" tile stands in. */
const LINKEDIN_PATH =
  'M5 2h14a3 3 0 0 1 3 3v14a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3V5a3 3 0 0 1 3-3zM8.75 7.3a1.55 1.55 0 1 1-3.1 0 1.55 1.55 0 1 1 3.1 0zM5.8 9.6h2.8v8.6H5.8zM10.4 9.6h2.65v1.2c.45-.8 1.5-1.45 2.95-1.45 2.4 0 3.3 1.5 3.3 3.95v4.9h-2.8v-4.4c0-1.15-.3-2-1.45-2-1.2 0-1.95.85-1.95 2.1v4.3h-2.7z';

export interface PlatformMeta {
  name: string;
  path: string;
  /** Approximate text limit for the main post/caption field. */
  limit: number;
  limitLabel: string;
}

export const PLATFORM_META: Record<Platform, PlatformMeta> = {
  instagram: { name: 'Instagram', path: siInstagram.path, limit: 2200, limitLabel: 'caption' },
  tiktok: { name: 'TikTok', path: siTiktok.path, limit: 4000, limitLabel: 'caption' },
  youtube: { name: 'YouTube', path: siYoutube.path, limit: 5000, limitLabel: 'description' },
  linkedin: { name: 'LinkedIn', path: LINKEDIN_PATH, limit: 3000, limitLabel: 'post' },
  x: { name: 'X', path: siX.path, limit: 280, limitLabel: 'post' },
  threads: { name: 'Threads', path: siThreads.path, limit: 500, limitLabel: 'post' },
  facebook: { name: 'Facebook', path: siFacebook.path, limit: 63206, limitLabel: 'post' },
};

export const SPACE_COLOR_VAR: Record<SpaceColor, string> = {
  white: 'var(--sp-white)',
  violet: 'var(--sp-violet)',
  blue: 'var(--sp-blue)',
  cyan: 'var(--sp-cyan)',
  green: 'var(--sp-green)',
  amber: 'var(--sp-amber)',
  orange: 'var(--sp-orange)',
  rose: 'var(--sp-rose)',
};

export const METRIC_LABELS = {
  views: 'Views',
  likes: 'Likes',
  comments: 'Comments',
  shares: 'Shares',
  saves: 'Saves',
} as const;
