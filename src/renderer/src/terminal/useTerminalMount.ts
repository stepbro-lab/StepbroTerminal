import { useEffect, useRef } from 'react'
import { registry } from './TerminalRegistry'
import { paneMotionSettled } from '@/lib/paneMotion'

export function useTerminalMount(id: string | null, connected: boolean): React.RefObject<HTMLDivElement | null> {
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const el = ref.current
    if (!id || !el || !connected) return
    let cancelled = false
    let ro: ResizeObserver | null = null
    let t = 0
    const ready = registry.get(id) ? registry.fontsReady() : Promise.all([registry.fontsReady(), paneMotionSettled()])
    void ready.then(() => {
      if (cancelled) return
      const entry = registry.mount(id, el)
      registry.markDetached(id)
      window.step.send('host:resize', id, entry.term.cols, entry.term.rows)
      window.step.send('host:attach', id)
      ro = new ResizeObserver(() => registry.fit(id))
      ro.observe(el)
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
