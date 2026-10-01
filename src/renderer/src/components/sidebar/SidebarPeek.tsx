import { useEffect } from 'react'
import { usePrefs } from '@/stores/prefs'
import { useUi } from '@/stores/ui'
import { useMenu } from '../ContextMenu'
import { PeekController } from '@/lib/sidebarPeek'

/**
 * With the sidebar folded away, the left edge of the window brings it out for a look, the way Arc
 * and Zen do it. It opens in its own place, as it does when unfolded, so nothing is covered: the
 * terminals make room while it is out and take it back after, refitting once each way.
 *
 * It comes out once the pointer has rested a moment in the thin strip along the edge, or has left
 * the window across that edge, below the window's buttons and with no button held. It stays out
 * while the pointer is on it, while a menu opened from it is up, while a session is being dragged
 * out of it and while something in it is being typed into; and goes back a moment after the
 * pointer leaves it, at once on a click or a key elsewhere, and when the window loses focus. Once it
 * has gone back with the pointer still at the edge, the pointer has to leave the edge and come
 * back before it counts again. The sidebar shortcut, or its button in the top bar, keeps it out for good.
 */
export function SidebarPeek() {
  const enabled = usePrefs((s) => s.prefs?.edgePeek !== false)
  const collapsed = usePrefs((s) => s.prefs?.sidebarCollapsed ?? false)
  const settingsOpen = useUi((s) => s.settingsOpen)
  const active = enabled && collapsed && !settingsOpen

  useEffect(() => {
    const set = useUi.getState().setSidebarPeek
    if (!active) {
      set(false)
      return
    }
    const panel = (): HTMLElement | null => document.querySelector('aside[data-peek]')
    const peek = new PeekController({
      isOpen: () => useUi.getState().sidebarPeek,
      setOpen: set,
      panel: () => panel()?.getBoundingClientRect() ?? null,
      held: () => {
        if (useMenu.getState().items) return true
        const a = document.activeElement
        return !!a && !!panel()?.contains(a) && a.matches('input, textarea, [contenteditable]')
      }
    })
    const onMove = (e: MouseEvent): void => peek.move(e.clientX, e.clientY, e.buttons)
    const onLeave = (e: MouseEvent): void => peek.leave(e.clientX, e.clientY, e.buttons)
    const onDown = (e: MouseEvent): void => peek.press(!!(e.target as Element | null)?.closest?.('aside[data-peek], [data-menu-layer]'))
    const onKey = (e: KeyboardEvent): void => peek.key(e.key === 'Escape', !!panel()?.contains(e.target as Node), !!useMenu.getState().items)
    const onBlur = (): void => peek.blur()
    const onDragStart = (e: DragEvent): void => peek.dragStart(!!panel()?.contains(e.target as Node))
    const onDragEnd = (): void => peek.dragEnd()
    const offMenu = useMenu.subscribe((m, prev) => {
      if (prev.items && !m.items) peek.menuClosed()
    })
    document.addEventListener('mousemove', onMove)
    document.documentElement.addEventListener('mouseleave', onLeave)
    document.addEventListener('mousedown', onDown, true)
    document.addEventListener('keydown', onKey, true)
    document.addEventListener('dragstart', onDragStart, true)
    document.addEventListener('dragend', onDragEnd, true)
    window.addEventListener('blur', onBlur)
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.documentElement.removeEventListener('mouseleave', onLeave)
      document.removeEventListener('mousedown', onDown, true)
      document.removeEventListener('keydown', onKey, true)
      document.removeEventListener('dragstart', onDragStart, true)
      document.removeEventListener('dragend', onDragEnd, true)
      window.removeEventListener('blur', onBlur)
      offMenu()
      peek.dispose()
      set(false)
    }
  }, [active])

  return null
}
