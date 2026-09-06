import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applyAgentWrap, writeAgentPlugins, writeOpencodeConfig } from './launch'

let tmp: string
beforeEach(() => {
  // The real path: on a Windows runner the temp folder is spelled RUNNER~1, and the test loader
  // turns that tilde into %7E on the way to a file URL and then cannot find the file.
  tmp = fs.mkdtempSync(path.join(fs.realpathSync.native(os.tmpdir()), 'step-opencode-'))
})
afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true })
})

describe('OpenCode config', () => {
  it('names the notes server and the plugin, as a file URL OpenCode can import', () => {
    const plugin = path.join(tmp, 'bin', 'opencode', 'stepbro.js')
    const file = writeOpencodeConfig(path.join(tmp, 'hooks'), 'abc', 'http://127.0.0.1:1/mcp/t/abc', plugin)
    const cfg = JSON.parse(fs.readFileSync(file, 'utf8'))
    expect(path.basename(file)).toBe('abc.opencode.json')
    expect(cfg.mcp.stepbro).toEqual({ type: 'remote', url: 'http://127.0.0.1:1/mcp/t/abc', enabled: true })
    expect(cfg.plugin).toEqual([pathToFileURL(plugin).href])
  })

  it('carries the user\'s own OPENCODE_CONFIG along, keeping their servers and plugins', () => {
    const theirs = path.join(tmp, 'mine.json')
    fs.writeFileSync(theirs, JSON.stringify({ model: 'x/y', mcp: { other: { type: 'local', command: ['a'] } }, plugin: ['some-npm-plugin'] }))
    const plugin = path.join(tmp, 'stepbro.js')
    const cfg = JSON.parse(fs.readFileSync(writeOpencodeConfig(tmp, 's1', 'http://h/mcp', plugin, theirs), 'utf8'))
    expect(cfg.model).toBe('x/y')
    expect(Object.keys(cfg.mcp).sort()).toEqual(['other', 'stepbro'])
    expect(cfg.plugin).toEqual(['some-npm-plugin', pathToFileURL(plugin).href])
  })

  it('ignores a user file that is not JSON', () => {
    const theirs = path.join(tmp, 'broken.json')
    fs.writeFileSync(theirs, '{ not json')
    const cfg = JSON.parse(fs.readFileSync(writeOpencodeConfig(tmp, 's2', 'http://h/mcp', path.join(tmp, 'p.js'), theirs), 'utf8'))
    expect(cfg.mcp.stepbro.url).toBe('http://h/mcp')
  })

  it('goes into the environment with the hook address, and needs no shell function', () => {
    const env: Record<string, string> = {}
    applyAgentWrap(env, { hooksSettings: '/h.json', mcpConfig: '/m.json', mcpUrl: 'http://h/mcp', hookUrl: 'http://h/hooks/t/s', opencodeConfig: '/s.opencode.json' }, '/bin', 'linux')
    expect(env['OPENCODE_CONFIG']).toBe('/s.opencode.json')
    expect(env['STEP_HOOK_URL']).toBe('http://h/hooks/t/s')
    expect(env['STEP_REAL_CLAUDE']).toBeUndefined()
  })
})

/** Runs the plugin the way OpenCode would and collects what it posts. */
async function loadPlugin(url: string | undefined): Promise<{ hooks: any; posted: Array<Record<string, any>> }> {
  const file = writeAgentPlugins(path.join(tmp, 'bin'))
  const posted: Array<Record<string, any>> = []
  vi.stubGlobal('fetch', (target: string, init: { body: string }) => {
    expect(target).toBe(url)
    posted.push(JSON.parse(init.body))
    return Promise.resolve(new Response('{}'))
  })
  if (url) process.env['STEP_HOOK_URL'] = url
  else delete process.env['STEP_HOOK_URL']
  // A fresh copy each time: the module reads its environment once, when it loads.
  const mod = await import(pathToFileURL(file).href + `?t=${Date.now()}-${Math.random()}`)
  const hooks = await mod.StepbroPlugin({})
  await new Promise((r) => setTimeout(r, 0))
  return { hooks, posted }
}

