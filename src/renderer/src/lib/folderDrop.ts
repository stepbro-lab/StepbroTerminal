import { useCallback, useEffect, useRef, useState } from 'react'
import type React from 'react'

/** True while the drag carries files or folders from the desktop rather than one of our rows. */
export function hasFiles(dt: DataTransfer | null): boolean {
  return !!dt && Array.from(dt.types).includes('Files')
}

/**
 * Absolute paths of the folders in a drop; plain files are ignored. Chromium only exposes the
 * directory flag on drop, never during dragover, so the highlight lights up for any file drag.
 */
export function droppedFolders(dt: DataTransfer | null): string[] {
  if (!dt) return []
  const out: string[] = []
  for (const item of Array.from(dt.items)) {
    if (item.kind !== 'file') continue
    const entry = item.webkitGetAsEntry?.()
    if (!entry?.isDirectory) continue
    const file = item.getAsFile()
    const p = file ? window.step.pathForFile(file) : ''
    if (p) out.push(p)
  }
  return out
}

export interface FolderDropProps {
  onDragEnter: React.DragEventHandler
  onDragOver: React.DragEventHandler
  onDragLeave: React.DragEventHandler
  onDrop: React.DragEventHandler
}

/**
 * Lets an element take folders dragged in from the desktop. `over` is true while a file drag
 * hovers it or any of its children, for a highlight; `onFolders` gets the folder paths on drop.
 */
export function useFolderDrop(onFolders: (paths: string[]) => void): { over: boolean; props: FolderDropProps } {
  const [over, setOver] = useState(false)
  // dragenter/dragleave fire for every child crossed; only the outermost leave ends the hover.
  const depth = useRef(0)
  const reset = useCallback(() => {
    depth.current = 0
    setOver(false)
  }, [])

  useEffect(() => {
    // Leaving the window skips our dragleave, and a drop elsewhere ends the drag for everyone.
    const onLeaveWindow = (e: DragEvent): void => {
      if (e.relatedTarget === null) reset()
    }
    document.addEventListener('dragleave', onLeaveWindow)
    document.addEventListener('drop', reset)
    return () => {
      document.removeEventListener('dragleave', onLeaveWindow)
      document.removeEventListener('drop', reset)
    }
  }, [reset])

  const onDragEnter = useCallback((e: React.DragEvent) => {
    if (!hasFiles(e.dataTransfer)) return
    e.preventDefault()
    depth.current += 1
    setOver(true)
  }, [])
  const onDragOver = useCallback((e: React.DragEvent) => {
    if (!hasFiles(e.dataTransfer)) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }, [])
  const onDragLeave = useCallback((e: React.DragEvent) => {
    if (!hasFiles(e.dataTransfer)) return
    depth.current = Math.max(0, depth.current - 1)
    if (depth.current === 0) setOver(false)
  }, [])
  const onDrop = useCallback(
    (e: React.DragEvent) => {
      if (!hasFiles(e.dataTransfer)) return
      e.preventDefault()
      e.stopPropagation()
      reset()
      const folders = droppedFolders(e.dataTransfer)
      if (folders.length) onFolders(folders)
    },
    [onFolders, reset]
  )

  return { over, props: { onDragEnter, onDragOver, onDragLeave, onDrop } }
}
