import { PLATFORM_META } from './meta';
import { PLATFORMS, type BuiltinPlatform, type CustomPlatform, type Platform, type PlatformIconData } from './types';

/** Everything the UI needs to show a platform, built-in or custom. */
export interface PlatformInfo {
  id: Platform;
  name: string;
  icon: PlatformIconData;
  /** Character limit for a post, if known. */
  limit: number | null;
  limitLabel: string;
  custom: boolean;
  url?: string;
  domain?: string;
}

export const CUSTOM_PLATFORM_PREFIX = 'custom-';

export function isCustomPlatformId(id: string): boolean {
  return id.startsWith(CUSTOM_PLATFORM_PREFIX);
}

export function isBuiltinPlatform(id: string): id is BuiltinPlatform {
  return (PLATFORMS as readonly string[]).includes(id);
}

export function builtinInfo(id: BuiltinPlatform): PlatformInfo {
  const meta = PLATFORM_META[id];
  // The hand-drawn LinkedIn tile cuts its letters out with even-odd filling.
  const icon: PlatformIconData = { kind: 'path', path: meta.path, ...(id === 'linkedin' ? { evenOdd: true } : {}) };
  return { id, name: meta.name, icon, limit: meta.limit, limitLabel: meta.limitLabel, custom: false };
}

export function customInfo(p: CustomPlatform): PlatformInfo {
  return { id: p.id, name: p.name, icon: p.icon, limit: p.limit, limitLabel: 'post', custom: true, url: p.url, domain: p.domain };
}

/** Shown for a platform id that no longer exists (e.g. imported from an old backup). */
export function missingPlatform(id: string): PlatformInfo {
  return { id, name: 'Removed platform', icon: { kind: 'monogram', text: '?' }, limit: null, limitLabel: 'post', custom: true };
}

export interface PlatformRegistry {
  /** Built-ins first (fixed order), then custom platforms in the order they were added. */
  list: PlatformInfo[];
  byId: Map<string, PlatformInfo>;
}

export function buildPlatformRegistry(custom: CustomPlatform[]): PlatformRegistry {
  const list = [...PLATFORMS.map(builtinInfo), ...[...custom].sort((a, b) => a.createdAt - b.createdAt).map(customInfo)];
  return { list, byId: new Map(list.map((p) => [p.id, p])) };
}

export function platformInfo(registry: PlatformRegistry, id: string): PlatformInfo {
  return registry.byId.get(id) ?? missingPlatform(id);
}
