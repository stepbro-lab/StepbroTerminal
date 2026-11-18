import { useCallback, useEffect, useState } from 'react'
import type React from 'react'
import { useUi } from '@/stores/ui'
import type { SidebarProject, SidebarSession } from '@/lib/sidebarModel'
import { movedIds } from '@/lib/reorder'
import { reorderSessions } from '@/lib/actions'
import { DRAG_TYPE } from '../pane/TerminalPane'

export interface Insert {
  id: string
  after: boolean
}

interface Plan {
  allowed: boolean
  ids: string[] | null
  after: boolean
}

export function useReorder(model: SidebarProject[], beforeMove: () => void) {
  const dragging = useUi((s) => s.dragging)
  const [insert, setInsert] = useState<Insert | null>(null)

  useEffect(() => {
    if (!dragging) setInsert(null)
  }, [dragging])

  const plan = useCallback(
    (row: SidebarSession, e: React.DragEvent): Plan => {
      const blocked: Plan = { allowed: false, ids: null, after: false }
      const from = dragging || e.dataTransfer.getData(DRAG_TYPE)
      const project = model.find((p) => p.sessions.some((s) => s.id === row.id))
      const source = project?.sessions.find((s) => s.id === from)
      if (!from || !project || !source || source.pinned !== row.pinned) return blocked
      const r = e.currentTarget.getBoundingClientRect()
      const after = e.clientY > r.top + r.height / 2
      if (source.view !== row.view) {
        if (source.view !== null) return blocked
        const box = project.sessions.filter((s) => s.view === row.view)
        const edge = after ? box[box.length - 1] : box[0]
        if (edge.id !== row.id) return blocked
      }
      return { allowed: true, ids: movedIds(project.sessions, from, row.id, after), after }
    },
    [dragging, model]
  )

  const onDragOver = useCallback(
    (row: SidebarSession, e: React.DragEvent) => {
      if (!e.dataTransfer.types.includes(DRAG_TYPE)) return
      const { allowed, ids, after } = plan(row, e)
      if (!allowed) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      const next = ids ? { id: row.id, after } : null
      setInsert((prev) => (prev?.id === next?.id && prev?.after === next?.after ? prev : next))
    },
    [plan]
  )

  const onDrop = useCallback(
    (row: SidebarSession, e: React.DragEvent) => {
      if (!e.dataTransfer.types.includes(DRAG_TYPE)) return
      const { allowed, ids } = plan(row, e)
      if (!allowed) return
      e.preventDefault()
      e.stopPropagation()
      setInsert(null)
      useUi.getState().setDragging(null)
      if (!ids) return
      beforeMove()
      reorderSessions(ids)
    },
    [plan, beforeMove]
  )

  const onDragLeave = useCallback((e: React.DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setInsert(null)
  }, [])

  return { insert, onDragOver, onDrop, onDragLeave }
}
