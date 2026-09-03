import { BrowserWindow, Notification } from 'electron'
import type { Prefs, Session, SessionStatus } from '@shared/types'

export interface NotifierDeps {
  getPrefs: () => Prefs
  getWindow: () => BrowserWindow | null
  getActive: () => string | null
}

/** Fires a native notification when a session the user is not looking at needs attention or finishes. */
export class Notifier {
  private last = new Map<string, SessionStatus>()

  constructor(private readonly deps: NotifierDeps) {}

  forget(id: string): void {
    this.last.delete(id)
  }

  onSession(s: Session): void {
    const prev = this.last.get(s.id)
    this.last.set(s.id, s.status)
    if (prev === s.status) return
    if (s.status !== 'attention' && s.status !== 'done' && s.status !== 'error') return
    if (prev === undefined && s.status === 'done') return
    const prefs = this.deps.getPrefs()
    if (!prefs.notifications) return
    const win = this.deps.getWindow()
    const looking = !!win && win.isFocused() && !win.isMinimized() && this.deps.getActive() === s.id
    if (looking) return
    if (!Notification.isSupported()) return
    const body =
      s.status === 'attention' ? 'Needs your input' : s.status === 'error' ? (s.error ?? 'Something went wrong') : (s.agent.lastMessage ?? 'Finished')
    const n = new Notification({
      title: s.title || 'Session',
      body,
      silent: !prefs.sound
    })
    n.on('click', () => {
      const w = this.deps.getWindow()
      if (!w) return
      if (w.isMinimized()) w.restore()
      w.show()
      w.focus()
      w.webContents.send('ui:focusSession', s.id)
    })
    n.show()
  }
}
