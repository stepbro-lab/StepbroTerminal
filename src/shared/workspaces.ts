import type { LaunchConfig, LaunchPane } from './types'

/**
 * What the window and the main process both need to know about saved workspaces: the link each
 * one answers to, and how a name, a link name or an id finds it. Settings, step:// links and the
 * agents' tools all go through these, so they always agree on which workspace is which.
 */

/** A new workspace id: short, and unique enough on one machine. */
export function newWorkspaceId(): string {
  return `w${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

/** Panes that can actually open: a folder is the one thing a pane cannot do without. */
export function openablePanes(config: LaunchConfig): LaunchPane[] {
  return config.panes.filter((p) => p.cwd.trim().length > 0)
}

/** A link name: lower case, words joined by dashes, nothing else. "Demo stack" becomes "demo-stack". */
export function slugOf(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** The step:// link that opens this workspace from a shortcut or a script, even when the app is closed. */
export function workspaceUrl(config: LaunchConfig): string {
  return `step://workspace/${slugOf(config.name) || config.id}`
}

/** The workspace a link names: by id, or by name ignoring case, spaces and punctuation. */
export function findWorkspace(configs: LaunchConfig[], key: string): LaunchConfig | undefined {
  const k = key.trim()
  return configs.find((c) => c.id === k) ?? configs.find((c) => slugOf(c.name) === slugOf(k))
}
