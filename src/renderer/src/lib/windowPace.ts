import { useSyncExternalStore } from 'react'

export type Pace = 'live' | 'slow' | 'off'

export function paceFor(visible: boolean, focused: boolean): Pace {
  if (!visible) return 'off'
  return focused ? 'live' : 'slow'
}

let pace: Pace = 'live'
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
