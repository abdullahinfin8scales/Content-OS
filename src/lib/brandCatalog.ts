/**
 * The full simple-icons catalogue (~3,500 brand logos, CC0), shaped for
 * platform detection. Only ever loaded through `loadBrandCatalog()`, so it
 * lives in its own lazily-loaded chunk and never weighs on app start-up.
 */
import * as icons from 'simple-icons';
import { siteDomain, type BrandIcon } from './platformDetect';

interface CatalogEntry {
  slug: string;
  title: string;
  path: string;
  hex: string;
  source?: string;
}

function hostOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return siteDomain(new URL(url).hostname);
  } catch {
    return null;
  }
}

export const BRANDS: BrandIcon[] = (Object.values(icons) as unknown[])
  .filter((v): v is CatalogEntry => typeof v === 'object' && v !== null && 'slug' in v && 'path' in v)
  .map((i) => ({ slug: i.slug, title: i.title, path: i.path, hex: i.hex, sourceDomain: hostOf(i.source) }));
