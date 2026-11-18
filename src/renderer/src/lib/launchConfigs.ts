import type { LaunchConfig, LaunchPane, LayoutNode, SplitDir } from '@shared/types'
import { newWorkspaceId } from '@shared/workspaces'
import { leaf } from './layout'
import { t } from './i18n'

export { findWorkspace, openablePanes, slugOf, workspaceUrl } from '@shared/workspaces'

export const blankPane = (cwd = ''): LaunchPane => ({ cwd, presetId: 'shell', runOnStart: '' })

export function newLaunchConfig(cwd = ''): LaunchConfig {
  return { id: newWorkspaceId(), name: t('New workspace'), split: 'row', panes: [blankPane(cwd)] }
}

export function layoutFor(ids: string[], dir: SplitDir): LayoutNode {
  if (ids.length === 1) return leaf(ids[0])
  const [first, ...rest] = ids
  return { kind: 'split', dir, ratio: 1 / ids.length, a: leaf(first), b: layoutFor(rest, dir) }
}

export function paneTitle(config: LaunchConfig, pane: LaunchPane): string {
  const folder = pane.cwd.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || pane.cwd
  return `${config.name.trim() || t('Workspace')} · ${folder}`
}
