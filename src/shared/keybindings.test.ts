import { describe, expect, it } from 'vitest'
import { chordFromEvent, displayParts, matchShortcut, parseChord, resolveBindings, toAccelerator, validateChord, type KeyLike } from './keybindings'

const ev = (over: Partial<KeyLike>): KeyLike => ({ key: '', code: '', ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, ...over })

describe('chordFromEvent', () => {
  it('reads Ctrl as Mod on Windows and Cmd as Mod on a Mac', () => {
    expect(chordFromEvent(ev({ key: 't', code: 'KeyT', ctrlKey: true }), false)).toBe('Mod+T')
    expect(chordFromEvent(ev({ key: 't', code: 'KeyT', metaKey: true }), true)).toBe('Mod+T')
    expect(chordFromEvent(ev({ key: 't', code: 'KeyT', ctrlKey: true }), true)).toBe('Ctrl+T')
  })

  it('writes shifted punctuation the way the chord is written', () => {
    expect(chordFromEvent(ev({ key: '}', code: 'BracketRight', ctrlKey: true, shiftKey: true }), false)).toBe('Mod+Shift+]')
    expect(chordFromEvent(ev({ key: '|', code: 'Backslash', ctrlKey: true, shiftKey: true }), false)).toBe('Mod+Shift+\\')
    expect(chordFromEvent(ev({ key: '\\', code: 'Backslash', ctrlKey: true }), false)).toBe('Mod+\\')
  })

  it('takes letters and digits from the physical key, so Caps Lock and Shift do not matter', () => {
    expect(chordFromEvent(ev({ key: 'H', code: 'KeyH', ctrlKey: true, shiftKey: true }), false)).toBe('Mod+Shift+H')
    expect(chordFromEvent(ev({ key: '!', code: 'Digit1', ctrlKey: true, shiftKey: true }), false)).toBe('Mod+Shift+1')
  })

  it('is null while only a modifier is down', () => {
    expect(chordFromEvent(ev({ key: 'Control', code: 'ControlLeft', ctrlKey: true }), false)).toBeNull()
    expect(chordFromEvent(ev({ key: 'Shift', code: 'ShiftLeft', shiftKey: true }), false)).toBeNull()
  })

  it('names special keys', () => {
    expect(chordFromEvent(ev({ key: 'F2', code: 'F2' }), false)).toBe('F2')
    expect(chordFromEvent(ev({ key: ' ', code: 'Space', altKey: true }), false)).toBe('Alt+Space')
    expect(chordFromEvent(ev({ key: 'ArrowUp', code: 'ArrowUp', ctrlKey: true, altKey: true }), false)).toBe('Mod+Alt+Up')
  })

  it('keeps AltGr characters apart from Ctrl chords', () => {
    // AltGr arrives as Ctrl+Alt on Windows; "@" on a Spanish layout must not look like Ctrl+2.
    expect(chordFromEvent(ev({ key: '@', code: 'Digit2', ctrlKey: true, altKey: true }), false)).toBe('Mod+Alt+2')
  })
})

