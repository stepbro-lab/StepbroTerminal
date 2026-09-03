import { BrowserWindow, Notification } from 'electron'
import type { Prefs, Session, SessionStatus } from '@shared/types'

export interface NotifierDeps {
  getPrefs: () => Prefs
  getWindow: () => BrowserWindow | null
  getActive: () => string | null
  /** Sends raw bytes to a session's PTY. */
  input: (id: string, bytes: Uint8Array) => void
  focusSession: (id: string) => void
}

const ENTER = new Uint8Array([0x0d])
const ESCAPE = new Uint8Array([0x1b])

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/**
 * Native notifications for sessions the user is not looking at. When a session waits for
 * permission the notification carries Allow and Deny: on macOS as notification actions, on
 * Windows as toast buttons that launch step://allow/<id> and step://deny/<id>.
 */
export class Notifier {
  private last = new Map<string, SessionStatus>()

  constructor(private readonly deps: NotifierDeps) {}

  forget(id: string): void {
    this.last.delete(id)
  }

  /** Answers a prompt in a session: Enter accepts the highlighted "Yes", Escape declines. */
  respond(id: string, allow: boolean): void {
    this.deps.input(id, allow ? ENTER : ESCAPE)
  }

  /** Handles step://allow/<id>, step://deny/<id> and step://focus/<id>. */
  handleUrl(url: string): boolean {
    const m = /^step:\/\/(allow|deny|focus)\/([0-9a-f-]+)/i.exec(url)
    if (!m) return false
    const [, verb, id] = m
    if (verb === 'allow') this.respond(id, true)
    else if (verb === 'deny') this.respond(id, false)
    else this.show(id)
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

    const title = s.title || 'Session'
    const waiting = s.status === 'attention'
    const body = waiting ? 'Needs your input' : s.status === 'error' ? (s.error ?? 'Something went wrong') : (s.agent.lastMessage ?? 'Finished')
    const n =
      process.platform === 'win32'
        ? new Notification({ toastXml: this.toast(s.id, title, body, waiting), silent: !prefs.sound })
        : new Notification({
            title,
            body,
            silent: !prefs.sound,
            actions: process.platform === 'darwin' && waiting ? [{ type: 'button', text: 'Allow' }, { type: 'button', text: 'Deny' }] : undefined
          })
    n.on('click', () => this.show(s.id))
    n.on('action', (_e, index) => this.respond(s.id, index === 0))
    n.show()
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

  private toast(id: string, title: string, body: string, waiting: boolean): string {
    const actions = waiting
      ? `<actions>
    <action content="Allow" arguments="step://allow/${id}" activationType="protocol"/>
    <action content="Deny" arguments="step://deny/${id}" activationType="protocol"/>
  </actions>`
      : ''
    // A permission prompt stays on screen until answered; other notices time out normally.
    return `<toast activationType="protocol" launch="step://focus/${id}"${waiting ? ' scenario="reminder"' : ''}>
  <visual>
    <binding template="ToastGeneric">
      <text hint-maxLines="1">${escapeXml(title)}</text>
      <text>${escapeXml(body)}</text>
      <text placement="attribution">Step</text>
    </binding>
  </visual>
  ${actions}
</toast>`
  }
}
