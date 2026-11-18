export type ShortcutId =
  | 'new-shell'
  | 'new-session'
  | 'close-session'
  | 'restart-session'
  | 'rename-session'
  | 'jump'
  | 'next-attention'
  | 'split-right'
  | 'split-down'
  | 'next-view'
  | 'prev-view'
  | 'detach-pane'
  | 'find'
  | 'palette'
  | 'prompt-history'
  | 'redraw'
  | 'notes'
  | 'toggle-sidebar'
  | 'add-project'
  | 'settings'

export type ShortcutGroup = 'Sessions' | 'Panes and views' | 'Find and navigate' | 'App'

export interface ShortcutDef {
  id: ShortcutId
  label: string
  group: ShortcutGroup
  default: string | { mac: string; other: string }
}

export const defaultChord = (def: ShortcutDef, mac: boolean): string => (typeof def.default === 'string' ? def.default : mac ? def.default.mac : def.default.other)

export const SHORTCUT_GROUPS: ShortcutGroup[] = ['Sessions', 'Panes and views', 'Find and navigate', 'App']

export const SHORTCUTS: ShortcutDef[] = [
  { id: 'new-shell', label: 'New shell', group: 'Sessions', default: 'Mod+T' },
  { id: 'new-session', label: 'New session', group: 'Sessions', default: 'Mod+N' },
  { id: 'close-session', label: 'Close session', group: 'Sessions', default: 'Mod+W' },
  { id: 'restart-session', label: 'Restart session', group: 'Sessions', default: 'Mod+Shift+R' },
  { id: 'rename-session', label: 'Rename session', group: 'Sessions', default: 'F2' },
  { id: 'jump', label: 'Jump to session 1 to 9', group: 'Sessions', default: 'Mod+Digit' },
  { id: 'next-attention', label: 'Next session that needs you', group: 'Sessions', default: 'Mod+J' },
  // Letters and Tab only: brackets and backslash need AltGr on many layouts.
  { id: 'split-right', label: 'Split right with a new shell', group: 'Panes and views', default: 'Mod+Shift+D' },
  { id: 'split-down', label: 'Split down with a new shell', group: 'Panes and views', default: 'Mod+Shift+E' },
  { id: 'next-view', label: 'Next view', group: 'Panes and views', default: { mac: 'Ctrl+Tab', other: 'Mod+Tab' } },
  { id: 'prev-view', label: 'Previous view', group: 'Panes and views', default: { mac: 'Ctrl+Shift+Tab', other: 'Mod+Shift+Tab' } },
  { id: 'detach-pane', label: 'Move pane to its own view', group: 'Panes and views', default: 'Mod+Shift+U' },
  { id: 'find', label: 'Find in terminal', group: 'Find and navigate', default: 'Mod+F' },
  { id: 'palette', label: 'Command palette', group: 'Find and navigate', default: 'Mod+K' },
  { id: 'prompt-history', label: 'Prompt history', group: 'Find and navigate', default: 'Mod+Shift+H' },
  { id: 'notes', label: 'Notes', group: 'Find and navigate', default: 'Mod+Shift+N' },
  { id: 'redraw', label: 'Redraw the screen', group: 'App', default: 'Mod+Shift+L' },
  { id: 'toggle-sidebar', label: 'Toggle sidebar', group: 'App', default: 'Mod+B' },
  { id: 'add-project', label: 'Add folder', group: 'App', default: 'Mod+Shift+O' },
  { id: 'settings', label: 'Settings', group: 'App', default: 'Mod+,' }
]

export const shortcutDef = (id: ShortcutId): ShortcutDef => SHORTCUTS.find((s) => s.id === id)!

export type Keybindings = Partial<Record<ShortcutId, string | null>>

export type Bindings = Record<ShortcutId, string | null>

export function resolveBindings(overrides: Keybindings | undefined, mac: boolean): Bindings {
  const out = {} as Bindings
  for (const s of SHORTCUTS) {
    const o = overrides?.[s.id]
    out[s.id] = o === undefined ? defaultChord(s, mac) : o
  }
  return out
}

export type Modifier = 'Ctrl' | 'Alt' | 'Shift' | 'Mod'
const MODIFIER_ORDER: Modifier[] = ['Mod', 'Ctrl', 'Alt', 'Shift']

export interface Chord {
  mods: Modifier[]
  key: string
}

export function parseChord(chord: string): Chord {
  const m = /^((?:(?:Ctrl|Alt|Shift|Mod)\+)*)(.+)$/.exec(chord)
  if (!m) return { mods: [], key: chord }
  const mods = m[1].split('+').filter((x): x is Modifier => x !== '')
  return { mods: MODIFIER_ORDER.filter((x) => mods.includes(x)), key: m[2] }
}

export function formatChord(c: Chord): string {
  return [...MODIFIER_ORDER.filter((m) => c.mods.includes(m)), c.key].join('+')
}

export interface KeyLike {
  key: string
  code: string
  ctrlKey: boolean
  altKey: boolean
  shiftKey: boolean
  metaKey: boolean
}

const MODIFIER_KEYS = new Set(['Control', 'Shift', 'Alt', 'Meta', 'AltGraph', 'CapsLock', 'NumLock', 'ScrollLock', 'Fn', 'FnLock', 'OS', 'Hyper', 'Super', 'Symbol'])

