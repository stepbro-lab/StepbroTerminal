import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { defaultShell, detectPresets } from './detect'
import { buildLaunchSpec } from './launchSpec'
import type { Prefs } from '@shared/types'

const prefs = (over: Partial<Prefs> = {}): Prefs => ({
  theme: 'system',
  fontFamily: 'x',
  fontSize: 13,
  ligatures: false,
  scrollback: 1000,
  notifications: true,
  sound: false,
  sidebarWidth: 240,
  sidebarCollapsed: false,
  collapsedProjects: [],
  addedProjects: [],
  hiddenProjects: [],
  customPresets: [],
  presetUsage: {},
  ...over
})

let tmp: string
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'step-presets-'))
})
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }))

describe('detectPresets', () => {
  it('marks installed agents, keeps shell first and sorts by usage', () => {
    fs.writeFileSync(path.join(tmp, 'codex.cmd'), '')
    fs.writeFileSync(path.join(tmp, 'gemini.cmd'), '')
    fs.writeFileSync(path.join(tmp, 'pwsh.exe'), '')
    const env = { PATH: tmp }
    const list = detectPresets(env, prefs({ presetUsage: { gemini: 5, codex: 1 } }), 'win32')
    expect(list[0].id).toBe('shell')
    expect(list[0].binary).toBe('pwsh')
    const installed = list.filter((p) => p.installed && p.id !== 'shell').map((p) => p.id)
    expect(installed).toEqual(['gemini', 'codex'])
    expect(list.find((p) => p.id === 'claude')?.installed).toBe(false)
  })

  it('honours a claude path override and custom presets', () => {
    const claude = path.join(tmp, 'my-claude.exe')
    fs.writeFileSync(claude, '')
    fs.writeFileSync(path.join(tmp, 'aider.cmd'), '')
    const list = detectPresets(
      { PATH: tmp },
      prefs({ claudePath: claude, customPresets: [{ id: 'aider', name: 'Aider', command: 'aider', args: ['--yes'], color: '#fff' }] }),
      'win32'
    )
    const c = list.find((p) => p.id === 'claude')!
    expect(c.installed).toBe(true)
    expect(c.binary).toBe(claude)
    const a = list.find((p) => p.id === 'aider')!
    expect(a).toMatchObject({ installed: true, custom: true, args: ['--yes'] })
  })
})

describe('defaultShell and buildLaunchSpec', () => {
  it('falls back to cmd.exe on windows without powershell', () => {
    expect(defaultShell({ PATH: tmp, ComSpec: 'C:\\W\\cmd.exe' }, 'win32')).toEqual({ command: 'C:\\W\\cmd.exe', args: [] })
  })

  it('uses $SHELL as a login shell on posix', () => {
    expect(defaultShell({ SHELL: '/bin/zsh' }, 'darwin')).toEqual({ command: '/bin/zsh', args: ['-l'] })
  })

  it('builds the claude launch spec with placeholders', () => {
    const list = detectPresets({ PATH: tmp }, prefs(), 'linux')
    const spec = buildLaunchSpec(list.find((p) => p.id === 'claude')!, prefs(), { PATH: tmp }, 'linux')
    expect(spec).toEqual({
      command: 'claude',
      args: ['--session-id', '{sessionId}', '--settings', '{hooksSettings}'],
      resumeArgs: ['--resume', '{sessionId}', '--settings', '{hooksSettings}'],
      hooks: true
    })
  })
})
