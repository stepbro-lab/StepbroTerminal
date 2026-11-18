import type { LaunchConfig, LaunchPane } from './types'

export function newWorkspaceId(): string {
  return `w${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

export function openablePanes(config: LaunchConfig): LaunchPane[] {
  return config.panes.filter((p) => p.cwd.trim().length > 0)
}

export function slugOf(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function workspaceUrl(config: LaunchConfig): string {
  return `step://workspace/${slugOf(config.name) || config.id}`
}

export function findWorkspace(configs: LaunchConfig[], key: string): LaunchConfig | undefined {
  const k = key.trim()
  return configs.find((c) => c.id === k) ?? configs.find((c) => slugOf(c.name) === slugOf(k))
}