const NAMED: Record<string, string> = {
  ' ': 'Space',
  Enter: 'Enter',
  Escape: 'Escape',
  Tab: 'Tab',
  Backspace: 'Backspace',
  Delete: 'Delete',
  Insert: 'Insert',
  Home: 'Home',
  End: 'End',
  PageUp: 'PageUp',
  PageDown: 'PageDown',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right'
}

const US_PUNCTUATION: Record<string, [string, string]> = {
  BracketLeft: ['[', '{'],
  BracketRight: [']', '}'],
  Backslash: ['\\', '|'],
  Semicolon: [';', ':'],
  Quote: ["'", '"'],
  Comma: [',', '<'],
  Period: ['.', '>'],
  Slash: ['/', '?'],
  Minus: ['-', '_'],
  Equal: ['=', '+'],
  Backquote: ['`', '~']
}

export function keyToken(e: KeyLike): string | null {
  if (MODIFIER_KEYS.has(e.key)) return null
  let m = /^Key([A-Z])$/.exec(e.code)
  if (m) return m[1]
  m = /^(?:Digit|Numpad)(\d)$/.exec(e.code)
  if (m && (e.key.length === 1 || e.code.startsWith('Digit'))) return m[1]
  if (/^F\d{1,2}$/.test(e.key)) return e.key
  const named = NAMED[e.key]
  if (named) return named
  const us = US_PUNCTUATION[e.code]
  if (us && (e.key === us[0] || e.key === us[1])) return us[0]
  if (e.key.length === 1) {
    const lower = e.key.toLowerCase()
    return lower !== e.key.toUpperCase() ? e.key.toUpperCase() : e.key
  }
  return null
}

export function chordFromEvent(e: KeyLike, mac: boolean): string | null {
  const key = keyToken(e)
  if (!key) return null
  const mods: Modifier[] = []
  if (mac && e.ctrlKey) mods.push('Ctrl')
  if (e.altKey) mods.push('Alt')
  if (e.shiftKey) mods.push('Shift')
  if (mac ? e.metaKey : e.ctrlKey) mods.push('Mod')
  return formatChord({ mods, key })
}

export interface ShortcutMatch {
  id: ShortcutId
  digit?: number
}

export function matchShortcut(e: KeyLike, bindings: Bindings, mac: boolean): ShortcutMatch | null {
  const chord = chordFromEvent(e, mac)
  if (!chord) return null
  const { mods, key } = parseChord(chord)
  const digit = /^[1-9]$/.test(key) ? formatChord({ mods, key: 'Digit' }) : null
  for (const s of SHORTCUTS) {
    const b = bindings[s.id]
    if (!b) continue
    if (b === chord) return { id: s.id }
    if (digit && b === digit) return { id: s.id, digit: Number(key) }
  }
  return null
}

export function reservedChords(mac: boolean): string[] {
  return mac ? ['Mod+C', 'Mod+V', 'Mod+Q'] : ['Mod+C', 'Mod+V', 'Mod+Shift+C', 'Mod+Shift+V']
}

export function validateChord(chord: string, mac: boolean): string | null {
  const { mods, key } = parseChord(chord)
  const alone = !mods.some((m) => m !== 'Shift')
  const fkey = /^F\d{1,2}$/.test(key)
  if (alone && !fkey) return mac ? 'Add ⌘, ⌃ or ⌥ to it' : 'Add Ctrl or Alt to it'
  if (reservedChords(mac).includes(chord)) return 'Reserved for copy and paste'
  return null
}

const KEY_LABELS: Record<string, string> = {
  Digit: '1…9',
  Up: '↑',
  Down: '↓',
  Left: '←',
  Right: '→',
  Escape: 'Esc'
}

export function displayParts(chord: string, mac: boolean): string[] {
  const { mods, key } = parseChord(chord)
  const order: Modifier[] = mac ? ['Ctrl', 'Alt', 'Shift', 'Mod'] : ['Mod', 'Ctrl', 'Alt', 'Shift']
  const names: Record<Modifier, string> = mac ? { Ctrl: '⌃', Alt: '⌥', Shift: '⇧', Mod: '⌘' } : { Ctrl: 'Ctrl', Alt: 'Alt', Shift: '⇧', Mod: 'Ctrl' }
  return [...order.filter((m) => mods.includes(m)).map((m) => names[m]), KEY_LABELS[key] ?? key]
}

export function displayChord(chord: string, mac: boolean): string {
  return displayParts(chord, mac).join(' ')
}

const ACCELERATOR_KEYS: Record<string, string> = {
  Up: 'Up',
  Down: 'Down',
  Left: 'Left',
  Right: 'Right',
  Enter: 'Return',
  Escape: 'Escape',
  Space: 'Space',
  Tab: 'Tab',
  Backspace: 'Backspace',
  Delete: 'Delete',
  Insert: 'Insert',
  Home: 'Home',
  End: 'End',
  PageUp: 'PageUp',
  PageDown: 'PageDown'
}

export function toAccelerator(chord: string | null | undefined): string | undefined {
  if (!chord) return undefined
  const { mods, key } = parseChord(chord)
  if (key === 'Digit') return undefined
  const names: Record<Modifier, string> = { Ctrl: 'Control', Alt: 'Alt', Shift: 'Shift', Mod: 'CommandOrControl' }
  return [...mods.map((m) => names[m]), ACCELERATOR_KEYS[key] ?? key].join('+')
}