describe('OpenCode plugin', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    delete process.env['STEP_HOOK_URL']
  })

  it('does nothing outside StepbroTerminal', async () => {
    const { hooks, posted } = await loadPlugin(undefined)
    expect(hooks).toEqual({})
    expect(posted).toEqual([])
  })

  it('announces itself and follows the conversation through the hook events Claude Code posts', async () => {
    const url = 'http://127.0.0.1:1/hooks/t/step1'
    const { hooks, posted } = await loadPlugin(url)
    expect(posted.map((p) => p.hook_event_name)).toEqual(['SessionStart'])

    await hooks.event({ event: { type: 'session.created', properties: { info: { id: 'ses_1' } } } })
    await hooks['chat.message']({ sessionID: 'ses_1', model: { providerID: 'p', modelID: 'big-model' } })
    await hooks.event({ event: { type: 'session.status', properties: { sessionID: 'ses_1', status: { type: 'busy' } } } })
    await hooks['tool.execute.before']({ tool: 'bash', sessionID: 'ses_1', callID: 'c1' }, { args: { command: 'ls' } })
    await hooks['tool.execute.after']({ tool: 'edit', sessionID: 'ses_1', callID: 'c2', args: { filePath: '/p/a.ts' } }, { title: '', output: '', metadata: {} })
    await hooks.event({ event: { type: 'permission.asked', properties: { id: 'perm1', sessionID: 'ses_1', type: 'bash', title: 'Run rm -rf build' } } })
    await hooks.event({ event: { type: 'permission.replied', properties: { sessionID: 'ses_1', permissionID: 'perm1', response: 'once' } } })
    await hooks.event({ event: { type: 'message.updated', properties: { info: { id: 'm2', sessionID: 'ses_1', role: 'assistant' } } } })
    await hooks.event({ event: { type: 'message.part.updated', properties: { part: { type: 'text', messageID: 'm2', sessionID: 'ses_1', text: 'All done here.' } } } })
    await hooks.event({ event: { type: 'session.idle', properties: { sessionID: 'ses_1' } } })
    await hooks.event({ event: { type: 'session.error', properties: { sessionID: 'ses_1', error: { name: 'ApiError', data: { message: 'rate limited' } } } } })
    await hooks.dispose()

    const names = posted.map((p) => p.hook_event_name)
    expect(names).toEqual([
      'SessionStart',
      'SessionStart',
      'PostModelSwitch',
      'UserPromptSubmit',
      'PostToolBatch',
      'PreToolUse',
      'PostToolUse',
      'Notification',
      'PostToolBatch',
      'Stop',
      'StopFailure',
      'SessionEnd'
    ])
    expect(posted[1].session_id).toBe('ses_1')
    expect(posted[2].to_model).toBe('big-model')
    expect(posted[5]).toMatchObject({ tool_name: 'bash', session_id: 'ses_1' })
    expect(posted[6]).toMatchObject({ tool_name: 'Edit', tool_input: { file_path: '/p/a.ts' } })
    expect(posted[7]).toMatchObject({ notification_type: 'permission_prompt', message: 'Run rm -rf build' })
    expect(posted[9]).toMatchObject({ last_assistant_message: 'All done here.' })
    expect(posted[10].error).toBe('rate limited')
  })

  it('ignores sub-agent sessions and treats its question tool as needing a person', async () => {
    const url = 'http://127.0.0.1:1/hooks/t/step2'
    const { hooks, posted } = await loadPlugin(url)
    await hooks['chat.message']({ sessionID: 'ses_main' })
    await hooks.event({ event: { type: 'session.created', properties: { info: { id: 'ses_child', parentID: 'ses_main' } } } })
    await hooks.event({ event: { type: 'session.idle', properties: { sessionID: 'ses_child' } } })
    await hooks['tool.execute.before']({ tool: 'read', sessionID: 'ses_child', callID: 'c' }, { args: {} })
    await hooks['tool.execute.before']({ tool: 'question', sessionID: 'ses_main', callID: 'q' }, { args: {} })
    expect(posted.map((p) => p.hook_event_name)).toEqual(['SessionStart', 'UserPromptSubmit', 'Notification'])
    expect(posted[2]).toMatchObject({ notification_type: 'agent_needs_input', session_id: 'ses_main' })
  })
})
