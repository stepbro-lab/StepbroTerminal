import type { MenuItemSpec } from '@shared/types'
import { useMenu, type MenuPosition } from '@/components/ContextMenu'

/**
 * Shows the app's own context menu and resolves with the picked item id (null when dismissed).
 * Without a position it opens at the pointer; pass `anchor` to hang it under a button.
 */
export function popup(items: MenuItemSpec[], pos: MenuPosition = {}): Promise<string | null> {
  return useMenu.getState().open(items, pos)
}

export const sep: MenuItemSpec = { separator: true }
