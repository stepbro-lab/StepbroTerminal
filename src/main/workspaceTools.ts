import path from 'node:path'
import type { LaunchConfig, LaunchPane, Preset, WorkspaceInfo, WorkspaceOp, WorkspacePaneInput } from '@shared/types'
import { newWorkspaceId, openablePanes, slugOf, workspaceUrl } from '@shared/workspaces'
import { workspaceKeyFromUrl } from './stepUrl'

/**
 * The saved workspaces as agents work them through the stepbro MCP server: what they see of them,
 * and the changes they ask for, checked first (folders that exist, programs that are installed)
 * and then made all at once or not at all. The caller saves the result into the preferences, so
 * Settings shows it at once.
 */

/** Something an agent asked that cannot be done as asked. The message goes back to it as it is. */
export class WorkspaceError extends Error {}

export interface WorkspaceEnv {
  presets: Preset[]
  /** Whether a path is a folder that exists. */
  isDir: (p: string) => boolean
  home: string
  newId?: () => string
}

/** Panes in one workspace: past this, a slip in an agent's list rather than a layout anyone reads. */
export const MAX_PANES = 12
const MAX_NAME = 80
const MAX_START = 4000
/** Words for the plain shell an agent might use instead of its id. */
const SHELL_WORDS = new Set(['shell', 'terminal', 'term', 'bash', 'zsh', 'fish', 'sh', 'powershell', 'pwsh', 'cmd'])

const squash = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, '')

/** A folder as given, made absolute: ~ is the home folder, and a relative path starts from `base`. */
export function resolveFolder(input: string, base: string, home: string): string {
  let p = input.trim()
  if (!p) throw new WorkspaceError('Every pane needs a folder.')
  if (p === '~' || p.startsWith('~/') || p.startsWith('~\\')) p = path.join(home, p.slice(1))
  // Resolving an absolute path too spells it out in full: on Windows "/" becomes the drive's root, C:\.
  else p = path.resolve(base || home, p)
  p = path.normalize(p)
  const root = path.parse(p).root
  return p.length > root.length ? p.replace(/[\\/]+$/, '') : p
}

/** The shell, or an installed agent or launcher, from its id or its name ("codex", "Claude Code"). */
export function pickRunnable(presets: Preset[], wanted: string | undefined): Preset {
  const shell = presets.find((p) => p.id === 'shell')
  const w = squash(wanted ?? '')
  if (!w && shell) return shell
  // A launcher of the person's own goes first; then "bash", "terminal" and the like mean the shell.
  const found =
    presets.find((p) => p.id === wanted?.trim()) ?? presets.find((p) => squash(p.id) === w || squash(p.name) === w) ?? (SHELL_WORDS.has(w) ? shell : undefined)
  const choices = presets
    .filter((p) => p.id === 'shell' || p.installed)
    .map((p) => (p.id === 'shell' ? 'shell' : `${p.name} (${p.id})`))
    .join(', ')
  if (!found) throw new WorkspaceError(`Nothing called "${wanted}" can run in a pane. On this computer: ${choices}.`)
  if (found.id !== 'shell' && !found.installed) throw new WorkspaceError(`${found.name} is not installed on this computer. On this computer: ${choices}.`)
  return found
}

/** What a pane types once it is ready: line endings made plain, nothing trailing. */
function cleanStart(text: string | undefined): string {
  const t = (text ?? '').replace(/\r\n?/g, '\n').replace(/\s+$/, '')
  if (t.length > MAX_START) throw new WorkspaceError(`A start command can be at most ${MAX_START} characters.`)
  return t
}

/** A name that is not empty, not too long, and whose link no other workspace already answers to. */
function cleanName(name: string, configs: LaunchConfig[], selfId?: string): string {
  const n = name.trim().replace(/\s+/g, ' ')
  if (!n) throw new WorkspaceError('A workspace needs a name.')
  if (n.length > MAX_NAME) throw new WorkspaceError(`A workspace name can be at most ${MAX_NAME} characters.`)
  const slug = slugOf(n)
  const clash = configs.find((c) => c.id !== selfId && (slug ? slugOf(c.name) === slug : c.name.trim().toLowerCase() === n.toLowerCase()))
  if (clash) throw new WorkspaceError(`There is already a workspace called "${clash.name.trim()}", and the two would share a link. Pick another name, or change that one instead.`)
  return n
}

function buildPane(input: WorkspacePaneInput, base: string, env: WorkspaceEnv): LaunchPane {
  const cwd = resolveFolder(input.folder ?? '', base, env.home)
  if (!env.isDir(cwd)) throw new WorkspaceError(`The folder ${cwd} does not exist.`)
  return { cwd, presetId: pickRunnable(env.presets, input.run).id, runOnStart: cleanStart(input.startCommand) }
}

function checkCount(panes: LaunchPane[]): void {
  if (panes.length === 0) throw new WorkspaceError('A workspace needs at least one pane.')
  if (panes.length > MAX_PANES) throw new WorkspaceError(`A workspace can have at most ${MAX_PANES} panes.`)
}

