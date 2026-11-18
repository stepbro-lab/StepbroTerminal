import { BrowserWindow, Notification } from 'electron'
import type { Prefs, Session, SessionStatus } from '@shared/types'
import { appLogoPath } from './branding'
import { noticeFor } from './noticeText'

export interface NotifierDeps {
  getPrefs: () => Prefs
  getWindow: () => BrowserWindow | null
  getActive: () => string | null
  agentName: (s: Session) => string | null
  focusSession: (id: string) => void
  playSound: () => void
  log: (...parts: unknown[]) => void
}

function pathToFileUrl(p: string): string {
  return 'file:///' + p.replace(/\\/g, '/')
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export class Notifier {
  private last = new Map<string, SessionStatus>()

  constructor(private readonly deps: NotifierDeps) {}

  forget(id: string): void {
    this.last.delete(id)
  }

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
    if (!Notification.isSupported()) {
      this.deps.log('notification not supported here; nothing shown for', s.id.slice(0, 8), s.status)
      return
    }

    const notice = noticeFor(s, this.deps.agentName(s))
    if (!notice) return
    const { title, body, sticky } = notice
    const n =
      process.platform === 'win32'
        ? new Notification({ toastXml: this.toast(s.id, title, body, sticky), silent: true })
        :
          new Notification({ title, body, icon: process.platform === 'linux' ? appLogoPath(this.deps.getPrefs().logo ?? 'light') : undefined, silent: true })
    n.on('click', () => this.show(s.id))
    // macOS refuses notifications from an unsigned bundle, and only says so here.
    n.on('failed', (_e, error) => this.deps.log('notification failed', s.id.slice(0, 8), s.status, error))
    n.on('show', () => this.deps.log('notification shown', s.id.slice(0, 8), s.status, title))
    n.show()
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
    return `<toast activationType="protocol" launch="step://focus/${id}"${sticky ? ' scenario="reminder"' : ''}>
  <visual>
    <binding template="ToastGeneric">
      <image placement="appLogoOverride" src="${escapeXml(pathToFileUrl(appLogoPath(this.deps.getPrefs().logo ?? 'light')))}"/>
      <text hint-maxLines="1">${escapeXml(title)}</text>
      <text>${escapeXml(body)}</text>
    </binding>
  </visual>
</toast>`
  }
}
