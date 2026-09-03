import { create } from 'zustand'
import type { Prefs } from '@shared/types'
import { applyAccent } from '@/theme/accents'

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
  applyAccent(prefs?.accent ?? 'blue', dark)
  syncCaptionButtons()
}

/** Windows draws its own caption buttons over our title bar; hand it the exact colors we ended up with. */
function syncCaptionButtons(): void {
  if (window.step.platform !== 'win32') return
  requestAnimationFrame(() => {
    const cs = getComputedStyle(document.body)
    const bg = toHex(cs.backgroundColor)
    const fg = toHex(cs.color)
    if (bg && fg) window.step.send('win:setOverlay', bg, fg)
  })
}

function toHex(rgb: string): string | null {
  const m = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/)
  if (!m) return null
  return '#' + [m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, '0')).join('')
}

export const usePrefs = create<PrefsState>((set, get) => ({
  prefs: null,
  systemDark: window.matchMedia('(prefers-color-scheme: dark)').matches,
  dark: window.matchMedia('(prefers-color-scheme: dark)').matches,
  load: async () => {
    const prefs = await window.step.invoke('prefs:get')
    const dark = computeDark(prefs, get().systemDark)
    applyThemeAttr(dark, prefs)
    set({ prefs, dark })
  },
  set: async (partial) => {
    const cur = get().prefs
    if (cur) {
      const next = { ...cur, ...partial }
      const dark = computeDark(next, get().systemDark)
      applyThemeAttr(dark, next)
      set({ prefs: next, dark })
    }
    await window.step.invoke('prefs:set', partial)
  },
  applyRemote: (prefs) => {
    const dark = computeDark(prefs, get().systemDark)
    applyThemeAttr(dark, prefs)
    set({ prefs, dark })
  },
  setSystemDark: (systemDark) => {
    const dark = computeDark(get().prefs, systemDark)
    applyThemeAttr(dark, get().prefs)
    set({ systemDark, dark })
  }
}))

applyThemeAttr(usePrefs.getState().dark)
