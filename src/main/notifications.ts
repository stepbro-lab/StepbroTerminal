import { BrowserWindow, Notification } from 'electron'
import type { Prefs, Session, SessionStatus } from '@shared/types'
import { appLogoPath } from './branding'
import { noticeFor } from './noticeText'

export interface NotifierDeps {
  getPrefs: () => Prefs
  getWindow: () => BrowserWindow | null
  getActive: () => string | null
  /** The agent running in a session ("Claude Code", "Codex"), or null for a plain shell. */
  agentName: (s: Session) => string | null
  focusSession: (id: string) => void
  /** Plays the app's own notification sound (the renderer holds the audio file). */
  playSound: () => void
}

function pathToFileUrl(p: string): string {
  return 'file:///' + p.replace(/\\/g, '/')
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/**
 * Native notifications for sessions the user is not looking at. An agent that stops to ask
 * something gets a notice that says so by name, "Claude Code needs an answer", which stays on
 * screen until it is dismissed; clicking it brings that session forward. Finished and failed
 * sessions get an ordinary notice.
 */
export class Notifier {
  private last = new Map<string, SessionStatus>()

  constructor(private readonly deps: NotifierDeps) {}

  forget(id: string): void {
    this.last.delete(id)
  }

  /** Handles step://focus/<id> from a clicked notification. */
  handleUrl(url: string): boolean {
    const m = /^step:\/\/focus\/([0-9a-f-]+)/i.exec(url)
    if (!m) return false
    this.show(m[1])
    return true
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

    const notice = noticeFor(s, this.deps.agentName(s))
    if (!notice) return
    const { title, body, sticky } = notice
    const n =
      process.platform === 'win32'
        ? new Notification({ toastXml: this.toast(s.id, title, body, sticky), silent: true })
        : // macOS shows the app's own icon on the left by itself; an extra image would sit on the right.
          new Notification({ title, body, icon: process.platform === 'linux' ? appLogoPath() : undefined, silent: true })
    n.on('click', () => this.show(s.id))
    n.show()
    // The system sound stays off so only ours plays.
    if (prefs.sound) this.deps.playSound()
  }

  private show(id: string): void {
    const w = this.deps.getWindow()
    if (w) {
      if (w.isMinimized()) w.restore()
      w.show()
      w.focus()
    }
    this.deps.focusSession(id)
  }

  private toast(id: string, title: string, body: string, sticky: boolean): string {
    // A question stays on screen until it is dismissed; other notices time out normally.
    return `<toast activationType="protocol" launch="step://focus/${id}"${sticky ? ' scenario="reminder"' : ''}>
  <visual>
    <binding template="ToastGeneric">
      <image placement="appLogoOverride" src="${escapeXml(pathToFileUrl(appLogoPath()))}"/>
      <text hint-maxLines="1">${escapeXml(title)}</text>
      <text>${escapeXml(body)}</text>
    </binding>
  </visual>
</toast>`
  }
}
