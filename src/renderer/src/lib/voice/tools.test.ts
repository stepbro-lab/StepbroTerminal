import { describe, expect, it } from 'vitest'
import {
  oneLine,
  resolveAgent,
  resolveFolder,
  resolveSession,
  runTool,
  VOICE_FUNCTIONS,
  VOICE_INSTRUCTIONS,
  type VoiceApp,
  type VoiceSession
} from './tools'

const sessions: VoiceSession[] = [
  { id: 'aaa', title: 'Cobros y pagos', agent: 'claude', folder: 'WinVault', status: 'working', active: false },
  { id: 'bbb', title: 'Shell', agent: 'shell', folder: 'StepTerminal', status: 'idle', active: true },
  { id: 'ccc', title: 'la web', agent: 'codex', folder: 'melon-mind', status: 'idle', active: false }
]

const folders = [
  { path: 'C:\\dev\\WinVault', name: 'WinVault' },
  { path: 'C:\\dev\\StepTerminal', name: 'StepTerminal' },
  { path: 'C:\\dev\\melon-mind', name: 'melon-mind' }
]

const agents = [
  { id: 'shell', name: 'Shell' },
  { id: 'claude', name: 'Claude Code' },
  { id: 'codex', name: 'Codex' }
]

interface Spy {
  typed: Array<[string, string]>
  entered: string[]
  focused: string[]
  opened: Array<[string, string]>
  splits: string[]
}

function fakeApp(over: Partial<VoiceApp> = {}): VoiceApp & Spy {
  const spy: Spy = { typed: [], entered: [], focused: [], opened: [], splits: [] }
  return {
    ...spy,
    sessions: () => sessions,
    folders: () => folders,
    agents: () => agents,
    screen: () => 'PS C:\\> error: no such file',
    type: (id, text) => spy.typed.push([id, text]),
    enter: (id) => spy.entered.push(id),
    focus: (id) => spy.focused.push(id),
    open: async (folder, preset) => {
      spy.opened.push([folder, preset])
      return 'new-id'
    },
    split: async (dir) => {
      spy.splits.push(dir)
    },
    ...over
  }
}

describe('resolveSession', () => {
  it('takes the one in front when nothing is named', () => {
    expect(resolveSession(sessions)?.id).toBe('bbb')
    expect(resolveSession(sessions, '')?.id).toBe('bbb')
  })

  it('finds one by id, by title and by the agent in it', () => {
    expect(resolveSession(sessions, 'aaa')?.id).toBe('aaa')
    expect(resolveSession(sessions, 'Cobros y pagos')?.id).toBe('aaa')
    expect(resolveSession(sessions, 'codex')?.id).toBe('ccc')
  })

  it('finds one from part of what was said, because nobody speaks in ids', () => {
    expect(resolveSession(sessions, 'cobros')?.id).toBe('aaa')
    expect(resolveSession(sessions, 'winvault')?.id).toBe('aaa')
    expect(resolveSession(sessions, 'el de codex')?.id).toBe('ccc')
  })

  it('falls back to the one in front rather than nothing at all', () => {
    expect(resolveSession(sessions, 'something nobody opened')?.id).toBe('bbb')
    expect(resolveSession([], 'anything')).toBeNull()
  })
})

describe('resolveFolder', () => {
  it('finds a folder by name, by path and by part of either', () => {
    expect(resolveFolder(folders, 'WinVault')?.name).toBe('WinVault')
    expect(resolveFolder(folders, 'C:\\dev\\melon-mind')?.name).toBe('melon-mind')
    expect(resolveFolder(folders, 'melon')?.name).toBe('melon-mind')
  })

  it('falls back to where the person already is', () => {
    expect(resolveFolder(folders, '', 'C:\\dev\\melon-mind')?.name).toBe('melon-mind')
    expect(resolveFolder(folders, 'nowhere', 'C:\\dev\\WinVault')?.name).toBe('WinVault')
    expect(resolveFolder([], 'anything')).toBeNull()
  })
})

