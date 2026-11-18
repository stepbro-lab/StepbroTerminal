import { useEffect } from 'react'
import { usePrefs } from '@/stores/prefs'
import { useUi } from '@/stores/ui'
import { useMenu } from '../ContextMenu'
import { PeekController } from '@/lib/sidebarPeek'

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
