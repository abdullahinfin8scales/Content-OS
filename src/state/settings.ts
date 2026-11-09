import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { IS_PREVIEW } from '../lib/env';
import type { DocFont } from '../lib/types';

export type ThemePref = 'dark' | 'light' | 'system';

interface SettingsState {
  theme: ThemePref;
  displayName: string;
  /** Speaking pace used for "spoken time" estimates. */
  wpm: number;
  defaultFont: DocFont;
  /** When the last backup (export or automatic) was written. */
  lastBackupAt: number | null;
  /** Home's backup reminder was dismissed at this time. */
  backupNudgeDismissedAt: number | null;
  set: (patch: Partial<Omit<SettingsState, 'set'>>) => void;
}

/** Stored under `infin8.settings`; index.html reads `state.theme` before first paint. */
export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      // The preview follows the viewer's claude.ai theme; the app itself is dark-first.
      theme: IS_PREVIEW ? 'system' : 'dark',
      displayName: '',
      wpm: 150,
      defaultFont: 'sans',
      lastBackupAt: null,
      backupNudgeDismissedAt: null,
      set: (patch) => set(patch),
    }),
    { name: 'infin8.settings', version: 1 },
  ),
);

export function resolveTheme(pref: ThemePref): 'dark' | 'light' {
  if (pref !== 'system') return pref;
  const attr = document.documentElement.dataset.theme;
  if (attr === 'dark' || attr === 'light') return attr;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
