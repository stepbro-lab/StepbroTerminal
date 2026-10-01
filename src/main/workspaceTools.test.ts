import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { LaunchConfig, Preset } from '@shared/types'
import { MAX_PANES, WorkspaceError, applyWorkspaceOp, describeWorkspace, matchWorkspace, pickRunnable, resolveFolder, workspaceToOpen, type WorkspaceEnv } from './workspaceTools'

const preset = (id: string, name: string, installed: boolean, custom = false): Preset => ({ id, name, color: '#000', binary: id, args: [], hooks: false, installed, custom })
const PRESETS = [preset('shell', 'Shell', true), preset('claude', 'Claude Code', true), preset('codex', 'Codex', true), preset('gemini', 'Gemini CLI', false)]

let root: string
let home: string
let app: string
let api: string
let env: WorkspaceEnv
let ids = 0

beforeAll(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'step-ws-')))
  home = path.join(root, 'home')
  app = path.join(home, 'code', 'app')
  api = path.join(home, 'code', 'api')
  fs.mkdirSync(app, { recursive: true })
  fs.mkdirSync(api, { recursive: true })
  env = {
    presets: PRESETS,
    home,
    isDir: (p) => {
      try {
        return fs.statSync(p).isDirectory()
      } catch {
        return false
      }
    },
    newId: () => `w${++ids}`
  }
})
afterAll(() => fs.rmSync(root, { recursive: true, force: true }))

const demo = (): LaunchConfig => ({
  id: 'wdemo',
  name: 'Demo stack',
  split: 'row',
  panes: [
    { cwd: app, presetId: 'claude', runOnStart: 'look at the failing test' },
    { cwd: api, presetId: 'shell', runOnStart: 'npm run dev' }
  ]
})
const error = (fn: () => unknown): string => {
  try {
    fn()
  } catch (e) {
    expect(e).toBeInstanceOf(WorkspaceError)
    return (e as Error).message
  }
  throw new Error('expected a WorkspaceError')
}

describe('folders and programs an agent names', () => {
  it('makes a folder absolute: ~ is home, a relative one starts where the agent is', () => {
    expect(resolveFolder('~/code/app', '/elsewhere', home)).toBe(app)
    expect(resolveFolder('~', '/elsewhere', home)).toBe(home)
    expect(resolveFolder('../api', app, home)).toBe(api)
    expect(resolveFolder('.', app, home)).toBe(app)
    expect(resolveFolder(`${app}/`, '/', home)).toBe(app)
    expect(resolveFolder('/', app, home)).toBe('/')
    expect(error(() => resolveFolder('  ', app, home))).toMatch(/needs a folder/)
  })

  it('finds the shell or an installed agent by id or name, and says what there is otherwise', () => {
    expect(pickRunnable(PRESETS, undefined).id).toBe('shell')
    expect(pickRunnable(PRESETS, 'zsh').id).toBe('shell')
    expect(pickRunnable(PRESETS, 'Claude Code').id).toBe('claude')
    expect(pickRunnable(PRESETS, 'CODEX').id).toBe('codex')
    expect(error(() => pickRunnable(PRESETS, 'gemini'))).toMatch(/Gemini CLI is not installed.*shell, Claude Code \(claude\), Codex \(codex\)/)
    expect(error(() => pickRunnable(PRESETS, 'aider'))).toMatch(/Nothing called "aider"/)
  })

  it('lets a launcher of the person\'s own win over a word that would mean the shell', () => {
    const mine = [...PRESETS, preset('fish', 'Fish', true, true)]
    expect(pickRunnable(mine, 'fish').id).toBe('fish')
  })
})

describe('finding a workspace', () => {
  it('goes by id, name, link name or step:// link', () => {
    const list = [demo()]
    for (const key of ['wdemo', 'Demo stack', 'demo-stack', 'step://workspace/demo-stack', ' DEMO STACK ']) expect(matchWorkspace(list, key).id).toBe('wdemo')
  })

  it('names the ones there are when none matches, and asks for the id when two share a name', () => {
    expect(error(() => matchWorkspace([demo()], 'other'))).toMatch(/No workspace called "other". There are: "Demo stack"/)
    expect(error(() => matchWorkspace([], 'x'))).toMatch(/no workspaces yet/)
    const twin = { ...demo(), id: 'wtwin' }
    expect(error(() => matchWorkspace([demo(), twin], 'demo stack'))).toMatch(/2 workspaces .* id wdemo, id wtwin/)
    expect(matchWorkspace([demo(), twin], 'wtwin').id).toBe('wtwin')
  })
})

