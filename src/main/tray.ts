import { app, BrowserWindow, Menu, nativeImage, Tray } from 'electron'
import fs from 'node:fs'
import { join } from 'node:path'
import { projectName } from '@shared/paths'
import type { LogoId, Prefs, Session } from '@shared/types'
import { iconsDir } from './branding'
import { t } from './i18n'

export type TrayMood = 'idle' | 'working' | 'attention'

export interface TrayDeps {
  getSessions: () => Session[]
  getWindow: () => BrowserWindow | null
  focusSession: (id: string) => void
  getPrefs: () => Prefs
}

const GLYPH: Record<string, string> = {
  working: '◌',
  attention: '●',
  done: '●',
  error: '✕',
  idle: '○',
  exited: '○',
  starting: '◌'
}

function loadIcon(mood: TrayMood, logo: LogoId): Electron.NativeImage {
  const file = process.platform === 'darwin' ? `tray-${mood}-mac-${logo}.png` : `tray-${mood}-${logo}.png`
  const p = join(iconsDir(), file)
  return fs.existsSync(p) ? nativeImage.createFromPath(p) : nativeImage.createEmpty()
}

export class StepTray {
  private tray: Tray | null = null
  private mood: TrayMood = 'idle'
  private shown = ''

  private logo(): LogoId {
    return this.deps.getPrefs().logo ?? 'light'
  }
  private timer: NodeJS.Timeout | null = null

  constructor(private readonly deps: TrayDeps) {}

  create(): void {
    try {
      this.tray = new Tray(loadIcon('idle', this.logo()))
    } catch {
      this.tray = null
      return
    }
    this.tray.setToolTip('stepbro terminal')
    this.tray.on('click', () => this.showWindow())
    this.refresh()
  }

  get isUp(): boolean {
    return this.tray !== null
  }

  destroy(): void {
    this.tray?.destroy()
    this.tray = null
  }

  update(): void {
    if (!this.tray) return
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => {
      this.timer = null
      this.refresh()
    }, 200)
  }

  private showWindow(): void {
    const w = this.deps.getWindow()
    if (!w) return
    if (w.isMinimized()) w.restore()
    w.show()
    w.focus()
  }

  refresh(): void {
    if (!this.tray) return
    const sessions = this.deps.getSessions()
    const working = sessions.filter((s) => s.status === 'working' || s.status === 'starting').length
    const attention = sessions.filter((s) => s.status === 'attention' || s.status === 'error').length
    const mood: TrayMood = attention ? 'attention' : working ? 'working' : 'idle'
    const shown = `${mood}/${this.logo()}`
    if (shown !== this.shown) {
      this.shown = shown
      this.mood = mood
      this.tray.setImage(loadIcon(mood, this.logo()))
    }
    const parts = ['stepbro terminal']
    if (working) parts.push(t('{n} working', { n: working }))
    if (attention) parts.push(t(attention === 1 ? '{n} needs you' : '{n} need you', { n: attention }))
    this.tray.setToolTip(parts.join(' · '))

    const byProject = new Map<string, Session[]>()
    for (const s of sessions) {
      const arr = byProject.get(s.projectPath) ?? []
      arr.push(s)
      byProject.set(s.projectPath, arr)
    }
    const template: Electron.MenuItemConstructorOptions[] = []
    for (const [project, list] of byProject) {
      template.push({ label: projectName(project), enabled: false })
      for (const s of list) {
        template.push({
          label: `   ${GLYPH[s.status] ?? '○'}  ${s.title || t('Untitled')}`,
          click: () => {
            this.showWindow()
            this.deps.focusSession(s.id)
          }
        })
      }
    }
    if (template.length) template.push({ type: 'separator' })
    template.push({ label: t('Show stepbro terminal'), click: () => this.showWindow() })
    template.push({ label: t('Quit stepbro terminal'), click: () => app.quit() })
    this.tray.setContextMenu(Menu.buildFromTemplate(template))
  }
}
