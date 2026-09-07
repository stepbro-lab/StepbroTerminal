import { useEffect, useRef } from 'react'
import { registry } from './TerminalRegistry'
import { paneMotionSettled } from '@/lib/paneMotion'

/**
 * Mounts the session's xterm into the given element and attaches to the host while visible.
 * Re-runs when the host connection comes back so a fresh host replays its buffer.
 */
export function useTerminalMount(id: string | null, connected: boolean): React.RefObject<HTMLDivElement | null> {
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const el = ref.current
    if (!id || !el || !connected) return
    let cancelled = false
    let ro: ResizeObserver | null = null
    let t = 0
    // A terminal that already exists just re-attaches, cheaply; building a new one waits for the
    // panes to stop moving, or its work would stall their travel.
    const ready = registry.get(id) ? registry.fontsReady() : Promise.all([registry.fontsReady(), paneMotionSettled()])
    void ready.then(() => {
      if (cancelled) return
      const entry = registry.mount(id, el)
      registry.markDetached(id)
      window.step.send('host:resize', id, entry.term.cols, entry.term.rows)
      window.step.send('host:attach', id)
      ro = new ResizeObserver(() => registry.fit(id))
      ro.observe(el)
      // A second fit once layout settles.
      t = window.setTimeout(() => registry.fit(id), 80)
    })
    return () => {
      cancelled = true
      window.clearTimeout(t)
      ro?.disconnect()
      if (registry.get(id)?.mounted) {
        registry.unmount(id)
        window.step.send('host:detach', id)
      }
    }
  }, [id, connected])

  return ref
}
