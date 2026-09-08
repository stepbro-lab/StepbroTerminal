import { webContents, type WebContents } from 'electron'
import type { BrowserOp, BrowserResult } from '@shared/types'
import { arriveScript, clickScript, evalScript, focusScript, hidePresenceScript, readScript, scrollScript, showPresenceScript, type Who } from './previewScripts'

interface Pane {
  wcId: number
  console: Array<{ at: number; level: string; text: string }>
  off: () => void
}

export interface PreviewDeps {
  /** Opens the pane beside the session on the given address, and closes it. */
  show: (sessionId: string, url: string) => void
  hide: (sessionId: string) => void
  /** The agent in the session, as its cursor on the page should present it. */
  whoIs: (sessionId: string) => Who
  /** The agent is doing something with the pane right now; the window shows it. */
  activity: (sessionId: string) => void
}

const CONSOLE_KEEP = 200
const ATTACH_MS = 15_000
const LOAD_MS = 20_000
const SHOT_WIDTH = 1200

/**
 * The preview pane, driven from the main process on an agent's behalf. The renderer owns the
 * <webview> and tells us its webContents when it is up; from there the page is ours to load,
 * read, scroll, click, type into, run script in and photograph. One pane per session. Whatever
 * the agent does, the person sees: its cursor moves to the spot first, and the pane says who is
 * at work.
 */
export class PreviewBridge {
  private panes = new Map<string, Pane>()
  private waiting = new Map<string, Array<(p: Pane) => void>>()

  constructor(private readonly deps: PreviewDeps) {}

  /** The renderer's <webview> for a session is up. */
  attached(sessionId: string, wcId: number): void {
    const wc = webContents.fromId(wcId)
    if (!wc || wc.isDestroyed()) return
    const old = this.panes.get(sessionId)
    if (old?.wcId === wcId) return
    old?.off()
    const pane: Pane = { wcId, console: old?.console ?? [], off: () => {} }
    // Electron 32+ hands console messages as one details object; older builds as separate arguments.
    const onConsole = (...args: unknown[]): void => {
      const d = args[0] as { message?: string; level?: string | number }
      const fromDetails = typeof d?.message === 'string'
      const text = fromDetails ? d.message! : String(args[2] ?? '')
      const level = fromDetails ? String(d.level) : (LEVELS[Number(args[1])] ?? 'log')
      pane.console.push({ at: Date.now(), level, text })
      if (pane.console.length > CONSOLE_KEEP) pane.console.splice(0, pane.console.length - CONSOLE_KEEP)
    }
    ;(wc as unknown as { on: (ev: string, fn: (...a: unknown[]) => void) => void }).on('console-message', onConsole)
    pane.off = () => (wc as unknown as { off: (ev: string, fn: (...a: unknown[]) => void) => void }).off('console-message', onConsole)
    this.panes.set(sessionId, pane)
    const w = this.waiting.get(sessionId) ?? []
    this.waiting.delete(sessionId)
    for (const fn of w) fn(pane)
  }

  /** The <webview> went away (the pane closed, or another page took its place). */
  detached(sessionId: string): void {
    const pane = this.panes.get(sessionId)
    if (!pane) return
    pane.off()
    this.panes.delete(sessionId)
  }

