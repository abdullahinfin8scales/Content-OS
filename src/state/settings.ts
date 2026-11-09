import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { DocFont } from '../lib/types';

export type ThemePref = 'dark' | 'light' | 'system';

interface SettingsState {
  theme: ThemePref;
  displayName: string;
  /** Speaking pace used for "spoken time" estimates. */
  wpm: number;
  defaultFont: DocFont;
  set: (patch: Partial<Omit<SettingsState, 'set'>>) => void;
}

/** Stored under `infin8.settings`; index.html reads `state.theme` before first paint. */
export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      theme: 'dark',
      displayName: '',
      wpm: 150,
      defaultFont: 'sans',
      set: (patch) => set(patch),
    }),
    { name: 'infin8.settings', version: 1 },
  ),
);

export function resolveTheme(pref: ThemePref): 'dark' | 'light' {
  if (pref === 'system') return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  return pref;
}
