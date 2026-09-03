import type { AccentId } from '@shared/types'

export interface Accent {
  id: AccentId
  name: string
  light: string
  dark: string
}

/** macOS-like accent colors. `graphite` keeps the neutral chrome. */
export const ACCENTS: Accent[] = [
  { id: 'graphite', name: 'Graphite', light: '#6b6b73', dark: '#a0a0a8' },
  { id: 'orange', name: 'Orange', light: '#e8792f', dark: '#ff9f57' },
  { id: 'yellow', name: 'Yellow', light: '#d99a12', dark: '#f5c542' },
  { id: 'green', name: 'Green', light: '#2ea54f', dark: '#4cd964' },
  { id: 'teal', name: 'Teal', light: '#1fa7a3', dark: '#4fd1c5' },
  { id: 'blue', name: 'Blue', light: '#2f6df6', dark: '#5b8cff' },
  { id: 'purple', name: 'Purple', light: '#7c5cf0', dark: '#a78bfa' },
  { id: 'pink', name: 'Pink', light: '#d94a8c', dark: '#f472b6' }
]

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

/** Writes the accent variables on <html>. The wash tints sidebar and card very slightly, like a window tint. */
export function applyAccent(id: AccentId, dark: boolean): void {
  const a = ACCENTS.find((x) => x.id === id) ?? ACCENTS.find((x) => x.id === 'blue')!
  const color = dark ? a.dark : a.light
  const [r, g, b] = hexToRgb(color)
  const root = document.documentElement.style
  root.setProperty('--accent', color)
  root.setProperty('--accent-soft', `rgba(${r}, ${g}, ${b}, ${dark ? 0.18 : 0.13})`)
  if (id === 'graphite') {
    root.removeProperty('--wash')
    root.removeProperty('--wash-amount')
  } else {
    root.setProperty('--wash', color)
    root.setProperty('--wash-amount', dark ? '5%' : '3%')
  }
}
