import type { AccentId } from '@shared/types'

export interface Accent {
  id: AccentId
  name: string
  light: string
  dark: string
  /** Text drawn on top of the accent. */
  onLight: string
  onDark: string
}

/** Graphite is the palette's own neutral primary; the others are macOS-like tints. */
export const ACCENTS: Accent[] = [
  { id: 'graphite', name: 'Graphite', light: '#5d5f5f', dark: '#dfdfde', onLight: '#ffffff', onDark: '#2f3131' },
  { id: 'orange', name: 'Orange', light: '#e8792f', dark: '#ff9f57', onLight: '#ffffff', onDark: '#2b1a0e' },
  { id: 'yellow', name: 'Yellow', light: '#d99a12', dark: '#f5c542', onLight: '#ffffff', onDark: '#2b220a' },
  { id: 'green', name: 'Green', light: '#2ea54f', dark: '#4cd964', onLight: '#ffffff', onDark: '#0f2a16' },
  { id: 'teal', name: 'Teal', light: '#1fa7a3', dark: '#4fd1c5', onLight: '#ffffff', onDark: '#0c2927' },
  { id: 'blue', name: 'Blue', light: '#2f6df6', dark: '#5b8cff', onLight: '#ffffff', onDark: '#ffffff' },
  { id: 'purple', name: 'Purple', light: '#7c5cf0', dark: '#a78bfa', onLight: '#ffffff', onDark: '#1f1538' },
  { id: 'pink', name: 'Pink', light: '#d94a8c', dark: '#f472b6', onLight: '#ffffff', onDark: '#3a0f26' }
]

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

/** Writes the accent variables on <html>. Colored accents also wash sidebar and card very slightly. */
export function applyAccent(id: AccentId, dark: boolean): void {
  const a = ACCENTS.find((x) => x.id === id) ?? ACCENTS[0]
  const color = dark ? a.dark : a.light
  const [r, g, b] = hexToRgb(color)
  const root = document.documentElement.style
  root.setProperty('--accent', color)
  root.setProperty('--accent-soft', `rgba(${r}, ${g}, ${b}, ${dark ? 0.16 : 0.14})`)
  root.setProperty('--on-accent', dark ? a.onDark : a.onLight)
  if (id === 'graphite') {
    root.removeProperty('--wash')
    root.removeProperty('--wash-amount')
  } else {
    root.setProperty('--wash', color)
    root.setProperty('--wash-amount', dark ? '5%' : '3%')
  }
}
