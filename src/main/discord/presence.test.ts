import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Session } from '@shared/types'
import { DiscordPresence, activityFor } from './presence'
import type { DiscordLink } from './ipc'

const s = (presetId: string, status: Session['status'] = 'idle', over: Partial<Session> = {}): Session =>
  ({ id: Math.random().toString(36), presetId, status, alive: true, title: 'secret-project', projectPath: '/Users/me/secret-project', agent: {}, ...over }) as Session

const names: Record<string, string> = { claude: 'Claude Code', codex: 'Codex', opencode: 'OpenCode' }
const agentName = (x: Session) => names[x.presetId] ?? null

describe('what a Discord profile shows', () => {
  it('names the agents and how many are at work', () => {
    const a = activityFor([s('claude', 'working'), s('codex', 'working'), s('shell')], agentName, 1000)
    expect(a).toMatchObject({ details: 'Coding with Claude Code and Codex', state: '2 agents working', timestamps: { start: 1000 } })
    expect(activityFor([s('claude', 'working')], agentName, 0)).toMatchObject({ details: 'Coding with Claude Code', state: '1 agent working' })
    expect(activityFor([s('claude'), s('codex'), s('opencode')], agentName, 0)).toMatchObject({ details: 'Coding with 3 agents', state: '3 sessions open' })
  })

  it('says it is in the terminal with only shells, and counts open sessions while nobody works', () => {
    expect(activityFor([s('shell'), s('shell', 'working')], agentName, 0)).toMatchObject({ details: 'In the terminal', state: '2 sessions open' })
    expect(activityFor([s('shell')], agentName, 0)).toMatchObject({ state: '1 session open' })
    expect(activityFor([], agentName, 0)).not.toHaveProperty('state')
  })

  it('leaves out closed and archived sessions', () => {
    const a = activityFor([s('claude', 'working', { alive: false }), s('codex', 'idle', { archived: true }), s('shell')], agentName, 0)
    expect(a).toMatchObject({ details: 'In the terminal', state: '1 session open' })
  })

  it('never carries a folder or a session name', () => {
    const text = JSON.stringify(activityFor([s('claude', 'working'), s('shell')], agentName, 0))
    expect(text).not.toContain('secret-project')
  })

  it('carries the logo chosen in Settings and a link to get the app', () => {
    const a = activityFor([], agentName, 0) as any
    expect(a.assets).toEqual({ large_image: 'dock-light', large_text: 'stepbro terminal' })
    expect((activityFor([], agentName, 0, 'dark') as any).assets.large_image).toBe('dock-dark')
    expect(a.buttons[0].url).toBe('https://github.com/stepbro-lab/StepbroTerminal/releases')
  })
})

describe('keeping the profile up to date', () => {
  let sessions: Session[]
  let enabled: boolean
  let sent: Array<Record<string, unknown> | null>
  let closes: Array<(reason: string) => void>
  let closed: number
  let attempts: number
  let discordOpen: boolean

  const link = (): DiscordLink => ({
    setActivity: (a) => sent.push(a),
    close: () => closed++,
    onClose: (fn) => closes.push(fn),
    onError: () => {}
  })
  const presence = () =>
    new DiscordPresence({
      enabled: () => enabled,
      sessions: () => sessions,
      agentName,
      log: () => {},
      clientId: 'app',
      connect: async () => {
        attempts++
        if (!discordOpen) throw new Error('Discord is not running')
        return link()
      }
    })
  const flush = async (ms = 0) => {
    await vi.advanceTimersByTimeAsync(ms)
  }

  beforeEach(() => {
    vi.useFakeTimers()
    sessions = [s('claude', 'working')]
    enabled = true
    sent = []
    closes = []
    closed = 0
    attempts = 0
    discordOpen = true
  })
  afterEach(() => vi.useRealTimers())

  it('sends the activity once connected, and again only when the words change', async () => {
    const p = presence()
    p.update()
    await flush()
    expect(sent).toHaveLength(1)
    p.update()
    await flush(10_000)
    expect(sent).toHaveLength(1)
    sessions = [s('claude')]
    p.update()
    await flush(10_000)
    expect(sent).toHaveLength(2)
    expect(sent[1]).toMatchObject({ state: '1 session open' })
  })

  it('sends no faster than Discord takes, with the latest words', async () => {
    const p = presence()
    p.update()
    await flush()
    sessions = [s('claude')]
    p.update()
    sessions = [s('claude'), s('codex')]
    p.update()
    await flush(1000)
    expect(sent).toHaveLength(1)
    await flush(5000)
    expect(sent).toHaveLength(2)
    expect(sent[1]).toMatchObject({ details: 'Coding with Claude Code and Codex' })
  })

  it('looks for Discord again a while after not finding it, not on every change', async () => {
    discordOpen = false
    const p = presence()
    p.update()
    await flush()
    p.update()
    p.update()
    await flush(1000)
    expect(attempts).toBe(1)
    discordOpen = true
    await flush(30_000)
    expect(attempts).toBe(2)
    expect(sent).toHaveLength(1)
  })

  it('goes back to looking when Discord quits', async () => {
    const p = presence()
    p.update()
    await flush()
    closes[0]('closed')
    await flush(30_000)
    expect(attempts).toBe(2)
    expect(sent).toHaveLength(2)
  })

  it('lets go when turned off in Settings, and on quit', async () => {
    const p = presence()
    p.update()
    await flush()
    enabled = false
    p.update()
    expect(closed).toBe(1)
    enabled = true
    p.update()
    await flush()
    expect(attempts).toBe(2)
    p.stop()
    expect(closed).toBe(2)
  })

  it('does nothing without an application id', async () => {
    const p = new DiscordPresence({ enabled: () => true, sessions: () => sessions, agentName, log: () => {}, clientId: '', connect: async () => (attempts++, link()) })
    p.update()
    await flush(60_000)
    expect(attempts).toBe(0)
  })
})
