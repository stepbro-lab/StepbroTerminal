import type { MenuItemSpec } from '@shared/types'

/** Shows a native context menu and resolves with the clicked item id (or null). */
export function popup(items: MenuItemSpec[]): Promise<string | null> {
  return window.step.invoke('menu:popup', items)
}

export const sep: MenuItemSpec = { separator: true }