/** The workspace a name, a link name, a step:// link or an id points to. */
export function matchWorkspace(configs: LaunchConfig[], key: string): LaunchConfig {
  const k = (workspaceKeyFromUrl(key) ?? key).trim()
  if (!k) throw new WorkspaceError('Say which workspace: its name, its link or its id.')
  const byId = configs.find((c) => c.id === k)
  if (byId) return byId
  const slug = slugOf(k)
  const named = configs.filter((c) => (slug ? slugOf(c.name) === slug : c.name.trim() === k))
  if (named.length === 1) return named[0]
  if (named.length > 1) {
    throw new WorkspaceError(`${named.length} workspaces are called "${k}": ${named.map((c) => `id ${c.id}`).join(', ')}. Say which one by its id.`)
  }
  if (!configs.length) throw new WorkspaceError('There are no workspaces yet.')
  throw new WorkspaceError(`No workspace called "${k}". There are: ${configs.map((c) => `"${c.name.trim() || c.id}"`).join(', ')}.`)
}

/** A workspace as agents are shown it, with what would keep a pane from opening. */
export function describeWorkspace(c: LaunchConfig, env: WorkspaceEnv): WorkspaceInfo {
  return {
    id: c.id,
    name: c.name.trim(),
    split: c.split,
    url: workspaceUrl(c),
    panes: c.panes.map((p) => {
      const preset = env.presets.find((x) => x.id === p.presetId)
      let problem: string | undefined
      if (!p.cwd.trim()) problem = 'no folder yet, so it does not open'
      else if (!env.isDir(p.cwd)) problem = 'its folder does not exist'
      else if (!preset) problem = `"${p.presetId}" is not known here`
      else if (preset.id !== 'shell' && !preset.installed) problem = `${preset.name} is not installed`
      return { cwd: p.cwd, presetId: p.presetId, presetName: preset?.name ?? p.presetId, runOnStart: p.runOnStart?.trim() || undefined, problem }
    })
  }
}

/** The workspace to open, as long as at least one of its panes can. */
export function workspaceToOpen(configs: LaunchConfig[], key: string, env: WorkspaceEnv): LaunchConfig {
  const c = matchWorkspace(configs, key)
  const panes = openablePanes(c)
  if (!panes.length) throw new WorkspaceError(`"${c.name.trim()}" has no pane with a folder yet, so there is nothing to open.`)
  if (!panes.some((p) => env.isDir(p.cwd))) throw new WorkspaceError(`None of the folders of "${c.name.trim()}" exist any more.`)
  return c
}

/**
 * A create, update or delete: the workspaces as they are afterwards, and the one it was about.
 * Everything is checked before anything changes, so a request with one bad pane changes nothing.
 */
export function applyWorkspaceOp(
  configs: LaunchConfig[],
  op: Extract<WorkspaceOp, { kind: 'create' | 'update' | 'delete' }>,
  env: WorkspaceEnv
): { configs: LaunchConfig[]; workspace: WorkspaceInfo } {
  if (op.kind !== 'delete' && op.split !== undefined && op.split !== 'row' && op.split !== 'column') throw new WorkspaceError('The layout is side by side or stacked.')
  if (op.kind === 'create') {
    const name = cleanName(op.name, configs)
    const panes = (op.panes ?? []).map((p) => buildPane(p, op.base, env))
    checkCount(panes)
    const c: LaunchConfig = { id: (env.newId ?? newWorkspaceId)(), name, split: op.split ?? 'row', panes }
    return { configs: [...configs, c], workspace: describeWorkspace(c, env) }
  }

  const c = matchWorkspace(configs, op.key)
  if (op.kind === 'delete') return { configs: configs.filter((x) => x.id !== c.id), workspace: describeWorkspace(c, env) }

  const piecewise = !!(op.change?.length || op.remove?.length || op.add?.length)
  if (op.panes && piecewise) throw new WorkspaceError('Either give every pane anew, or add, remove and change some; not both at once.')
  if (op.name === undefined && op.split === undefined && !op.panes && !piecewise) throw new WorkspaceError('Nothing to change: give a new name, a layout or panes.')

  const name = op.name === undefined ? c.name : cleanName(op.name, configs, c.id)
  let panes: LaunchPane[]
  if (op.panes) {
    panes = op.panes.map((p) => buildPane(p, op.base, env))
  } else {
    const n = c.panes.length
    const inRange = (k: number): boolean => Number.isInteger(k) && k >= 1 && k <= n
    const changed = c.panes.map((p) => ({ ...p }))
    for (const ch of op.change ?? []) {
      if (!inRange(ch.pane)) throw new WorkspaceError(`There is no pane ${ch.pane}: "${c.name.trim()}" has ${n}.`)
      const was = changed[ch.pane - 1]
      if (ch.folder !== undefined) {
        const cwd = resolveFolder(ch.folder, op.base, env.home)
        if (!env.isDir(cwd)) throw new WorkspaceError(`The folder ${cwd} does not exist.`)
        was.cwd = cwd
      }
      if (ch.run !== undefined) was.presetId = pickRunnable(env.presets, ch.run).id
      if (ch.startCommand !== undefined) was.runOnStart = cleanStart(ch.startCommand)
    }
    const gone = new Set<number>()
    for (const k of op.remove ?? []) {
      if (!inRange(k)) throw new WorkspaceError(`There is no pane ${k}: "${c.name.trim()}" has ${n}.`)
      gone.add(k)
    }
    panes = [...changed.filter((_, i) => !gone.has(i + 1)), ...(op.add ?? []).map((p) => buildPane(p, op.base, env))]
  }
  checkCount(panes)
  const next: LaunchConfig = { ...c, name, split: op.split ?? c.split, panes }
  return { configs: configs.map((x) => (x.id === c.id ? next : x)), workspace: describeWorkspace(next, env) }
}
