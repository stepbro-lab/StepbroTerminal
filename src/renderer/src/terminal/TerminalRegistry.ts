import { Terminal, type IDecoration, type IDisposable, type IMarker } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { SearchAddon } from '@xterm/addon-search'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { Unicode11Addon } from '@xterm/addon-unicode11'
import type { Prefs } from '@shared/types'
import { darkTerminal, lightTerminal } from '@/theme/terminalThemes'
import { InputLine, hintFor } from '@/lib/flagHints'
import { newlineSequence } from '@/lib/agentKeys'

interface Entry {
  id: string
  term: Terminal
  fit: FitAddon
  search: SearchAddon
  webgl: IDisposable | null
  container: HTMLDivElement
  hydrated: boolean
  /** While a snapshot is being written, xterm's replies to queries must not reach the PTY. */
  replaying: boolean
  ackPending: number
  ackTimer: number | null
  disposables: IDisposable[]
  mounted: boolean
  /** What has been typed on the current shell line, for flag hints. */
  line: InputLine
  /** Ghost text after the cursor, when a hint is showing. */
  hint: { text: string; cells: number; marker: IMarker; decoration: IDecoration } | null
  /** A keystroke changed the line; the hint is recomputed once the shell has echoed it. */
  hintDirty: boolean
  /** Escape hides hints until the next line. */
  hintMuted: boolean
}

const ACK_EVERY = 64 * 1024
const encoder = new TextEncoder()
const measure = document.createElement('canvas').getContext('2d')

type AppKeyHandler = (ev: KeyboardEvent) => boolean
type ContextMenuHandler = (id: string, x: number, y: number) => void
/** Which agent, if any, is in front in a session: it decides what Shift+Enter sends. */
type AgentResolver = (id: string) => string | null

/**
 * Keeps xterm instances alive outside React. Only the mounted terminal owns a WebGL
 * context; hidden ones keep their buffer and are re-attached on switch.
 */
class TerminalRegistry {
  private entries = new Map<string, Entry>()
  private prefs: Prefs | null = null
  private dark = false
  private webglSupported = true
  private appKeyHandler: AppKeyHandler = () => false
  private contextMenuHandler: ContextMenuHandler = () => {}
  private agentResolver: AgentResolver = () => null
  private webglCtor: (new () => IDisposable) | null = null

  constructor() {
    // When a web font finishes loading after a terminal was opened, force xterm to re-measure cells.
    document.fonts.addEventListener('loadingdone', () => this.remeasureAll())
  }

  setAppKeyHandler(fn: AppKeyHandler): void {
    this.appKeyHandler = fn
  }

  setContextMenuHandler(fn: ContextMenuHandler): void {
    this.contextMenuHandler = fn
  }

  setAgentResolver(fn: AgentResolver): void {
    this.agentResolver = fn
  }

  /** Clipboard-aware paste into a session (text, or the image key for agents). */
  pasteInto(id: string): Promise<void> {
    const e = this.entries.get(id)
    return e ? this.paste(e) : Promise.resolve()
  }

  /** Resolves once the configured terminal font is available (or the fallback is settled). */
  async fontsReady(): Promise<void> {
    const family = fontStack(this.prefs?.fontFamily)
    try {
      await Promise.race([document.fonts.load(`13px ${family}`), new Promise((r) => setTimeout(r, 1500))])
      await document.fonts.ready
    } catch {
      /* fall back silently */
    }
  }

  private remeasureAll(): void {
    for (const e of this.entries.values()) {
      const f = e.term.options.fontFamily
      e.term.options.fontFamily = f + ' '
      e.term.options.fontFamily = f
      if (e.mounted) this.fitNow(e)
    }
  }

  get(id: string): Entry | undefined {
    return this.entries.get(id)
  }

