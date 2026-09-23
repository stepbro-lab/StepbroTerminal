import { useSyncExternalStore } from 'react'

/**
 * How much of the window can be seen, for everything that moves on its own: the terminals being
 * drawn, the spinners of sessions at work.
 *
 * The page is kept running at full speed whatever becomes of the window, because the host waits
 * on it to read what the programs print. So nothing slows down by itself when the window goes
 * behind another or is minimised, and an agent at work kept the window drawing a dozen frames a
 * second where nobody could see them: that is what put the app on the Mac's list of apps using
 * significant energy. Whatever animates asks this how often it is worth it.
 */

export type Pace = 'live' | 'slow' | 'off'

/** In front and live; visible but not in front, slowed down; out of sight, still. */
export function paceFor(visible: boolean, focused: boolean): Pace {
  if (!visible) return 'off'
  return focused ? 'live' : 'slow'
}

let pace: Pace = 'live'
/** What the main process last said: the page itself is told it is visible even when minimised. */
let seen = true
const listeners = new Set<(pace: Pace) => void>()
let watching = false

function update(): void {
  const next = paceFor(seen && document.visibilityState === 'visible', document.hasFocus())
  if (next === pace) return
  pace = next
  for (const l of listeners) l(pace)
}

function watch(): void {
  if (watching) return
  watching = true
  window.step.on('win:seen', (v) => {
    seen = v
    update()
  })
  document.addEventListener('visibilitychange', update)
  window.addEventListener('focus', update)
  window.addEventListener('blur', update)
  update()
}

export function currentPace(): Pace {
  watch()
  return pace
}

/** Calls back each time the pace changes. Returns what stops it. */
export function onPace(listener: (pace: Pace) => void): () => void {
  watch()
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function usePace(): Pace {
  return useSyncExternalStore(onPace, currentPace)
}