describe('matchShortcut', () => {
  const defaults = resolveBindings(undefined, false)

  it('finds the default shortcuts', () => {
    expect(matchShortcut(ev({ key: 'k', code: 'KeyK', ctrlKey: true }), defaults, false)).toEqual({ id: 'palette' })
    expect(matchShortcut(ev({ key: 'Tab', code: 'Tab', ctrlKey: true }), defaults, false)).toEqual({ id: 'next-view' })
    expect(matchShortcut(ev({ key: 'Tab', code: 'Tab', ctrlKey: true, shiftKey: true }), defaults, false)).toEqual({ id: 'prev-view' })
    expect(matchShortcut(ev({ key: 'D', code: 'KeyD', ctrlKey: true, shiftKey: true }), defaults, false)).toEqual({ id: 'split-right' })
    expect(matchShortcut(ev({ key: 'F2', code: 'F2' }), defaults, false)).toEqual({ id: 'rename-session' })
  })

  it('reports the digit for the jump shortcut', () => {
    expect(matchShortcut(ev({ key: '3', code: 'Digit3', ctrlKey: true }), defaults, false)).toEqual({ id: 'jump', digit: 3 })
    expect(matchShortcut(ev({ key: '0', code: 'Digit0', ctrlKey: true }), defaults, false)).toBeNull()
  })

  it('honours overrides, including "no key"', () => {
    const b = resolveBindings({ palette: 'Alt+P', jump: 'Alt+Digit', find: null }, false)
    expect(matchShortcut(ev({ key: 'k', code: 'KeyK', ctrlKey: true }), b, false)).toBeNull()
    expect(matchShortcut(ev({ key: 'p', code: 'KeyP', altKey: true }), b, false)).toEqual({ id: 'palette' })
    expect(matchShortcut(ev({ key: '5', code: 'Digit5', altKey: true }), b, false)).toEqual({ id: 'jump', digit: 5 })
    expect(matchShortcut(ev({ key: 'f', code: 'KeyF', ctrlKey: true }), b, false)).toBeNull()
  })

  it('gives the Mac its own view chords, since Cmd+Tab is the app switcher', () => {
    const mac = resolveBindings(undefined, true)
    expect(mac['next-view']).toBe('Ctrl+Tab')
    expect(matchShortcut(ev({ key: 'Tab', code: 'Tab', ctrlKey: true }), mac, true)).toEqual({ id: 'next-view' })
    expect(matchShortcut(ev({ key: 'Tab', code: 'Tab', metaKey: true }), mac, true)).toBeNull()
  })

  it('ignores plain typing', () => {
    expect(matchShortcut(ev({ key: 't', code: 'KeyT' }), defaults, false)).toBeNull()
    expect(matchShortcut(ev({ key: 'T', code: 'KeyT', shiftKey: true }), defaults, false)).toBeNull()
  })
})

describe('validateChord', () => {
  it('wants a real modifier unless it is a function key', () => {
    expect(validateChord('T', false)).toMatch(/Ctrl or Alt/)
    expect(validateChord('Shift+T', false)).toMatch(/Ctrl or Alt/)
    expect(validateChord('F5', false)).toBeNull()
    expect(validateChord('Shift+F5', false)).toBeNull()
    expect(validateChord('Alt+T', false)).toBeNull()
  })

  it('keeps copy and paste for the terminal', () => {
    expect(validateChord('Mod+V', false)).toMatch(/copy and paste/)
    expect(validateChord('Mod+Shift+C', false)).toMatch(/copy and paste/)
    expect(validateChord('Mod+C', true)).toMatch(/copy and paste/)
    expect(validateChord('Mod+Shift+C', true)).toBeNull()
  })
})

describe('display and accelerators', () => {
  it('prints key caps in the platform order', () => {
    expect(displayParts('Mod+Shift+H', false)).toEqual(['Ctrl', '⇧', 'H'])
    expect(displayParts('Alt+Shift+Mod+H', false)).toEqual(['Ctrl', 'Alt', '⇧', 'H'])
    expect(displayParts('Ctrl+Shift+Mod+H', true)).toEqual(['⌃', '⇧', '⌘', 'H'])
    expect(displayParts('Mod+Digit', false)).toEqual(['Ctrl', '1…9'])
    expect(displayParts('F2', true)).toEqual(['F2'])
  })

  it('round-trips a chord whose key is "+"', () => {
    expect(parseChord('Mod++')).toEqual({ mods: ['Mod'], key: '+' })
  })

  it('builds Electron accelerators', () => {
    expect(toAccelerator('Mod+Shift+O')).toBe('CommandOrControl+Shift+O')
    expect(toAccelerator('Mod+\\')).toBe('CommandOrControl+\\')
    expect(toAccelerator('Mod+Alt+Up')).toBe('CommandOrControl+Alt+Up')
    expect(toAccelerator('F2')).toBe('F2')
    expect(toAccelerator('Mod+Digit')).toBeUndefined()
    expect(toAccelerator(null)).toBeUndefined()
  })
})

