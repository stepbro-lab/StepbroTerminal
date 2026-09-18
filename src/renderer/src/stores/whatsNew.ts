import { create } from 'zustand'
import { compareVersions, type ChangelogEntry } from '@shared/changelog'
import { usePrefs } from './prefs'

interface WhatsNewStore {
  /** The releases on show, newest first; null while the page is closed. */
  entries: ChangelogEntry[] | null
  show: (entries: ChangelogEntry[]) => void
  /** Closes the page and counts the running version as seen, so it does not come back on the next launch. */
  close: () => void
}

export const useWhatsNew = create<WhatsNewStore>((set) => ({
  entries: null,
  show: (entries) => set({ entries: entries.length ? entries : null }),
  close: () => {
    set({ entries: null })
    const version = window.step.version
    const seen = usePrefs.getState().prefs?.seenVersion
    if (!seen || compareVersions(version, seen) > 0) void usePrefs.getState().set({ seenVersion: version })
  }
}))
