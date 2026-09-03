import { app, BrowserWindow, Menu, nativeImage, Tray } from 'electron'
import fs from 'node:fs'
import { join } from 'node:path'
import { projectName } from '@shared/paths'
import type { Session } from '@shared/types'

export type TrayMood = 'idle' | 'working' | 'attention'

export interface TrayDeps {
  getSessions: () => Session[]
  getWindow: () => BrowserWindow | null
  focusSession: (id: string) => void
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

function iconPath(name: string): string {
  const base = app.isPackaged ? join(process.resourcesPath, 'icons') : join(app.getAppPath(), 'resources', 'icons')
  return join(base, name)
}

function loadIcon(mood: TrayMood): Electron.NativeImage {
  const mac = process.platform === 'darwin'
  const file = mac ? `tray-${mood}Template.png` : `tray-${mood}.png`
  const p = iconPath(file)
  if (fs.existsSync(p)) {
    const img = nativeImage.createFromPath(p)
    if (mac) img.setTemplateImage(true)
    return img
  }
  return nativeImage.createEmpty()
}

export class StepTray {
  private tray: Tray | null = null
  private mood: TrayMood = 'idle'
  private timer: NodeJS.Timeout | null = null

  constructor(private readonly deps: TrayDeps) {}

  create(): void {
    try {
      this.tray = new Tray(loadIcon('idle'))
    } catch {
      this.tray = null
      return
    }
    this.tray.setToolTip('StepbroTerminal')
    this.tray.on('click', () => this.showWindow())
    this.refresh()
  }

  destroy(): void {
    this.tray?.destroy()
    this.tray = null
  }

  /** Debounced rebuild of icon, tooltip and menu. */
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

  private refresh(): void {
    if (!this.tray) return
    const sessions = this.deps.getSessions()
    const working = sessions.filter((s) => s.status === 'working' || s.status === 'starting').length
    const attention = sessions.filter((s) => s.status === 'attention' || s.status === 'error').length
    const mood: TrayMood = attention ? 'attention' : working ? 'working' : 'idle'
    if (mood !== this.mood) {
      this.mood = mood
      this.tray.setImage(loadIcon(mood))
    }
    const parts = ['StepbroTerminal']
    if (working) parts.push(`${working} working`)
    if (attention) parts.push(`${attention} need you`)
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
          label: `   ${GLYPH[s.status] ?? '○'}  ${s.title || 'Untitled'}`,
          click: () => {
            this.showWindow()
            this.deps.focusSession(s.id)
          }
        })
      }
    }
    if (template.length) template.push({ type: 'separator' })
    template.push({ label: 'Show StepbroTerminal', click: () => this.showWindow() })
    template.push({ label: 'Quit StepbroTerminal', click: () => app.quit() })
    this.tray.setContextMenu(Menu.buildFromTemplate(template))
  }
}
