import type { Terminal } from '@xterm/xterm'

interface Spot {
  clientX: number
  clientY: number
}

/**
 * Whether a press that has come up was a click or the start of a drag. A hand never holds
 * perfectly still, so a couple of pixels of travel is still the same spot.
 */
export function pressOutcome(from: Spot, to: Spot, slop = 3): 'click' | 'drag' {
  return Math.abs(to.clientX - from.clientX) > slop || Math.abs(to.clientY - from.clientY) > slop ? 'drag' : 'click'
}

/**
 * The key that makes xterm take a press as the start of a selection rather than something for the
 * program: Option on a Mac, where it also has to be allowed to, and Shift everywhere else.
 */
export function selectionKey(platform: string): 'altKey' | 'shiftKey' {
  return platform === 'darwin' ? 'altKey' : 'shiftKey'
}

/** The same press again, as the terminal should see it. */
function again(from: MouseEvent, type: 'mousedown' | 'mouseup', forcing: 'altKey' | 'shiftKey' | null, buttons: number): MouseEvent {
  return new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    shiftKey: forcing === 'shiftKey' || from.shiftKey,
    altKey: forcing === 'altKey' || from.altKey,
    button: 0,
    buttons,
    detail: from.detail,
    clientX: from.clientX,
    clientY: from.clientY,
    screenX: from.screenX,
    screenY: from.screenY,
    ctrlKey: from.ctrlKey,
    metaKey: from.metaKey
  })
}

/**
 * What a press means while a program owns the mouse, such as an agent that takes it for scrolling
 * or for the buttons it draws.
 *
 * Dragging selects text, which xterm only allows with Shift held, so the press is replayed as if
 * it were; but replayed that way at once, a press that turns out to be a plain click never reaches
 * the program, and the buttons a TUI draws did nothing. So the press waits: moved, it becomes the
 * selection it was going to be, anchored where it started; let go without moving, it goes to the
 * program as the click it was, press and release together. A second click of a double still
 * selects a word, which is worth more there than a double-click nothing reads.
 *
 * Only presses from a hand are held back; the ones made here go straight through, or they would
 * come back around for ever.
 */
export function pressGoesToTheProgram(container: HTMLElement, term: Terminal, platform: string, onPress?: () => void): void {
  container.addEventListener(
    'mousedown',
    (ev) => {
      if (ev.isTrusted) onPress?.()
      if (!ev.isTrusted || ev.button !== 0 || ev.shiftKey || term.modes.mouseTrackingMode === 'none') return
      if (platform === 'darwin' && ev.altKey) return
      ev.stopPropagation()
      // Without this the browser moves focus off the terminal, xterm reports the focus loss, the
      // program repaints and re-enables the mouse, and xterm drops the selection it just started.
      ev.preventDefault()
      const target = ev.target as Element | null
      const selecting = selectionKey(platform)
      if (ev.detail > 1) {
        target?.dispatchEvent(again(ev, 'mousedown', selecting, 1))
        return
      }
      let settled = false
      const stop = (): void => {
        settled = true
        window.removeEventListener('mousemove', moved, true)
        window.removeEventListener('mouseup', up, true)
      }
      const moved = (m: MouseEvent): void => {
        if (settled || pressOutcome(ev, m) === 'click') return
        stop()
        target?.dispatchEvent(again(ev, 'mousedown', selecting, 1))
      }
      const up = (u: MouseEvent): void => {
        if (settled) return
        stop()
        if (pressOutcome(ev, u) === 'drag') return
        target?.dispatchEvent(again(ev, 'mousedown', null, 1))
        target?.dispatchEvent(again(ev, 'mouseup', null, 0))
      }
      window.addEventListener('mousemove', moved, true)
      window.addEventListener('mouseup', up, true)
    },
    true
  )
}
