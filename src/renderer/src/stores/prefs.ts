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

/** Accepts `rgb(r, g, b)` and the `color(srgb r g b)` form Chromium uses for color-mix results. */
function toHex(css: string): string | null {
  const hex = (n: number): string =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, '0')
  const rgb = css.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/)
  if (rgb) return '#' + [rgb[1], rgb[2], rgb[3]].map((n) => hex(Number(n))).join('')
  const srgb = css.match(/color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/)
  if (srgb) return '#' + [srgb[1], srgb[2], srgb[3]].map((n) => hex(Number(n) * 255)).join('')
  return null
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
