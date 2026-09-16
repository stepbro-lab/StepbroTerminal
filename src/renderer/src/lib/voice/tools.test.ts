import { describe, expect, it, vi } from 'vitest'
import { oneLine, resolveSession, runTool, VOICE_FUNCTIONS, type VoiceApp, type VoiceSession } from './tools'

const sessions: VoiceSession[] = [
  { id: 'aaa', title: 'Cobros y pagos', agent: 'claude', folder: 'WinVault', status: 'working', active: false },
  { id: 'bbb', title: 'Shell', agent: 'shell', folder: 'StepTerminal', status: 'idle', active: true },
  { id: 'ccc', title: 'la web', agent: 'codex', folder: 'melon-mind', status: 'idle', active: false }
]

function fakeApp(over: Partial<VoiceApp> = {}): VoiceApp & { typed: Array<[string, string]>; entered: string[]; focused: string[] } {
  const typed: Array<[string, string]> = []
  const entered: string[] = []
  const focused: string[] = []
  return {
    typed,
    entered,
    focused,
    sessions: () => sessions,
    screen: () => 'PS C:\\> error: no such file',
    type: (id, text) => typed.push([id, text]),
    enter: (id) => entered.push(id),
    focus: (id) => focused.push(id),
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

describe('oneLine', () => {
  it('takes out what would submit a prompt before the person has read it', () => {
    // A newline in the middle of a prompt sends half of it; that must never reach the terminal.
    expect(oneLine('arregla el botón\rborra todo')).toBe('arregla el botón borra todo')
    expect(oneLine('una cosa\ny otra')).toBe('una cosa y otra')
  })

  it('takes out the rest of the control range, which drives the program instead of feeding it', () => {
    expect(oneLine('hola\u0003\u001b[Amundo')).toBe('hola [Amundo')
  })

  it('leaves ordinary words, accents and punctuation alone', () => {
    expect(oneLine('  arregla la sesión, por favor.  ')).toBe('arregla la sesión, por favor.')
  })
})

describe('runTool', () => {
  it('lists what is open, and says so when nothing is', () => {
    const listed = runTool(fakeApp(), 'list_sessions', {}).output as Array<{ id: string; in_front: boolean }>
    expect(listed).toHaveLength(3)
    expect(listed.find((s) => s.in_front)?.id).toBe('bbb')
    expect(runTool(fakeApp({ sessions: () => [] }), 'list_sessions', {}).output).toMatch(/No sessions/)
  })

  it('reads the screen of the session meant', () => {
    const out = runTool(fakeApp(), 'read_screen', { session: 'cobros' }).output as { session: string; screen: string }
    expect(out.session).toBe('Cobros y pagos')
    expect(out.screen).toContain('no such file')
  })

  it('writes a prompt on the input line, brings that session forward, and does not send it', () => {
    const app = fakeApp()
    const outcome = runTool(app, 'write_prompt', { text: 'arregla el archivado', session: 'la web' })
    expect(app.typed).toEqual([['ccc', 'arregla el archivado']])
    expect(app.focused).toEqual(['ccc'])
    expect(app.entered).toEqual([])
    expect(outcome.did).toEqual({ kind: 'wrote', session: 'la web', text: 'arregla el archivado' })
  })

  it('never writes anything that would send itself', () => {
    const app = fakeApp()
    runTool(app, 'write_prompt', { text: 'primero esto\ry luego lo otro' })
    expect(app.typed[0][1]).toBe('primero esto y luego lo otro')
    expect(app.entered).toEqual([])
  })

  it('writes nothing when there is nothing to write', () => {
    const app = fakeApp()
    expect(runTool(app, 'write_prompt', { text: '   ' }).output).toMatch(/no prompt/i)
    expect(app.typed).toEqual([])
  })

  it('sends only when sending is what was asked for', () => {
    const app = fakeApp()
    runTool(app, 'send_prompt', {})
    expect(app.entered).toEqual(['bbb'])
  })

  it('brings a session to the front', () => {
    const app = fakeApp()
    expect(runTool(app, 'focus_session', { session: 'claude' }).did).toEqual({ kind: 'focused', session: 'Cobros y pagos' })
    expect(app.focused).toEqual(['aaa'])
  })

  it('says so when asked for a tool that does not exist, instead of throwing', () => {
    expect(runTool(fakeApp(), 'rm_rf', {}).output).toMatch(/no tool called rm_rf/)
  })

  it('has nowhere to write when nothing is open', () => {
    const app = fakeApp({ sessions: () => [] })
    expect(runTool(app, 'write_prompt', { text: 'hola' }).output).toMatch(/No sessions are open/)
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

  it('names every tool the runner knows, and no others', () => {
    const app = fakeApp()
    for (const f of VOICE_FUNCTIONS) {
      const args = f.name === 'write_prompt' ? { text: 'x' } : f.name === 'focus_session' ? { session: 'aaa' } : {}
      // Some tools answer with an object and some with a sentence; either way it must be an answer.
      expect(JSON.stringify(runTool(app, f.name, args).output), f.name).not.toMatch(/no tool called/)
    }
  })
})

describe('the voice of it', () => {
  it('is told to keep quiet about sending on its own', async () => {
    vi.resetModules()
    const { VOICE_INSTRUCTIONS } = await import('./tools')
    expect(VOICE_INSTRUCTIONS).toMatch(/Never call send_prompt unless they ask/)
    expect(VOICE_INSTRUCTIONS).toMatch(/Speak the language they speak/)
  })
})
