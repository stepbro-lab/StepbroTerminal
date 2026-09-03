import { app, shell } from 'electron'
import { autoUpdater, type UpdateInfo } from 'electron-updater'
import type { UpdateState } from '@shared/types'

export const RELEASES_URL = 'https://github.com/kevin9038440334/StepbroTerminal-releases/releases/latest'
const FIRST_CHECK_MS = 15_000
const CHECK_EVERY_MS = 4 * 60 * 60 * 1000

/**
 * Whether this build can replace itself. The Windows installer and the Linux AppImage can;
 * macOS would need a signed app and a .deb belongs to the package manager.
 */
export function installsDirectly(platform = process.platform, env = process.env): boolean {
  if (platform === 'win32') return true
  if (platform === 'linux') return !!env['APPIMAGE']
  return false
}

interface UpdatesDeps {
  emit: (state: UpdateState) => void
  log: (...a: unknown[]) => void
}

/**
 * Keeps an eye on the releases repository. Where the package can replace itself the new
 * version is downloaded quietly and installed on the next restart; elsewhere the user is
 * pointed at the download page.
 */
export class Updates {
  state: UpdateState = { kind: 'idle' }
  private pending: UpdateInfo | null = null

  constructor(private readonly deps: UpdatesDeps) {
    const direct = installsDirectly()
    autoUpdater.autoDownload = direct
    autoUpdater.autoInstallOnAppQuit = direct
    autoUpdater.logger = {
      info: (m) => deps.log('updater:', m),
      warn: (m) => deps.log('updater:', m),
      error: (m) => deps.log('updater:', m),
      debug: () => {}
    }
    autoUpdater.on('checking-for-update', () => this.set({ kind: 'checking' }))
    autoUpdater.on('update-not-available', () => this.set({ kind: 'idle' }))
    autoUpdater.on('update-available', (info) => {
      this.pending = info
      this.set({ kind: 'available', version: info.version, direct })
    })
    autoUpdater.on('download-progress', (p) =>
      this.set({ kind: 'downloading', version: this.pending?.version ?? '', percent: Math.round(p.percent) })
    )
    autoUpdater.on('update-downloaded', (info) => this.set({ kind: 'ready', version: info.version }))
    autoUpdater.on('error', (e) => {
      deps.log('updater error', e?.message ?? e)
      this.set({ kind: 'error', message: String(e?.message ?? e) })
    })
  }

  /** Checks shortly after launch and then every few hours. Only packaged builds have somewhere to update from. */
  start(): void {
    if (!app.isPackaged) return
    setTimeout(() => void this.check(), FIRST_CHECK_MS)
    setInterval(() => void this.check(), CHECK_EVERY_MS)
  }

  async check(): Promise<UpdateState> {
    if (!app.isPackaged) return this.state
    if (this.state.kind === 'downloading' || this.state.kind === 'ready') return this.state
    try {
      await autoUpdater.checkForUpdates()
    } catch (e) {
      // Usually no network; the 'error' event has already recorded it.
      this.deps.log('update check failed', e)
    }
    return this.state
  }

  /** The natural next step: restart into the new version, fetch it, or open the download page. */
  async install(): Promise<void> {
    const s = this.state
    if (s.kind === 'ready') {
      autoUpdater.quitAndInstall()
      return
    }
    if (s.kind !== 'available') return
    if (s.direct) await autoUpdater.downloadUpdate()
    else await shell.openExternal(RELEASES_URL)
  }

  private set(state: UpdateState): void {
    this.state = state
    this.deps.emit(state)
  }
}
