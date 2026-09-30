import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { create } from 'zustand'
import { ChevronRight } from 'lucide-react'
import type { MenuItemSpec } from '@shared/types'

export interface MenuPosition {
  x?: number
  y?: number
  anchor?: HTMLElement | null
}

interface MenuState {
  items: MenuItemSpec[] | null
  pos: MenuPosition
  resolve: ((id: string | null) => void) | null
  open: (items: MenuItemSpec[], pos: MenuPosition) => Promise<string | null>
  close: (id: string | null) => void
}

export const useMenu = create<MenuState>((set, get) => ({
  items: null,
  pos: {},
  resolve: null,
  open: (items, pos) => {
    get().close(null)
    return new Promise((resolve) => set({ items, pos, resolve }))
  },
  close: (id) => {
    const r = get().resolve
    set({ items: null, resolve: null })
    r?.(id)
  }
}))

let lastMouse = { x: 0, y: 0 }
window.addEventListener('pointermove', (e) => (lastMouse = { x: e.clientX, y: e.clientY }), { passive: true, capture: true })
window.addEventListener('pointerdown', (e) => (lastMouse = { x: e.clientX, y: e.clientY }), { passive: true, capture: true })

/** In-app menu that follows the app's own design instead of the OS one. Mounted once in App. */
export function ContextMenu() {
  const items = useMenu((s) => s.items)
  const pos = useMenu((s) => s.pos)
  const close = useMenu((s) => s.close)
  if (!items) return null
  return (
    <div
      className="absolute inset-0 z-50"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close(null)
      }}
      onContextMenu={(e) => {
        e.preventDefault()
        close(null)
      }}
    >
      <MenuPanel items={items} pos={pos} onPick={close} onClose={() => close(null)} />
    </div>
  )
}

function MenuPanel({
  items,
  pos,
  onPick,
  onClose,
  depth = 0
}: {
  items: MenuItemSpec[]
  pos: MenuPosition
  onPick: (id: string | null) => void
  onClose: () => void
  depth?: number
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [xy, setXy] = useState<{ left: number; top: number } | null>(null)
  const [cursor, setCursor] = useState(-1)
  const [openSub, setOpenSub] = useState<number | null>(null)
  const selectable = items.map((it, i) => (!it.separator && it.enabled !== false ? i : -1)).filter((i) => i >= 0)

  // Position: anchored under an element, or at the pointer; keep inside the window.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    if (depth > 0) {
      setXy({ left: 0, top: 0 })
      return
    }
    const { width, height } = el.getBoundingClientRect()
    let left: number
    let top: number
    if (pos.anchor) {
      const r = pos.anchor.getBoundingClientRect()
      left = r.right - width
      top = r.bottom + 4
    } else {
      left = pos.x ?? lastMouse.x
      top = pos.y ?? lastMouse.y
    }
    const margin = 8
    left = Math.max(margin, Math.min(left, window.innerWidth - width - margin))
    top = Math.max(margin, Math.min(top, window.innerHeight - height - margin))
    setXy({ left, top })
  }, [pos, items, depth])

  useEffect(() => {
    if (depth > 0) return
    const onKey = (e: KeyboardEvent): void => {
      e.stopPropagation()
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        if (!selectable.length) return
        const idx = selectable.indexOf(cursor)
        const next = e.key === 'ArrowDown' ? selectable[(idx + 1) % selectable.length] : selectable[(idx - 1 + selectable.length) % selectable.length]
        setCursor(next)
      } else if (e.key === 'Enter' && cursor >= 0) {
        const it = items[cursor]
        if (it.submenu) setOpenSub(cursor)
        else onPick(it.id ?? null)
      }
    }
    window.addEventListener('keydown', onKey, true)
    const onBlur = (): void => onClose()
    window.addEventListener('blur', onBlur)
    window.addEventListener('resize', onBlur)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('blur', onBlur)
      window.removeEventListener('resize', onBlur)
    }
  }, [cursor, items, selectable, onClose, onPick, depth])

  return (
    <div
      ref={ref}
      className="fade-in absolute min-w-[188px] rounded-[var(--radius-pop)] p-1"
      style={{
        left: xy?.left ?? -9999,
        top: xy?.top ?? -9999,
        background: 'var(--bg-elevated)',
        boxShadow: '0 0 0 1px var(--border-strong) inset, var(--shadow-pop)',
        visibility: xy ? 'visible' : 'hidden'
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {items.map((it, i) => {
        if (it.separator) return <div key={i} className="mx-2 my-1 h-px" style={{ background: 'var(--border)' }} />
        const disabled = it.enabled === false
        const hasSub = !!it.submenu?.length
        const highlighted = cursor === i || openSub === i
        return (
          <div key={i} className="relative">
            <button
              className="flex h-7 w-full items-center gap-2 rounded-[6px] px-2.5 text-left text-[13px]"
              disabled={disabled}
              style={{
                color: disabled ? 'var(--text-faint)' : 'var(--text)',
                background: highlighted && !disabled ? 'var(--bg-active)' : undefined
              }}
              onMouseEnter={() => {
                setCursor(i)
                setOpenSub(hasSub ? i : null)
              }}
              onClick={() => {
                if (disabled) return
                if (hasSub) setOpenSub(i)
                else onPick(it.id ?? null)
              }}
            >
              <span className="flex-1 truncate">{it.label}</span>
              {it.shortcut && <span className="ml-4 shrink-0 text-[11.5px] tabular-nums text-muted">{it.shortcut}</span>}
              {it.checked && <span className="text-[11.5px] text-muted">✓</span>}
              {hasSub && <ChevronRight size={13} className="text-muted" />}
            </button>
            {hasSub && openSub === i && (
              <div className="absolute top-0" style={{ left: 'calc(100% - 2px)' }}>
                <MenuPanel items={it.submenu!} pos={{ x: 0, y: 0 }} onPick={onPick} onClose={onClose} depth={depth + 1} />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
