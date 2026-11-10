/**
 * Turns a link the user pastes ("https://bsky.app/profile/me") into a platform:
 * name, logo and a known character limit. Logos come from the bundled
 * simple-icons catalogue — nothing is fetched from the internet, so the links
 * a user adds never leave their laptop.
 */
import { IS_PREVIEW } from './env';
import type { BuiltinPlatform, PlatformIconData } from './types';

export interface BrandIcon {
  slug: string;
  title: string;
  path: string;
  hex: string;
  /** Site of the brand's guidelines page, used as a last-resort match. */
  sourceDomain: string | null;
}

export interface Detection {
  /** Normalised link ('' when the user typed just a name). */
  url: string;
  domain: string;
  name: string;
  icon: PlatformIconData;
  limit: number | null;
  /** Set when the link belongs to a platform that is already built in. */
  builtin: BuiltinPlatform | null;
  /** True when a real brand logo was found (otherwise a letter badge). */
  matched: boolean;
}

/** Hosts of the platforms that ship with the app. */
const BUILTIN_HOSTS: Record<string, BuiltinPlatform> = {
  'instagram.com': 'instagram',
  'instagr.am': 'instagram',
  'tiktok.com': 'tiktok',
  'youtube.com': 'youtube',
  'youtu.be': 'youtube',
  'linkedin.com': 'linkedin',
  'lnkd.in': 'linkedin',
  'x.com': 'x',
  'twitter.com': 'x',
  't.co': 'x',
  'threads.net': 'threads',
  'threads.com': 'threads',
  'facebook.com': 'facebook',
  'fb.com': 'facebook',
  'fb.me': 'facebook',
};

/** Short links and alternate domains whose name doesn't match the brand. */
const ALIASES: Record<string, string> = {
  'bsky.app': 'bluesky',
  'bsky.social': 'bluesky',
  't.me': 'telegram',
  'telegram.me': 'telegram',
  'wa.me': 'whatsapp',
  'discord.gg': 'discord',
  'redd.it': 'reddit',
  'pin.it': 'pinterest',
  'dev.to': 'devdotto',
  'music.youtube.com': 'youtubemusic',
  'podcasts.apple.com': 'applepodcasts',
  'music.apple.com': 'applemusic',
  'mastodon.social': 'mastodon',
  'mastodon.online': 'mastodon',
  'mstdn.social': 'mastodon',
  'linktr.ee': 'linktree',
  'news.ycombinator.com': 'ycombinator',
  'snap.com': 'snapchat',
  'xhslink.com': 'xiaohongshu',
  'b23.tv': 'bilibili',
};

/** Post limits for well-known platforms (characters). */
const KNOWN_LIMITS: Record<string, number> = {
  bluesky: 300,
  mastodon: 500,
  pinterest: 500,
  discord: 2000,
  telegram: 4096,
  reddit: 40000,
};

/** Hosts listed above are matched before the subdomain is dropped. */
const KEEP_SUBDOMAIN = new Set(['music.youtube.com', 'podcasts.apple.com', 'music.apple.com', 'news.ycombinator.com']);

const TWO_PART_SUFFIXES = new Set([
  'co.uk', 'org.uk', 'ac.uk', 'com.au', 'net.au', 'co.nz', 'co.jp', 'co.kr', 'co.in', 'co.za',
  'com.br', 'com.mx', 'com.ar', 'com.tr', 'com.cn', 'com.hk', 'com.sg', 'com.pk', 'com.my',
]);

