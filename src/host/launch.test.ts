import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { applyAgentWrap, findOnPath, isStepZdotdir, posixShellWithAgents, ptyEnv, resolveCommand, shellArgsWithAgents, substituteArgs, writeHooksSettings, writeMcpConfig, writeShims } from './launch'

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
  })

  it('has PowerShell and cmd say which folder they are in, agents or not', () => {
    const none = { ...w, claude: undefined, codex: undefined }
    const ps = shellArgsWithAgents('pwsh', [], none, 'win32')
    expect(ps.slice(0, 2)).toEqual(['-NoExit', '-Command'])
    // It wraps the prompt the profile set up, oh-my-posh or not, and calls it first.
    expect(ps[2]).toContain('$global:__stepPrompt = $function:prompt')
    expect(ps[2]).toContain('$s = & $global:__stepPrompt')
    expect(ps[2]).toContain("']9;9;' + $l.ProviderPath")
    // It travels on the command line: no double quotes to escape.
    expect(ps[2]).not.toContain('"')
    const env: Record<string, string> = { PROMPT: '$P$G' }
    expect(shellArgsWithAgents('cmd.exe', [], none, 'win32', env)).toEqual([])
    expect(env['PROMPT']).toBe('$E]9;9;$P$E\\$P$G')
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

describe('posix shells define the agent functions', () => {
  const w = { hooksSettings: '/h/s.json', mcpConfig: '/h/s.mcp.json', mcpUrl: 'http://h/mcp', claude: '/usr/local/bin/claude' }

  it('gives zsh its own ZDOTDIR and remembers the user\'s', () => {
    const env: Record<string, string> = { PATH: '/usr/bin', ZDOTDIR: '/home/u/dots' }
    const args = posixShellWithAgents('/bin/zsh', ['-l'], w, env, '/home/u/.step/bin')
    expect(args).toEqual(['-l'])
    expect(env['ZDOTDIR']).toBe(path.join('/home/u/.step/bin', 'zsh'))
    expect(env['STEP_USER_ZDOTDIR']).toBe('/home/u/dots')
    const plain: Record<string, string> = {}
    posixShellWithAgents('/bin/zsh', ['-l'], w, plain, '/b')
    expect(plain['STEP_USER_ZDOTDIR']).toBeUndefined()
  })

  it('gives bash the rc file instead of a login flag, and fish an init command', () => {
    const env: Record<string, string> = {}
    expect(posixShellWithAgents('/bin/bash', ['-l'], w, env, '/b')).toEqual(['--rcfile', path.join('/b', 'bash', 'rc'), '-i'])
    expect(posixShellWithAgents('/usr/bin/fish', ['-l'], w, env, '/b')).toEqual(['-l', '-C', `source "${path.join('/b', 'fish', 'init.fish')}"`])
    expect(env['ZDOTDIR']).toBeUndefined()
  })

  it('leaves shells running a command, unknown shells, agents themselves and sessions without agents alone', () => {
    const env: Record<string, string> = {}
    expect(posixShellWithAgents('/bin/zsh', ['-c', 'ls'], w, env, '/b')).toEqual(['-c', 'ls'])
    expect(posixShellWithAgents('/bin/dash', ['-l'], w, env, '/b')).toEqual(['-l'])
    expect(posixShellWithAgents('/usr/local/bin/claude', ['--settings', 'x'], w, env, '/b')).toEqual(['--settings', 'x'])
    expect(env['ZDOTDIR']).toBeUndefined()
    // Agents or not, a plain zsh gets our files: they also have it say which folder it is in.
    expect(posixShellWithAgents('/bin/zsh', ['-l'], { ...w, claude: undefined, codex: undefined }, env, '/b')).toEqual(['-l'])
    expect(env['ZDOTDIR']).toBe(path.join('/b', 'zsh'))
  })

  it('writes rc files that run the user\'s own files first and then define the functions', () => {
    writeShims(tmp)
    const zshrc = fs.readFileSync(path.join(tmp, 'zsh', '.zshrc'), 'utf8')
    expect(zshrc).toContain('. "$ZDOTDIR/.zshrc"')
    expect(zshrc).toContain('claude() { "$STEP_REAL_CLAUDE" --settings "$STEP_HOOKS_SETTINGS" --mcp-config "$STEP_MCP_CONFIG" "$@"; }')
    expect(fs.readFileSync(path.join(tmp, 'zsh', '.zshenv'), 'utf8')).toContain('.zshenv')
    const bash = fs.readFileSync(path.join(tmp, 'bash', 'rc'), 'utf8')
    expect(bash).toContain('"$HOME/.bash_profile"')
    expect(bash).toContain('codex() {')
    expect(fs.readFileSync(path.join(tmp, 'fish', 'init.fish'), 'utf8')).toContain('function claude;')
  })

  it('makes a real bash run the function in place of the binary', () => {
    // On Windows the bash on PATH is usually the WSL launcher, which runs a Linux bash that
    // sees none of this; Git's own bash behaves like the real thing.
    const bash = process.platform === 'win32' ? ['C:\\Program Files\\Git\\bin\\bash.exe', 'C:\\Program Files\\Git\\usr\\bin\\bash.exe'].find((p) => fs.existsSync(p)) : findOnPath('bash', process.env)
    if (!bash) return
    writeShims(tmp)
    const fake = path.join(tmp, 'fakeclaude')
    fs.writeFileSync(fake, '#!/bin/sh\necho "ARGS:$@"\n')
    fs.chmodSync(fake, 0o755)
    // Git Bash on Windows wants forward slashes; a real macOS or Linux path already has them.
    const posix = (p: string): string => p.replace(/\\/g, '/')
    const env = { ...process.env, HOME: posix(tmp), STEP_REAL_CLAUDE: posix(fake), STEP_HOOKS_SETTINGS: '/h/s.json', STEP_MCP_CONFIG: '/h/s.mcp.json', STEP_MCP_URL: 'http://h/mcp' }
    const args = posixShellWithAgents(bash, ['-l'], w, env as Record<string, string>, tmp).map(posix)
    const r = spawnSync(bash, args, { env, input: 'claude --version\nexit\n', encoding: 'utf8' })
    expect(r.stdout).toContain('ARGS:--settings /h/s.json --mcp-config /h/s.mcp.json --version')
  })
})

describe('shells say which folder they are in', () => {
  // No agent at all: the folder is reported all the same.
  const w = { hooksSettings: '/h/s.json', mcpConfig: '/h/s.mcp.json', mcpUrl: 'http://h/mcp' }
  const run = (shell: string, args: string[], env: Record<string, string>, input: string): string =>
    spawnSync(shell, args, { env, input, encoding: 'utf8', timeout: 20_000 }).stdout ?? ''

  it('a real zsh reports each folder it moves to, percent and spaces and all', () => {
    const zsh = process.platform === 'win32' ? null : findOnPath('zsh', process.env)
    if (!zsh) return
    writeShims(tmp)
    const dir = path.join(tmp, 'my 100% dir')
    fs.mkdirSync(dir)
    const env = { ...process.env, HOME: tmp } as Record<string, string>
    delete env['ZDOTDIR']
    const args = posixShellWithAgents(zsh, ['-i'], w, env, tmp)
    const out = run(zsh, args, env, `cd '${dir}'\nexit\n`)
    expect(out).toContain('\x1b]7;file://')
    expect(out).toContain(dir.replace(/%/g, '%25') + '\x07')
  })

  it('a real bash does too', () => {
    const bash = process.platform === 'win32' ? null : findOnPath('bash', process.env)
    if (!bash) return
    writeShims(tmp)
    const dir = path.join(tmp, 'other dir')
    fs.mkdirSync(dir)
    const env = { ...process.env, HOME: tmp } as Record<string, string>
    const args = posixShellWithAgents(bash, ['-l'], w, env, tmp)
    const out = run(bash, args, env, `cd '${dir}'\nexit\n`)
    expect(out).toContain('\x1b]7;file://')
    expect(out).toContain(dir + '\x07')
  })
})

describe('writeHooksSettings', () => {
  it('writes http hooks for every lifecycle event', () => {
    const file = writeHooksSettings(tmp, 's1', 'http://127.0.0.1:1234/hooks/tok')
    const json = JSON.parse(fs.readFileSync(file, 'utf8'))
    for (const ev of ['SessionStart', 'UserPromptSubmit', 'PreToolUse', 'Notification', 'Elicitation', 'ElicitationResult', 'Stop', 'SessionEnd']) {
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

describe('stepbro opened from a shell of another stepbro', () => {
  const w = { hooksSettings: '', mcpConfig: '', mcpUrl: '' }

  it('does not take the other one\'s startup files for the user\'s', () => {
    const outer = path.join(tmp, 'outer')
    writeShims(outer)
    expect(isStepZdotdir(path.join(outer, 'zsh'))).toBe(true)
    expect(isStepZdotdir(tmp)).toBe(false)
    const env: Record<string, string> = { ZDOTDIR: path.join(outer, 'zsh') }
    posixShellWithAgents('/bin/zsh', [], w, env, path.join(tmp, 'inner'))
    expect(env['STEP_USER_ZDOTDIR']).toBeUndefined()
    // The user's own, which the outer one kept aside, is kept.
    const mine: Record<string, string> = { ZDOTDIR: path.join(outer, 'zsh'), STEP_USER_ZDOTDIR: '/Users/me/.config/zsh' }
    posixShellWithAgents('/bin/zsh', [], w, mine, path.join(tmp, 'inner'))
    expect(mine['STEP_USER_ZDOTDIR']).toBe('/Users/me/.config/zsh')
  })

  it('starts a real zsh with the user\'s files and no endless loop', () => {
    const zsh = process.platform === 'win32' ? null : findOnPath('zsh', process.env)
    if (!zsh) return
    const outer = path.join(tmp, 'outer')
    const inner = path.join(tmp, 'inner')
    writeShims(outer)
    writeShims(inner)
    fs.writeFileSync(path.join(tmp, '.zshrc'), 'echo USER_ZSHRC_RAN\n')
    const env = { ...process.env, HOME: tmp, ZDOTDIR: path.join(outer, 'zsh') } as Record<string, string>
    delete env['STEP_USER_ZDOTDIR']
    const args = posixShellWithAgents(zsh, ['-i'], w, env, inner)
    const r = spawnSync(zsh, args, { env, input: 'echo ALIVE\nexit\n', encoding: 'utf8', timeout: 20_000 })
    expect(r.stderr).not.toMatch(/recursion limit/)
    expect(r.stdout).toContain('USER_ZSHRC_RAN')
    expect(r.stdout).toContain('ALIVE')
  })
})
