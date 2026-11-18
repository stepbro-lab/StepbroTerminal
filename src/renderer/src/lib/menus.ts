import type { MenuItemSpec } from '@shared/types'
import { useMenu, type MenuPosition } from '@/components/ContextMenu'

export function popup(items: MenuItemSpec[], pos: MenuPosition = {}): Promise<string | null> {
  return useMenu.getState().open(items, pos)
}

export const sep: MenuItemSpec = { separator: true }