const normalizeKey = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Parses what the user typed; accepts links with or without https://. */
export function parsePlatformUrl(input: string): URL | null {
  const raw = input.trim();
  if (!raw || /\s/.test(raw) || !raw.includes('.')) return null;
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`);
    if (!/^https?:$/.test(url.protocol) || !url.hostname.includes('.')) return null;
    return url;
  } catch {
    return null;
  }
}

export function cleanHost(host: string): string {
  return host.toLowerCase().replace(/\.$/, '').replace(/^(www|m|mobile|web|open|app)\./, '');
}

/** The registrable part of a host: "user.substack.com" → "substack.com", "x.co.uk" → "x.co.uk". */
export function siteDomain(host: string): string {
  const labels = cleanHost(host).split('.').filter(Boolean);
  if (labels.length <= 2) return labels.join('.');
  const lastTwo = labels.slice(-2).join('.');
  return TWO_PART_SUFFIXES.has(lastTwo) ? labels.slice(-3).join('.') : lastTwo;
}

export function builtinForHost(host: string): BuiltinPlatform | null {
  const h = cleanHost(host);
  if (KEEP_SUBDOMAIN.has(h)) return null; // e.g. YouTube Music is its own platform
  return BUILTIN_HOSTS[h] ?? BUILTIN_HOSTS[siteDomain(h)] ?? null;
}

export function matchBrand(brands: BrandIcon[], host: string): BrandIcon | null {
  const h = cleanHost(host);
  const domain = siteDomain(h);
  const bySlug = (slug: string) => brands.find((b) => b.slug === slug) ?? null;

  const alias = ALIASES[h] ?? ALIASES[domain];
  if (alias) {
    const hit = bySlug(alias);
    if (hit) return hit;
  }
  const label = normalizeKey(domain.split('.')[0] ?? '');
  if (label) {
    const exact = bySlug(label) ?? brands.find((b) => normalizeKey(b.title) === label);
    if (exact) return exact;
  }
  const bySource = brands.filter((b) => b.sourceDomain === domain);
  return bySource.length === 1 ? bySource[0] : null;
}

function matchName(brands: BrandIcon[], name: string): BrandIcon | null {
  const key = normalizeKey(name);
  if (!key) return null;
  return brands.find((b) => b.slug === key) ?? brands.find((b) => normalizeKey(b.title) === key) ?? null;
}

/** "lemon8-app" → "Lemon8 App" */
function nameFromLabel(label: string): string {
  return label
    .split(/[-_]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ');
}

export function monogramFor(name: string): PlatformIconData {
  const letter = name.trim().match(/[\p{L}\p{N}]/u)?.[0] ?? '?';
  return { kind: 'monogram', text: letter.toUpperCase() };
}

/**
 * Works out the platform for a link (or a plain name). `brands` is the logo
 * catalogue; pass null when it isn't available and a letter badge is used.
 */
export function detectPlatform(input: string, brands: BrandIcon[] | null): Detection | null {
  const raw = input.trim();
  if (!raw) return null;
  const url = parsePlatformUrl(raw);

  if (!url) {
    // A plain name such as "Bluesky".
    if (raw.includes('/') || raw.length > 60) return null;
    const brand = brands ? matchName(brands, raw) : null;
    const name = brand?.title ?? raw;
    return {
      url: '',
      domain: '',
      name,
      icon: brand ? { kind: 'path', path: brand.path, slug: brand.slug } : monogramFor(name),
      limit: brand ? (KNOWN_LIMITS[brand.slug] ?? null) : null,
      builtin: null,
      matched: !!brand,
    };
  }

  const host = url.hostname;
  const domain = siteDomain(host);
  const builtin = builtinForHost(host);
  const brand = brands ? matchBrand(brands, host) : null;
  const label = domain.split('.')[0] ?? domain;
  const name = brand?.title ?? nameFromLabel(label);
  return {
    url: url.href,
    domain: KEEP_SUBDOMAIN.has(cleanHost(host)) ? cleanHost(host) : domain,
    name,
    icon: brand ? { kind: 'path', path: brand.path, slug: brand.slug } : monogramFor(name),
    limit: brand ? (KNOWN_LIMITS[brand.slug] ?? null) : null,
    builtin,
    matched: !!brand,
  };
}

let catalog: Promise<BrandIcon[] | null> | null = null;

/** Loads the logo catalogue (a separate ~5 MB file) the first time it's needed. */
export function loadBrandCatalog(): Promise<BrandIcon[] | null> {
  if (IS_PREVIEW) return Promise.resolve(null); // the single-file preview ships without it
  catalog ??= import('./brandCatalog').then((m) => m.BRANDS).catch(() => null);
  return catalog;
}