  ensure(id: string): Entry {
    const existing = this.entries.get(id)
    if (existing) return existing
    const p = this.prefs
    const term = new Terminal({
      allowProposedApi: true,
      cursorBlink: p?.cursorBlink ?? true,
      cursorStyle: p?.cursorStyle ?? 'bar',
      cursorWidth: 2,
      fontFamily: fontStack(p?.fontFamily),
      fontSize: p?.fontSize ?? 13,
      lineHeight: p?.lineHeight ?? 1.2,
      letterSpacing: 0,
      fontWeight: window.devicePixelRatio < 1.5 ? '500' : '400',
      fontWeightBold: '700',
      customGlyphs: true,
      rescaleOverlappingGlyphs: true,
      scrollback: p?.scrollback ?? 5000,
      theme: this.dark ? darkTerminal : lightTerminal,
      macOptionIsMeta: true,
      minimumContrastRatio: 1,
      drawBoldTextInBrightColors: false,
      scrollOnUserInput: true,
      smoothScrollDuration: 0,
      windowsPty: window.step.platform === 'win32' ? { backend: 'conpty', buildNumber: windowsBuild() } : undefined
    })
    const fit = new FitAddon()
    const search = new SearchAddon()
    term.loadAddon(fit)
    term.loadAddon(search)
    term.loadAddon(new Unicode11Addon())
    term.unicode.activeVersion = '11'
    term.loadAddon(new WebLinksAddon((_e, uri) => void window.step.invoke('app:openExternal', uri)))

    const container = document.createElement('div')
    container.className = 'absolute inset-0'
    container.dataset['sessionId'] = id
    container.addEventListener('contextmenu', (ev) => {
      ev.preventDefault()
      this.contextMenuHandler(id, ev.clientX, ev.clientY)
    })
    // Dragging selects text even while a program owns the mouse (Claude Code takes it for
    // scrolling). xterm only allows that with Shift held, so the press is replayed as if it were;
    // the wheel still reaches the program.
    container.addEventListener(
      'mousedown',
      (ev) => {
        if (ev.button !== 0 || ev.shiftKey || term.modes.mouseTrackingMode === 'none') return
        if (window.step.platform === 'darwin' && ev.altKey) return
        ev.stopPropagation()
        // Without this the browser moves focus off the terminal, xterm reports the focus loss, the
        // program repaints and re-enables the mouse, and xterm drops the selection it just started.
        ev.preventDefault()
        ev.target?.dispatchEvent(
          new MouseEvent('mousedown', {
            bubbles: true,
            cancelable: true,
            shiftKey: true,
            button: 0,
            buttons: 1,
            detail: ev.detail,
            clientX: ev.clientX,
            clientY: ev.clientY,
            screenX: ev.screenX,
            screenY: ev.screenY,
            ctrlKey: ev.ctrlKey,
            altKey: ev.altKey,
            metaKey: ev.metaKey
          })
        )
      },
      true
    )
    // Dropping files pastes their paths, quoted when needed.
    container.addEventListener('dragover', (ev) => ev.preventDefault())
    container.addEventListener('drop', (ev) => {
      ev.preventDefault()
      const files = Array.from(ev.dataTransfer?.files ?? [])
      if (!files.length) return
      const text = files
        .map((f) => window.step.pathForFile(f))
        .filter(Boolean)
        .map((p) => (/[\s"']/.test(p) ? `"${p}"` : p))
        .join(' ')
      if (text) term.paste(text)
    })

    const entry: Entry = {
      id,
      term,
      fit,
      search,
      webgl: null,
      container,
      hydrated: false,
      replaying: false,
      ackPending: 0,
      ackTimer: null,
      disposables: [],
      mounted: false,
      line: new InputLine(),
      hint: null,
      hintDirty: false,
      hintMuted: false
    }
    entry.disposables.push(
      term.onData((data) => {
        if (entry.replaying) return
        window.step.send('host:input', id, encoder.encode(data))
        this.noteInput(entry, data)
      }),
      // Hints wait for the shell's echo so the cursor is where the typed text ended.
      term.onWriteParsed(() => {
        if (entry.hintDirty || entry.hint) this.refreshHint(entry)
      }),
      term.onBinary((data) => {
        if (entry.replaying) return
        const bytes = new Uint8Array(data.length)
        for (let i = 0; i < data.length; i++) bytes[i] = data.charCodeAt(i) & 0xff
        window.step.send('host:input', id, bytes)
      }),
      term.onResize(({ cols, rows }) => window.step.send('host:resize', id, cols, rows))
    )
    term.attachCustomKeyEventHandler((ev) => this.handleKey(entry, ev))
    this.entries.set(id, entry)
    return entry
  }

  mount(id: string, parent: HTMLElement): Entry {
    const e = this.ensure(id)
    if (e.container.parentElement !== parent) parent.appendChild(e.container)
    if (!e.term.element) e.term.open(e.container)
    e.mounted = true
    this.loadWebgl(e)
    this.fitNow(e)
    e.term.focus()
    return e
  }

  unmount(id: string): void {
    const e = this.entries.get(id)
    if (!e) return
    e.mounted = false
    if (e.webgl) {
      e.webgl.dispose()
      e.webgl = null
    }
    e.container.remove()
  }

  fit(id: string): void {
    const e = this.entries.get(id)
    if (e?.mounted) this.fitNow(e)
  }

  focus(id: string): void {
    this.entries.get(id)?.term.focus()
  }

  /** Writes bytes; `replay` resets the buffer first and nudges the PTY so TUI apps repaint. */
  write(id: string, bytes: Uint8Array, replay: boolean): void {
    const e = this.ensure(id)
    if (replay) {
      if (e.hydrated) {
        // Reconnect: the terminal already holds this content; just account for the bytes.
        this.ack(e, bytes.byteLength)
        return
      }
      e.hydrated = true
      e.replaying = true
      this.clearHint(e)
      e.line.reset()
      e.term.reset()
      if (bytes.byteLength === 0) {
        e.replaying = false
        return
      }
      e.term.write(bytes, () => {
        e.replaying = false
        this.ack(e, bytes.byteLength)
      })
      return
    }
    e.term.write(bytes, () => this.ack(e, bytes.byteLength))
  }

  clear(id: string): void {
    const e = this.entries.get(id)
    if (!e) return
    this.clearHint(e)
    e.line.reset()
    e.term.reset()
    e.hydrated = true
  }

  markDetached(id: string): void {
    const e = this.entries.get(id)
    if (e) e.hydrated = false
  }

  dispose(id: string): void {
    const e = this.entries.get(id)
    if (!e) return
    this.unmount(id)
    this.clearHint(e)
    for (const d of e.disposables) d.dispose()
    e.term.dispose()
    this.entries.delete(id)
  }

  applyPrefs(prefs: Prefs, dark: boolean): void {
    const fontChanged =
      !this.prefs ||
      this.prefs.fontFamily !== prefs.fontFamily ||
      this.prefs.fontSize !== prefs.fontSize ||
      this.prefs.lineHeight !== prefs.lineHeight ||
      this.prefs.ligatures !== prefs.ligatures
    const themeChanged = this.dark !== dark
    const gpuChanged = !!this.prefs && this.prefs.gpuRendering !== prefs.gpuRendering
    this.prefs = prefs
    this.dark = dark
    for (const e of this.entries.values()) {
      if (!prefs.flagHints) this.clearHint(e)
      if (gpuChanged) {
        // Off: drop the WebGL layer and xterm falls back to its DOM renderer. On: bring it back where mounted.
        if (e.webgl) {
          e.webgl.dispose()
          e.webgl = null
        }
        if (prefs.gpuRendering && e.mounted) this.loadWebgl(e)
      }
      if (fontChanged) {
        e.term.options.fontFamily = fontStack(prefs.fontFamily)
        e.term.options.fontSize = prefs.fontSize
        e.term.options.lineHeight = prefs.lineHeight
      }
      e.term.options.cursorStyle = prefs.cursorStyle
      e.term.options.cursorBlink = prefs.cursorBlink
      if (themeChanged) e.term.options.theme = dark ? darkTerminal : lightTerminal
      if (this.prefs && e.term.options.scrollback !== prefs.scrollback) e.term.options.scrollback = prefs.scrollback
      if ((fontChanged || themeChanged) && e.mounted) {
        if (e.webgl) {
          e.webgl.dispose()
          e.webgl = null
          this.loadWebgl(e)
        }
        this.fitNow(e)
      }
    }
  }

  mountedIds(): string[] {
    return [...this.entries.values()].filter((e) => e.mounted).map((e) => e.id)
  }

  // ---- internals ----

  private async loadWebgl(e: Entry): Promise<void> {
    if (e.webgl || !this.webglSupported || !e.term.element || this.prefs?.gpuRendering === false) return
    try {
      if (!this.webglCtor) {
        const mod = await import('@xterm/addon-webgl')
        this.webglCtor = mod.WebglAddon as unknown as new () => IDisposable
      }
      if (!e.mounted || e.webgl) return
      const addon = new this.webglCtor() as IDisposable & { onContextLoss: (cb: () => void) => IDisposable }
      addon.onContextLoss(() => {
        addon.dispose()
        e.webgl = null
      })
      e.term.loadAddon(addon as any)
      e.webgl = addon
    } catch {
      this.webglSupported = false
    }
  }

  private fitNow(e: Entry): void {
    try {
      e.fit.fit()
    } catch {
      /* container not laid out yet */
    }
  }

  private ack(e: Entry, n: number): void {
    e.ackPending += n
    if (e.ackPending >= ACK_EVERY) {
      this.flushAck(e)
      return
    }
    if (e.ackTimer === null) {
      e.ackTimer = window.setTimeout(() => {
        e.ackTimer = null
        this.flushAck(e)
      }, 50)
    }
  }

  private flushAck(e: Entry): void {
    if (e.ackPending <= 0) return
    window.step.send('host:ack', e.id, e.ackPending)
    e.ackPending = 0
  }

  private handleKey(e: Entry, ev: KeyboardEvent): boolean {
    if (ev.type !== 'keydown') return true
    if (this.appKeyHandler(ev)) return false
    if (e.hint) {
      const plain = !ev.ctrlKey && !ev.altKey && !ev.metaKey && !ev.shiftKey
      if (plain && (ev.key === 'Tab' || ev.key === 'ArrowRight')) {
        // Returning false only keeps xterm out of it; the browser would still move focus on Tab.
        ev.preventDefault()
        this.acceptHint(e)
        return false
      }
      if (plain && ev.key === 'Escape') {
        ev.preventDefault()
        e.hintMuted = true
        this.clearHint(e)
        return false
      }
    }
    if (ev.key === 'Enter' && ev.shiftKey && !ev.ctrlKey && !ev.altKey && !ev.metaKey) {
      // Agents take Enter as send; give them their own line-break sequence instead.
      const seq = newlineSequence(this.agentResolver(e.id))
      if (seq) {
        ev.preventDefault()
        window.step.send('host:input', e.id, encoder.encode(seq))
        this.noteInput(e, seq)
        return false
      }
    }
    const mac = window.step.platform === 'darwin'
    const mod = mac ? ev.metaKey : ev.ctrlKey
    if (!mac && ev.ctrlKey && ev.shiftKey && ev.key.toLowerCase() === 'c') {
      this.copySelection(e)
      return false
    }
    const isPaste = mac ? ev.metaKey && ev.key.toLowerCase() === 'v' : ev.ctrlKey && ev.key.toLowerCase() === 'v'
    if (isPaste) {
      ev.preventDefault()
      void this.paste(e)
      return false
    }
    if (!mac && ev.ctrlKey && !ev.shiftKey && ev.key.toLowerCase() === 'c' && e.term.hasSelection()) {
      this.copySelection(e)
      e.term.clearSelection()
      return false
    }
    if (mac && mod && ev.key.toLowerCase() === 'c' && e.term.hasSelection()) {
      this.copySelection(e)
      return false
    }
    return true
  }

  /**
   * Text is pasted as usual. An image is handed to the program instead: agents such as Claude Code
   * read the clipboard themselves and show it as an [Image #n] chip. Claude listens for Ctrl+V on
   * macOS and Linux, and for Alt+V on Windows (where terminals usually swallow Ctrl+V).
   */
  private async paste(e: Entry): Promise<void> {
    const kind = await window.step.invoke('clipboard:kind')
    if (kind === 'image') {
      const key = window.step.platform === 'win32' ? [0x1b, 0x76] : [0x16]
      window.step.send('host:input', e.id, new Uint8Array(key))
      return
    }
    if (kind === 'text') {
      const text = await window.step.invoke('clipboard:readText')
      if (text) e.term.paste(text)
    }
  }

  // ---- flag hints: ghost text such as " --dangerously-skip-permissions" after "claude" ----

  private noteInput(e: Entry, data: string): void {
    e.line.feed(data)
    if (e.line.text === '') e.hintMuted = false
    e.hintDirty = true
    // The cursor only moves once the shell echoes, so anything shown now would be misplaced.
    this.clearHint(e)
  }

  private wantedHint(e: Entry): string | null {
    if (this.prefs?.flagHints === false || e.hintMuted || !e.line.known) return null
    // Full-screen programs own the keyboard; hints are for shell prompts only.
    if (e.term.buffer.active.type !== 'normal' || e.term.modes.mouseTrackingMode !== 'none') return null
    return hintFor(e.line.text)
  }

  private refreshHint(e: Entry): void {
    e.hintDirty = false
    this.clearHint(e)
    const text = this.wantedHint(e)
    if (!text) return
    const term = e.term
    const buf = term.buffer.active
    const cells = Math.min(text.length, term.cols - buf.cursorX)
    if (cells < 2) return
    const marker = term.registerMarker(0)
    if (!marker) return
    const decoration = term.registerDecoration({ marker, x: buf.cursorX, width: cells, layer: 'top' })
    if (!decoration) {
      marker.dispose()
      return
    }
    decoration.onRender((el) => this.paintHint(e, el, text, cells))
    e.hint = { text, cells, marker, decoration }
  }

  private paintHint(e: Entry, el: HTMLElement, text: string, cells: number): void {
    const o = e.term.options
    el.classList.add('step-ghost')
    el.textContent = text
    el.style.fontFamily = o.fontFamily ?? ''
    el.style.fontSize = `${o.fontSize}px`
    el.style.fontWeight = String(o.fontWeight ?? 'normal')
    el.style.lineHeight = el.style.height
    // Cells are a hair wider than the glyph advance; spread the letters so they sit on the grid.
    if (measure) {
      measure.font = `${el.style.fontWeight} ${el.style.fontSize} ${el.style.fontFamily}`
      const natural = measure.measureText('M').width
      const cell = parseFloat(el.style.width) / cells
      if (natural > 0 && cell > 0) el.style.letterSpacing = `${cell - natural}px`
    }
  }

  private acceptHint(e: Entry): void {
    const hint = e.hint
    if (!hint) return
    this.clearHint(e)
    window.step.send('host:input', e.id, encoder.encode(hint.text))
    e.line.feed(hint.text)
    e.hintDirty = true
  }

  private clearHint(e: Entry): void {
    if (!e.hint) return
    e.hint.decoration.dispose()
    e.hint.marker.dispose()
    e.hint = null
  }

  private copySelection(e: Entry): void {
    const text = e.term.getSelection()
    if (text) window.step.send('clipboard:write', text)
  }
}

/** Windows build number (e.g. 26200 from "10.0.26200"), so xterm only applies the ConPTY workarounds that build needs. */
function windowsBuild(): number | undefined {
  const m = /\.(\d+)$/.exec(window.step.osVersion ?? '')
  return m ? Number(m[1]) : undefined
}

function fontStack(family: string | undefined): string {
  const f = (family || 'JetBrains Mono').trim()
  const quoted = /\s/.test(f) && !f.startsWith('"') && !f.startsWith("'") ? `"${f}"` : f
  return `${quoted}, "JetBrains Mono", "SF Mono", "Cascadia Mono", Menlo, Consolas, monospace`
}

export const registry = new TerminalRegistry()