describe('creating, changing and deleting', () => {
  it('creates one with checked panes and its link', () => {
    const { configs, workspace } = applyWorkspaceOp(
      [demo()],
      { kind: 'create', base: app, name: '  Front  and back ', split: 'column', panes: [{ folder: '.', run: 'codex', startCommand: 'npm test\r\n' }, { folder: '~/code/api' }] },
      env
    )
    expect(configs).toHaveLength(2)
    expect(configs[1]).toMatchObject({ name: 'Front and back', split: 'column', panes: [{ cwd: app, presetId: 'codex', runOnStart: 'npm test' }, { cwd: api, presetId: 'shell', runOnStart: '' }] })
    expect(workspace.url).toBe('step://workspace/front-and-back')
  })

  it('refuses a missing folder, a program that is not installed, a clashing name, no panes and too many', () => {
    const base = { kind: 'create' as const, base: app }
    expect(error(() => applyWorkspaceOp([], { ...base, name: 'X', panes: [{ folder: '~/nope' }] }, env))).toBe(`The folder ${path.join(home, 'nope')} does not exist.`)
    expect(error(() => applyWorkspaceOp([], { ...base, name: 'X', panes: [{ folder: app, run: 'gemini' }] }, env))).toMatch(/not installed/)
    expect(error(() => applyWorkspaceOp([demo()], { ...base, name: 'demo-STACK', panes: [{ folder: app }] }, env))).toMatch(/already a workspace called "Demo stack"/)
    expect(error(() => applyWorkspaceOp([], { ...base, name: 'X', panes: [] }, env))).toMatch(/at least one pane/)
    const many = Array.from({ length: MAX_PANES + 1 }, () => ({ folder: app }))
    expect(error(() => applyWorkspaceOp([], { ...base, name: 'X', panes: many }, env))).toMatch(/at most 12 panes/)
    expect(error(() => applyWorkspaceOp([], { ...base, name: '  ', panes: [{ folder: app }] }, env))).toMatch(/needs a name/)
  })

  it('changes, removes and adds panes by their place in the list as it was', () => {
    const { configs } = applyWorkspaceOp(
      [demo()],
      { kind: 'update', base: home, key: 'demo stack', split: 'column', change: [{ pane: 2, run: 'claude', startCommand: '' }], remove: [1], add: [{ folder: 'code/app', run: 'Codex' }] },
      env
    )
    expect(configs[0]).toMatchObject({
      id: 'wdemo',
      name: 'Demo stack',
      split: 'column',
      panes: [{ cwd: api, presetId: 'claude', runOnStart: '' }, { cwd: app, presetId: 'codex', runOnStart: '' }]
    })
  })

  it('renames, keeping its own link free to keep, and replaces every pane at once', () => {
    const renamed = applyWorkspaceOp([demo()], { kind: 'update', base: home, key: 'wdemo', name: 'Demo Stack!' }, env)
    expect(renamed.configs[0].name).toBe('Demo Stack!')
    const replaced = applyWorkspaceOp([demo()], { kind: 'update', base: home, key: 'wdemo', panes: [{ folder: api }] }, env)
    expect(replaced.configs[0].panes).toEqual([{ cwd: api, presetId: 'shell', runOnStart: '' }])
  })

  it('changes nothing when any part of the request is wrong', () => {
    const before = [demo()]
    const snapshot = JSON.stringify(before)
    expect(error(() => applyWorkspaceOp(before, { kind: 'update', base: home, key: 'wdemo', change: [{ pane: 1, run: 'codex' }], add: [{ folder: '~/nope' }] }, env))).toMatch(/does not exist/)
    expect(error(() => applyWorkspaceOp(before, { kind: 'update', base: home, key: 'wdemo', remove: [3] }, env))).toMatch(/no pane 3: "Demo stack" has 2/)
    expect(error(() => applyWorkspaceOp(before, { kind: 'update', base: home, key: 'wdemo', remove: [1, 2] }, env))).toMatch(/at least one pane/)
    expect(error(() => applyWorkspaceOp(before, { kind: 'update', base: home, key: 'wdemo', panes: [{ folder: app }], remove: [1] }, env))).toMatch(/not both/)
    expect(error(() => applyWorkspaceOp(before, { kind: 'update', base: home, key: 'wdemo' }, env))).toMatch(/Nothing to change/)
    expect(JSON.stringify(before)).toBe(snapshot)
  })

  it('deletes one and hands back what it was', () => {
    const { configs, workspace } = applyWorkspaceOp([demo()], { kind: 'delete', key: 'step://workspace/demo-stack' }, env)
    expect(configs).toEqual([])
    expect(workspace.panes.map((p) => p.presetName)).toEqual(['Claude Code', 'Shell'])
  })
})

describe('what agents are shown, and opening', () => {
  it('says what would keep a pane from opening', () => {
    const c: LaunchConfig = {
      id: 'w9',
      name: 'Odd',
      split: 'row',
      panes: [
        { cwd: '', presetId: 'shell' },
        { cwd: path.join(home, 'gone'), presetId: 'shell' },
        { cwd: app, presetId: 'gemini' },
        { cwd: app, presetId: 'old-launcher' },
        { cwd: app, presetId: 'claude', runOnStart: '  ' }
      ]
    }
    const info = describeWorkspace(c, env)
    expect(info.panes.map((p) => p.problem)).toEqual(['no folder yet, so it does not open', 'its folder does not exist', 'Gemini CLI is not installed', '"old-launcher" is not known here', undefined])
    expect(info.panes[4].runOnStart).toBeUndefined()
  })

  it('opens a workspace with at least one folder there, and refuses one with none', () => {
    expect(workspaceToOpen([demo()], 'demo stack', env).id).toBe('wdemo')
    const empty: LaunchConfig = { id: 'we', name: 'Empty', split: 'row', panes: [{ cwd: '', presetId: 'shell' }] }
    expect(error(() => workspaceToOpen([empty], 'empty', env))).toMatch(/no pane with a folder/)
    const gone: LaunchConfig = { id: 'wg', name: 'Gone', split: 'row', panes: [{ cwd: path.join(home, 'gone'), presetId: 'shell' }] }
    expect(error(() => workspaceToOpen([gone], 'gone', env))).toMatch(/None of the folders/)
  })
})