describe('resolveAgent', () => {
  it('finds an agent by id or by name, however it was said', () => {
    expect(resolveAgent(agents, 'claude')?.id).toBe('claude')
    expect(resolveAgent(agents, 'Claude Code')?.id).toBe('claude')
    expect(resolveAgent(agents, 'abre un codex')?.id).toBe('codex')
  })

  it('opens a plain shell when no agent was meant, or none matches', () => {
    expect(resolveAgent(agents, '')?.id).toBe('shell')
    expect(resolveAgent(agents, 'some agent nobody installed')?.id).toBe('shell')
  })
})

describe('oneLine', () => {
  it('takes out what would submit a prompt before the person has read it', () => {
    // A newline in the middle of a prompt sends half of it; that must never reach the terminal.
    expect(oneLine('arregla el botón' + String.fromCharCode(13) + 'borra todo')).toBe('arregla el botón borra todo')
    expect(oneLine('una cosa\ny otra')).toBe('una cosa y otra')
  })

  it('takes out the rest of the control range, which drives the program instead of feeding it', () => {
    const withEscape = 'hola' + String.fromCharCode(3) + String.fromCharCode(27) + '[Amundo'
    expect(oneLine(withEscape)).toBe('hola [Amundo')
  })

  it('leaves ordinary words, accents and punctuation alone', () => {
    expect(oneLine('  arregla la sesión, por favor.  ')).toBe('arregla la sesión, por favor.')
  })
})

describe('runTool', () => {
  it('lists what is open, and says so when nothing is', async () => {
    const listed = (await runTool(fakeApp(), 'list_sessions', {})).output as Array<{ id: string; in_front: boolean }>
    expect(listed).toHaveLength(3)
    expect(listed.find((s) => s.in_front)?.id).toBe('bbb')
    expect((await runTool(fakeApp({ sessions: () => [] }), 'list_sessions', {})).output).toMatch(/No sessions/)
  })

  it('lists the folders and the agents together, which is what opening one needs', async () => {
    const out = (await runTool(fakeApp(), 'list_folders', {})).output as { folders: string[]; agents: string[] }
    expect(out.folders).toContain('melon-mind')
    expect(out.agents).toContain('Claude Code')
  })

  it('reads the screen of the session meant', async () => {
    const out = (await runTool(fakeApp(), 'read_screen', { session: 'cobros' })).output as { session: string; screen: string }
    expect(out.session).toBe('Cobros y pagos')
    expect(out.screen).toContain('no such file')
  })

  it('writes a prompt on the input line, brings that session forward, and does not send it', async () => {
    const app = fakeApp()
    const outcome = await runTool(app, 'write_prompt', { text: 'arregla el archivado', session: 'la web' })
    expect(app.typed).toEqual([['ccc', 'arregla el archivado']])
    expect(app.focused).toEqual(['ccc'])
    expect(app.entered).toEqual([])
    expect(outcome.did).toEqual({ kind: 'wrote', session: 'la web', text: 'arregla el archivado' })
  })

  it('never writes anything that would send itself', async () => {
    const app = fakeApp()
    await runTool(app, 'write_prompt', { text: 'primero esto' + String.fromCharCode(13) + 'y luego lo otro' })
    expect(app.typed[0][1]).toBe('primero esto y luego lo otro')
    expect(app.entered).toEqual([])
  })

  it('writes nothing when there is nothing to write', async () => {
    const app = fakeApp()
    expect((await runTool(app, 'write_prompt', { text: '   ' })).output).toMatch(/no prompt/i)
    expect(app.typed).toEqual([])
  })

  it('sends only when sending is what was asked for', async () => {
    const app = fakeApp()
    await runTool(app, 'send_prompt', {})
    expect(app.entered).toEqual(['bbb'])
  })

  it('brings a session to the front', async () => {
    const app = fakeApp()
    expect((await runTool(app, 'focus_session', { session: 'claude' })).did).toEqual({ kind: 'focused', session: 'Cobros y pagos' })
    expect(app.focused).toEqual(['aaa'])
  })

  it('opens a terminal in the folder and with the agent that were asked for', async () => {
    const app = fakeApp()
    const outcome = await runTool(app, 'open_session', { folder: 'melon', agent: 'claude' })
    expect(app.opened).toEqual([['C:\\dev\\melon-mind', 'claude']])
    expect(outcome.did).toEqual({ kind: 'opened', session: 'Claude Code in melon-mind' })
  })

  it('opens a shell where the person already is when neither was said', async () => {
    const app = fakeApp()
    await runTool(app, 'open_session', {})
    // The session in front is the shell in StepTerminal, so that is where a new one belongs.
    expect(app.opened).toEqual([['C:\\dev\\StepTerminal', 'shell']])
  })

  it('says so when the terminal would not start', async () => {
    const app = fakeApp({ open: async () => null })
    expect((await runTool(app, 'open_session', { folder: 'WinVault' })).output).toMatch(/would not start/)
  })

  it('has nowhere to open a terminal when the sidebar is empty', async () => {
    const app = fakeApp({ folders: () => [] })
    expect((await runTool(app, 'open_session', {})).output).toMatch(/no folders/i)
    expect(app.opened).toEqual([])
  })

  it('splits to the right by default, and down when asked', async () => {
    const app = fakeApp()
    await runTool(app, 'split_pane', {})
    await runTool(app, 'split_pane', { direction: 'down' })
    expect(app.splits).toEqual(['row', 'column'])
  })

  it('says so when asked for a tool that does not exist, instead of throwing', async () => {
    expect((await runTool(fakeApp(), 'rm_rf', {})).output).toMatch(/no tool called rm_rf/)
  })

  it('has nowhere to write when nothing is open', async () => {
    const app = fakeApp({ sessions: () => [] })
    expect((await runTool(app, 'write_prompt', { text: 'hola' })).output).toMatch(/No sessions are open/)
    expect(app.typed).toEqual([])
  })
})