  async handle(sessionId: string, op: BrowserOp): Promise<BrowserResult> {
    if (op.kind === 'close') {
      this.deps.hide(sessionId)
      return { url: '', title: '' }
    }
    this.deps.activity(sessionId)
    const who = this.deps.whoIs(sessionId)
    if (op.kind === 'open') return this.open(sessionId, op.url, who)
    const wc = this.contents(sessionId)
    const at = (): BrowserResult => ({ url: wc.getURL(), title: wc.getTitle() })
    switch (op.kind) {
      case 'screenshot': {
        // The picture is of the page alone; the cursor and ring come back with a flash, the way a camera would.
        await wc.executeJavaScript(hidePresenceScript, true).catch(() => undefined)
        const image = await wc.capturePage()
        await wc.executeJavaScript(showPresenceScript, true).catch(() => undefined)
        const { width } = image.getSize()
        const png = (width > SHOT_WIDTH ? image.resize({ width: SHOT_WIDTH }) : image).toPNG().toString('base64')
        return { ...at(), png }
      }
      case 'read':
        return { ...at(), text: String(await wc.executeJavaScript(readScript(op.what, op.target), true)) }
      case 'scroll':
        return { ...at(), text: String(await wc.executeJavaScript(scrollScript(op.to, op.target, who), true)) }
      case 'click': {
        const text = String(await wc.executeJavaScript(clickScript(op.target, who), true))
        await settled(wc, 1500)
        return { ...at(), text }
      }
      case 'type': {
        const field = String(await wc.executeJavaScript(focusScript(op.target, who), true))
        await wc.insertText(op.text)
        if (op.submit) {
          wc.sendInputEvent({ type: 'keyDown', keyCode: 'Return' })
          wc.sendInputEvent({ type: 'char', keyCode: 'Return' })
          wc.sendInputEvent({ type: 'keyUp', keyCode: 'Return' })
          await settled(wc, 1500)
        }
        return { ...at(), text: `Typed ${op.text.length} characters into ${field}${op.submit ? ' and pressed Enter' : ''}.` }
      }
      case 'eval':
        return { ...at(), text: clip(String(await wc.executeJavaScript(evalScript(op.js), true)), 20_000) }
      case 'console': {
        const pane = this.panes.get(sessionId)!
        const lines = pane.console.map((e) => `${new Date(e.at).toISOString().slice(11, 19)} [${e.level}] ${e.text}`)
        if (op.clear) pane.console.length = 0
        return { ...at(), text: clip(lines.join('\n'), 30_000) }
      }
    }
  }

  private contents(sessionId: string): WebContents {
    const pane = this.panes.get(sessionId)
    const wc = pane && webContents.fromId(pane.wcId)
    if (!wc || wc.isDestroyed()) throw new Error('No preview is open beside this session. Call open_preview first.')
    return wc
  }

  private async open(sessionId: string, url: string, who: Who): Promise<BrowserResult> {
    const pane = this.panes.get(sessionId)
    const existing = pane && webContents.fromId(pane.wcId)
    let wc: WebContents
    if (existing && !existing.isDestroyed()) {
      wc = existing
      try {
        await wc.loadURL(url)
      } catch (e) {
        // A redirect aborts the first load and finishes the second; anything else is a real failure.
        if (!/ERR_ABORTED/.test(String((e as Error)?.message ?? e))) throw new Error(`Could not load ${url}: ${String((e as Error)?.message ?? e)}`)
      }
    } else {
      this.deps.show(sessionId, url)
      const fresh = await this.waitAttached(sessionId)
      wc = webContents.fromId(fresh.wcId)!
    }
    await settled(wc, LOAD_MS)
    await wc.executeJavaScript(arriveScript(who), true).catch(() => undefined)
    return { url: wc.getURL(), title: wc.getTitle() }
  }

  private waitAttached(sessionId: string): Promise<Pane> {
    return new Promise((resolve, reject) => {
      const list = this.waiting.get(sessionId) ?? []
      const timer = setTimeout(() => {
        this.waiting.set(sessionId, (this.waiting.get(sessionId) ?? []).filter((f) => f !== done))
        reject(new Error('The preview pane did not open.'))
      }, ATTACH_MS)
      const done = (p: Pane): void => {
        clearTimeout(timer)
        resolve(p)
      }
      list.push(done)
      this.waiting.set(sessionId, list)
    })
  }
}

const LEVELS: Record<number, string> = { 0: 'debug', 1: 'log', 2: 'warning', 3: 'error' }

const clip = (s: string, n: number): string => (s.length > n ? `${s.slice(0, n)}\n…[${s.length - n} more characters not shown]` : s)

/** Resolves once the page stops loading, or after `ms` if it never does. */
function settled(wc: WebContents, ms: number): Promise<void> {
  if (!wc.isLoading()) return new Promise((r) => setTimeout(r, 150))
  return new Promise((resolve) => {
    let done = false
    const finish = (): void => {
      if (done) return
      done = true
      wc.off('did-stop-loading', finish)
      setTimeout(resolve, 150)
    }
    wc.on('did-stop-loading', finish)
    setTimeout(finish, ms)
  })
}
