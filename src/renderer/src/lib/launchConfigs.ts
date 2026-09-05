import type { LaunchConfig, LaunchPane, LayoutNode, SplitDir } from '@shared/types'
import { leaf } from './layout'

export const blankPane = (cwd = ''): LaunchPane => ({ cwd, presetId: 'shell', runOnStart: '' })

export function newLaunchConfig(cwd = ''): LaunchConfig {
  const id = `w${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
  return { id, name: 'New workspace', split: 'row', panes: [blankPane(cwd)] }
}

/** Panes in one direction with even shares: the first takes 1/n, the rest split what is left the same way. */
export function layoutFor(ids: string[], dir: SplitDir): LayoutNode {
  if (ids.length === 1) return leaf(ids[0])
  const [first, ...rest] = ids
  return { kind: 'split', dir, ratio: 1 / ids.length, a: leaf(first), b: layoutFor(rest, dir) }
}

/** "Workspace · folder": the view tab reads the workspace, each sidebar row says which pane it is. */
export function paneTitle(config: LaunchConfig, pane: LaunchPane): string {
  const folder = pane.cwd.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || pane.cwd
  return `${config.name.trim() || 'Workspace'} · ${folder}`
}

/** Panes that can actually open: a folder is the one thing a pane cannot do without. */
export function openablePanes(config: LaunchConfig): LaunchPane[] {
  return config.panes.filter((p) => p.cwd.trim().length > 0)
}

/** A link name: lower case, words joined by dashes, nothing else. "Demo stack" becomes "demo-stack". */
export function slugOf(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
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
