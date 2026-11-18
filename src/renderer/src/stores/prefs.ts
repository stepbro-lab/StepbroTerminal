import { create } from 'zustand'
import type { Prefs } from '@shared/types'
import { applyAccent } from '@/theme/accents'
import { setCurrentLanguage } from '@/lib/i18n'
import { isTranslucent } from '@shared/frame'

interface PrefsState {
  prefs: Prefs | null
  systemDark: boolean
  dark: boolean
  load: () => Promise<void>
  set: (partial: Partial<Prefs>) => Promise<void>
  applyRemote: (p: Prefs) => void
  setSystemDark: (dark: boolean) => void
}

function computeDark(prefs: Prefs | null, systemDark: boolean): boolean {
  if (!prefs || prefs.theme === 'system') return systemDark
  return prefs.theme === 'dark'
}

function applyThemeAttr(dark: boolean, prefs?: Prefs | null): void {
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light')
  document.documentElement.setAttribute('data-platform', window.step.platform)
  const root = document.documentElement
  root.toggleAttribute('data-translucent', !!prefs && isTranslucent(prefs, window.step.platform, window.step.osVersion))
  root.style.setProperty('--frame-opacity', String(prefs?.frameOpacity ?? 1))
  root.style.setProperty('--content-opacity', String(prefs?.contentOpacity ?? 1))
  applyAccent(prefs?.accent ?? 'blue', dark)
}

export const usePrefs = create<PrefsState>((set, get) => ({
  prefs: null,
  systemDark: window.matchMedia('(prefers-color-scheme: dark)').matches,
  dark: window.matchMedia('(prefers-color-scheme: dark)').matches,
  load: async () => {
    const prefs = await window.step.invoke('prefs:get')
    const dark = computeDark(prefs, get().systemDark)
    applyThemeAttr(dark, prefs)
    setCurrentLanguage(prefs.language)
    set({ prefs, dark })
  },
  set: async (partial) => {
    const cur = get().prefs
    if (cur) {
      const next = { ...cur, ...partial }
      const dark = computeDark(next, get().systemDark)
      applyThemeAttr(dark, next)
      setCurrentLanguage(next.language)
      set({ prefs: next, dark })
    }
    await window.step.invoke('prefs:set', partial)
  },
  applyRemote: (prefs) => {
    const dark = computeDark(prefs, get().systemDark)
    applyThemeAttr(dark, prefs)
    setCurrentLanguage(prefs.language)
    set({ prefs, dark })
  },
  setSystemDark: (systemDark) => {
    const dark = computeDark(get().prefs, systemDark)
    applyThemeAttr(dark, get().prefs)
    set({ systemDark, dark })
  }
}))

applyThemeAttr(usePrefs.getState().dark)
