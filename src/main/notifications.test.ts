import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Prefs, Session } from '@shared/types'

const shown = vi.hoisted(() => [] as Array<Record<string, unknown>>)
vi.mock('electron', () => ({
  app: { isPackaged: false, getAppPath: () => '/app' },
  BrowserWindow: class {},
  Notification: class {
    static isSupported = (): boolean => true
    constructor(readonly options: Record<string, unknown>) {}
    on(): void {}
    show(): void {
      shown.push(this.options)
    }
  }
}))

const { Notifier } = await import('./notifications')

const session = (status: Session['status']): Session => ({ id: 's1', title: 'Orchestrator', presetId: 'claude', status, agent: {} }) as Session

function notifier(prefs: Partial<Prefs>) {
  const playSound = vi.fn()
  const n = new Notifier({
    getPrefs: () => ({ notifications: true, sound: true, ...prefs }) as Prefs,
    getWindow: () => null,
    getActive: () => null,
    agentName: () => 'Claude Code',
    focusSession: () => {},
    playSound,
    log: () => {}
  })
  n.onSession(session('working'))
  return { n, playSound }
}

describe('Notifier', () => {
  beforeEach(() => {
    shown.length = 0
  })

  it('plays only the sound when notifications are off', () => {
    const { n, playSound } = notifier({ notifications: false, sound: true })
    n.onSession(session('attention'))
    expect(shown).toHaveLength(0)
    expect(playSound).toHaveBeenCalledTimes(1)
  })

  it('shows only the notification when the sound is off', () => {
    const { n, playSound } = notifier({ notifications: true, sound: false })
    n.onSession(session('attention'))
    expect(shown).toHaveLength(1)
    expect(playSound).not.toHaveBeenCalled()
  })

  it('keeps the system from playing a sound of its own', () => {
    const platform = Object.getOwnPropertyDescriptor(process, 'platform')!
    try {
      Object.defineProperty(process, 'platform', { value: 'win32' })
      notifier({}).n.onSession(session('attention'))
      Object.defineProperty(process, 'platform', { value: 'darwin' })
      notifier({}).n.onSession(session('done'))
    } finally {
      Object.defineProperty(process, 'platform', platform)
    }
    expect(String(shown[0].toastXml)).toContain('<audio silent="true"/>')
    expect(shown[1].silent).toBe(true)
  })
})
