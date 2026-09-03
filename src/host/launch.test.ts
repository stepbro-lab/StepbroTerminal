import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ptyEnv, resolveCommand, substituteArgs, writeHooksSettings } from './launch'

let tmp: string
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'step-launch-'))
})
afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true })
})

describe('substituteArgs', () => {
  it('replaces placeholders', () => {
    expect(
      substituteArgs(['--session-id', '{sessionId}', '--settings', '{hooksSettings}', 'x'], {
        sessionId: 'abc',
        hooksSettings: '/p/h.json'
      })
    ).toEqual(['--session-id', 'abc', '--settings', '/p/h.json', 'x'])
  })
})

describe('writeHooksSettings', () => {
  it('writes http hooks for every lifecycle event', () => {
    const file = writeHooksSettings(tmp, 's1', 'http://127.0.0.1:1234/hooks/tok')
    const json = JSON.parse(fs.readFileSync(file, 'utf8'))
    for (const ev of ['SessionStart', 'UserPromptSubmit', 'PreToolUse', 'Notification', 'Stop', 'SessionEnd']) {
      expect(json.hooks[ev][0].hooks[0]).toMatchObject({ type: 'http', url: 'http://127.0.0.1:1234/hooks/tok' })
    }
    expect(Object.keys(json)).toEqual(['hooks'])
  })
})

describe('resolveCommand', () => {
  it('finds .cmd shims on windows and wraps them with cmd.exe', () => {
    fs.writeFileSync(path.join(tmp, 'codex.cmd'), '@echo off')
    const r = resolveCommand('codex', { PATH: tmp, ComSpec: 'C:\\Windows\\system32\\cmd.exe' }, 'win32')
    expect(r).toEqual({
      file: 'C:\\Windows\\system32\\cmd.exe',
      argsPrefix: ['/d', '/s', '/c', path.join(tmp, 'codex.cmd')]
    })
  })

  it('prefers .exe over .cmd on windows', () => {
    fs.writeFileSync(path.join(tmp, 'claude.cmd'), '')
    fs.writeFileSync(path.join(tmp, 'claude.exe'), '')
    const r = resolveCommand('claude', { PATH: tmp }, 'win32')
    expect(r?.file).toBe(path.join(tmp, 'claude.exe'))
    expect(r?.argsPrefix).toEqual([])
  })

  it('resolves plain names on posix and returns null when missing', () => {
    // Posix PATH splits on ':' so on Windows the dir must not carry a drive letter. A dir
    // under the working directory keeps the relative path drive-free even when the temp
    // folder lives on another drive, as it does on CI runners.
    const local = fs.mkdtempSync(path.join(process.cwd(), '.step-launch-'))
    try {
      const dir = path.relative(process.cwd(), local)
      fs.writeFileSync(path.join(local, 'gemini'), '')
      expect(resolveCommand('gemini', { PATH: dir }, 'linux')?.file).toBe(path.join(dir, 'gemini'))
      expect(resolveCommand('nope', { PATH: dir }, 'linux')).toBeNull()
    } finally {
      fs.rmSync(local, { recursive: true, force: true })
    }
  })

  it('accepts absolute paths', () => {
    const f = path.join(tmp, 'tool.exe')
    fs.writeFileSync(f, '')
    expect(resolveCommand(f, {}, 'win32')?.file).toBe(f)
  })
})

describe('ptyEnv', () => {
  it('sets terminal vars and strips electron node mode', () => {
    const env = ptyEnv({ ELECTRON_RUN_AS_NODE: '1', PATH: '/x', UNDEF: undefined, CLAUDECODE: '1', CLAUDE_CODE_CHILD_SESSION: '1' }, { STEP_SESSION: 'a' })
    expect(env['ELECTRON_RUN_AS_NODE']).toBeUndefined()
    expect(env['CLAUDECODE']).toBeUndefined()
    expect(env['CLAUDE_CODE_CHILD_SESSION']).toBeUndefined()
    expect(env).toMatchObject({ PATH: '/x', TERM: 'xterm-256color', COLORTERM: 'truecolor', TERM_PROGRAM: 'Step', STEP_SESSION: 'a' })
    expect('UNDEF' in env).toBe(false)
  })
})