describe('what the model is offered', () => {
  it('keeps writing a prompt and sending it as two separate tools', () => {
    const names = VOICE_FUNCTIONS.map((f) => f.name)
    expect(names).toContain('write_prompt')
    expect(names).toContain('send_prompt')
    const write = VOICE_FUNCTIONS.find((f) => f.name === 'write_prompt')!
    expect(write.parameters.required).toEqual(['text'])
    expect(VOICE_FUNCTIONS.find((f) => f.name === 'send_prompt')!.description).toMatch(/only ever call this when the person asks/i)
  })

  it('offers opening a terminal and splitting one, so it is not only a typist', () => {
    const names = VOICE_FUNCTIONS.map((f) => f.name)
    expect(names).toEqual(expect.arrayContaining(['list_folders', 'open_session', 'split_pane']))
  })

  it('names every tool the runner knows, and no others', async () => {
    const app = fakeApp()
    for (const f of VOICE_FUNCTIONS) {
      const args = f.name === 'write_prompt' ? { text: 'x' } : f.name === 'focus_session' ? { session: 'aaa' } : {}
      // Some tools answer with an object and some with a sentence; either way it must be an answer.
      expect(JSON.stringify((await runTool(app, f.name, args)).output), f.name).not.toMatch(/no tool called/)
    }
  })
})

describe('the voice of it', () => {
  it('is told to keep quiet about sending on its own, and that it may open terminals', () => {
    expect(VOICE_INSTRUCTIONS).toMatch(/Never call send_prompt unless they ask/)
    expect(VOICE_INSTRUCTIONS).toMatch(/Speak the language they speak/)
    expect(VOICE_INSTRUCTIONS).toMatch(/open_session/)
  })
})
