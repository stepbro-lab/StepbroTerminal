import type { Terminal } from '@xterm/xterm'

interface Spot {
  clientX: number
  clientY: number
}

export function pressOutcome(from: Spot, to: Spot, slop = 3): 'click' | 'drag' {
  return Math.abs(to.clientX - from.clientX) > slop || Math.abs(to.clientY - from.clientY) > slop ? 'drag' : 'click'
}

export function selectionKey(platform: string): 'altKey' | 'shiftKey' {
  return platform === 'darwin' ? 'altKey' : 'shiftKey'
}

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

export function pressGoesToTheProgram(container: HTMLElement, term: Terminal, platform: string, onPress?: (ev: MouseEvent) => void): void {
  container.addEventListener(
    'mousedown',
    (ev) => {
      if (ev.isTrusted) onPress?.(ev)
      if (!ev.isTrusted || ev.button !== 0 || ev.shiftKey || term.modes.mouseTrackingMode === 'none') return
      if (platform === 'darwin' && ev.altKey) return
      ev.stopPropagation()
      // Otherwise focus leaves the terminal, the program repaints and xterm drops the selection.
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
