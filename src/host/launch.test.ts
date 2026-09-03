import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { applyAgentWrap, ptyEnv, resolveCommand, shellArgsWithAgents, substituteArgs, writeHooksSettings, writeMcpConfig, writeShims } from './launch'

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

describe('mcp placeholders', () => {
  it('fills the config path and url, and blanks them when absent', () => {
    const args = ['--mcp-config', '{mcpConfig}', '-c', 'mcp_servers.stepbro.url="{mcpUrl}"']
    expect(substituteArgs(args, { sessionId: 's', hooksSettings: '', mcpConfig: '/p/s.mcp.json', mcpUrl: 'http://h/mcp' })).toEqual([
      '--mcp-config',
      '/p/s.mcp.json',
      '-c',
      'mcp_servers.stepbro.url="http://h/mcp"'
    ])
    expect(substituteArgs(['{mcpConfig}'], { sessionId: 's', hooksSettings: '' })).toEqual([''])
  })

  it('writes an http server entry for Claude Code', () => {
    const file = writeMcpConfig(tmp, 's1', 'http://127.0.0.1:1/mcp/t/s1')
    expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toEqual({ mcpServers: { stepbro: { type: 'http', url: 'http://127.0.0.1:1/mcp/t/s1' } } })
  })
})

describe('agents typed inside a shell', () => {
  const w = { hooksSettings: '/h/s.json', mcpConfig: '/h/s.mcp.json', mcpUrl: 'http://h/mcp', claude: 'C:\\c\\claude.exe' }

  it('gives PowerShell a claude function and leaves codex out when it is not installed', () => {
    const args = shellArgsWithAgents('C:\\W\\powershell.exe', ['-NoLogo'], w, 'win32')
    expect(args.slice(0, 3)).toEqual(['-NoLogo', '-NoExit', '-Command'])
    expect(args[3]).toContain('function claude')
    expect(args[3]).not.toContain('function codex')
    expect(shellArgsWithAgents('pwsh', [], { ...w, codex: '/c' }, 'darwin')[2]).toContain('function codex')
  })

  it('leaves shells that already run a command, agents launched directly and posix shells alone', () => {
    expect(shellArgsWithAgents('pwsh', ['-Command', 'x'], w, 'win32')).toEqual(['-Command', 'x'])
    expect(shellArgsWithAgents('C:\\c\\claude.exe', ['--settings', 'x'], w, 'win32')).toEqual(['--settings', 'x'])
    expect(shellArgsWithAgents('/bin/zsh', ['-l'], w, 'darwin')).toEqual(['-l'])
    expect(shellArgsWithAgents('pwsh', [], { ...w, claude: undefined }, 'win32')).toEqual([])
  })

  it('gives cmd doskey macros', () => {
    expect(shellArgsWithAgents('cmd.exe', [], w, 'win32')).toEqual([
      '/k',
      'doskey claude="%STEP_REAL_CLAUDE%" --settings "%STEP_HOOKS_SETTINGS%" --mcp-config "%STEP_MCP_CONFIG%" $*'
    ])
  })

  it('puts the files and real binaries in the environment, and the shim dir first on posix PATH', () => {
    const env: Record<string, string> = { PATH: '/usr/bin' }
    applyAgentWrap(env, { ...w, codex: '/usr/local/bin/codex' }, '/home/u/.step/bin', 'linux')
    expect(env['PATH']).toBe('/home/u/.step/bin' + path.delimiter + '/usr/bin')
    expect(env['STEP_REAL_CLAUDE']).toBe('C:\\c\\claude.exe')
    expect(env['STEP_CODEX_MCP_ARG']).toBe('mcp_servers.stepbro.url=http://h/mcp')
    const win: Record<string, string> = { Path: 'C:\\W' }
    applyAgentWrap(win, w, 'C:\\bin', 'win32')
    expect(win['Path']).toBe('C:\\W')
    expect(win['STEP_MCP_CONFIG']).toBe('/h/s.mcp.json')
  })

  it('writes posix shims that run the real binary with the flags', () => {
    writeShims(tmp)
    const claude = fs.readFileSync(path.join(tmp, 'claude'), 'utf8')
    expect(claude.startsWith('#!/bin/sh')).toBe(true)
    expect(claude).toContain('exec "$STEP_REAL_CLAUDE" --settings "$STEP_HOOKS_SETTINGS" --mcp-config "$STEP_MCP_CONFIG" "$@"')
    expect(fs.readFileSync(path.join(tmp, 'codex'), 'utf8')).toContain('mcp_servers.stepbro.url=')
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
