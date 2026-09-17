import { Terminal, type IDecoration, type IDisposable, type IMarker, type ITheme } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { SearchAddon } from '@xterm/addon-search'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { Unicode11Addon } from '@xterm/addon-unicode11'
import type { Prefs } from '@shared/types'
import { darkTerminal, lightTerminal } from '@/theme/terminalThemes'
import { InputLine, hintFor } from '@/lib/flagHints'
import { imagePaste, imagePathText, newlineSequence } from '@/lib/agentKeys'
import { FitHold } from './fitHold'

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
  /** The selection on screen, kept so it can go back when a program's mouse mode wipes it. */
  kept: { x: number; y: number; length: number } | null
  /** When a key or mouse button was last pressed here, and whether a button is still down: a selection that goes right after a press is the person's own doing. */
  gesture: { at: number; down: boolean }
}

const ACK_EVERY = 64 * 1024
const encoder = new TextEncoder()
/** Pressed on their own these change nothing on screen, so they are not the gesture that clears a selection. */
const MODIFIER_KEYS = new Set(['Control', 'Shift', 'Alt', 'Meta', 'AltGraph', 'CapsLock', 'NumLock'])

/**
 * OpenCode, Codex and Gemini send their mouse-mode sequences again on every redraw, and xterm
 * answers each one by disabling its selection service, which clears whatever is selected and stops
 * a drag in progress (the drag's mouse listeners go with the selection). So no selection survived
 * a redraw, and Ctrl+C, finding nothing to copy, interrupted the program instead. Disabling what is
 * already disabled changes nothing, so the repeat is ignored. Reaches into xterm's core: if that
 * ever moves, the terminal simply behaves as before.
 */
function keepSelectionAcrossRedraws(term: Terminal): void {
  const ss = (term as unknown as { _core?: { _selectionService?: { disable?: () => void; _enabled?: boolean } } })._core?._selectionService
  if (!ss || typeof ss.disable !== 'function' || typeof ss._enabled !== 'boolean') return
  const disable = ss.disable.bind(ss)
  ss.disable = () => {
    if (ss._enabled !== false) disable()
  }
}

/** A window listener that goes away with the terminal it serves. */
function onWindow<K extends keyof WindowEventMap>(type: K, fn: (ev: WindowEventMap[K]) => void): IDisposable {
  window.addEventListener(type, fn, true)
  return { dispose: () => window.removeEventListener(type, fn, true) }
}
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

  /**
   * Resolves once the terminal font is available in every weight the terminal draws with, or the
   * fallback is settled. Terminals must not open before this: xterm measures the cell from
   * whatever font is available at that moment, and a narrower fallback leaves every glyph
   * squeezed into a cell that is too small once the real font arrives.
   */
  async fontsReady(): Promise<void> {
    const family = fontStack(this.prefs?.fontFamily)
    try {
      const faces = ['400', '700'].map((w) => document.fonts.load(`${w} 13px ${family}`))
      await Promise.race([Promise.all(faces), new Promise((r) => setTimeout(r, 2000))])
      await document.fonts.ready
    } catch {
      /* fall back silently */
    }
  }

  /**
   * Re-measures cells and rebuilds the glyph atlas once a web font finishes loading. The WebGL
   * renderer caches its atlas by font settings, so setting the family back to the same string
   * would hand back the old glyphs; the family alternates with a trailing space instead, which
   * the browser reads identically and xterm treats as a new configuration.
   */
  private remeasureAll(): void {
    for (const e of this.entries.values()) {
      const f = e.term.options.fontFamily ?? ''
      this.syncSpacing(e)
      e.term.options.fontFamily = f.endsWith(' ') ? f.trimEnd() : f + ' '
      if (e.mounted) this.fitNow(e)
    }
  }

  /** Keeps the drawn size and weight right for the font and the screen the terminal is on now (see fittedSize). */
  private syncSpacing(e: Entry): void {
    const size = fittedSize(e.term.options.fontFamily ?? '', this.prefs?.fontSize ?? 13)
    if (e.term.options.fontSize !== size) e.term.options.fontSize = size
    if (e.term.options.letterSpacing !== 0) e.term.options.letterSpacing = 0
    const weight = textWeight()
    if (e.term.options.fontWeight !== weight) e.term.options.fontWeight = weight
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
      fontSize: fittedSize(fontStack(p?.fontFamily), p?.fontSize ?? 13),
      lineHeight: p?.lineHeight ?? 1,
      letterSpacing: 0,
      fontWeight: textWeight(),
      fontWeightBold: '700',
      customGlyphs: true,
      rescaleOverlappingGlyphs: true,
      scrollback: p?.scrollback ?? 5000,
      theme: themeFor(this.dark),
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
    const gesture = { at: 0, down: false }
    // Dragging selects text even while a program owns the mouse (Claude Code takes it for
    // scrolling). xterm only allows that with Shift held, so the press is replayed as if it were;
    // the wheel still reaches the program.
    container.addEventListener(
      'mousedown',
      (ev) => {
        if (ev.isTrusted) {
          gesture.at = performance.now()
          gesture.down = true
        }
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
      hintMuted: false,
      kept: null,
      gesture
    }
    entry.disposables.push(
      // OpenCode, Codex and Gemini send their mouse-mode sequences again as they redraw, and each
      // time xterm drops the selection along with them: Ctrl+C then found nothing to copy and
      // interrupted the program instead. A selection that vanishes with no key or click behind it
      // goes straight back.
      term.onSelectionChange(() => {
        if (term.hasSelection()) {
          const p = term.getSelectionPosition()
          entry.kept = p ? { x: p.start.x, y: p.start.y, length: (p.end.y - p.start.y) * term.cols + (p.end.x - p.start.x) } : null
          return
        }
        // Gone within a beat of a click or a key: the person cleared it. Gone mid-drag: xterm is
        // still drawing the drag, and the mouseup below puts it back if it is still missing then.
        if (performance.now() - gesture.at < 50 || term.modes.mouseTrackingMode === 'none') {
          entry.kept = null
          return
        }
        if (gesture.down) return
        this.restoreSelection(entry)
      }),
      term.buffer.onBufferChange(() => {
        entry.kept = null
      }),
      onWindow('mouseup', () => {
        gesture.down = false
        if (!term.hasSelection() && term.modes.mouseTrackingMode !== 'none') this.restoreSelection(entry)
      }),
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
      term.onResize(({ cols, rows }) => {
        entry.kept = null
        window.step.send('host:resize', id, cols, rows)
      })
    )
    term.attachCustomKeyEventHandler((ev) => this.handleKey(entry, ev))
    this.entries.set(id, entry)
    return entry
  }

  mount(id: string, parent: HTMLElement): Entry {
    const e = this.ensure(id)
    if (e.container.parentElement !== parent) parent.appendChild(e.container)
    if (!e.term.element) {
      e.term.open(e.container)
      // xterm builds its selection service in open(), so this is the first moment it can be reached.
      keepSelectionAcrossRedraws(e.term)
    }
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
    if (!e?.mounted) return
    if (this.holds.isHeld) {
      this.fitLater.add(id)
      return
    }
    this.fitNow(e)
  }

  // ---- holding fits while the layout is in motion ----

  private fitLater = new Set<string>()

  /**
   * While the sidebar is dragged or slides shut, every frame changes the cards' width, and a
   * terminal that refits on each one reflows its text and resizes the shell dozens of times a
   * second. Held, the terminals keep their columns and the card simply clips them; released,
   * every mounted one fits again.
   *
   * Every mounted one, rather than only those that asked while held, because the cost of a fit
   * that changes nothing is nothing, and the cost of missing one is a program left drawing at a
   * width the card no longer has.
   */
  private holds = new FitHold(() => {
    this.fitLater.clear()
    // A hold usually ends inside an animation frame, at the end of a tween. A fit there would
    // clear a WebGL canvas right away and redraw it only in the next frame, and the text would
    // blink; fitted from a task of its own, the redraw comes in the frame that shows the new size.
    window.setTimeout(() => {
      if (this.holds.isHeld) return
      for (const e of this.entries.values()) if (e.mounted) this.fitNow(e)
    }, 0)
  })

  holdFits(): void {
    this.holds.hold()
  }

  releaseFits(): void {
    this.holds.release()
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
    // The accent washes the card's colour, and the terminal paints the same colour, so it follows too.
    const themeChanged = this.dark !== dark || !!this.prefs && this.prefs.accent !== prefs.accent
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
        this.syncSpacing(e)
      }
      e.term.options.cursorStyle = prefs.cursorStyle
      e.term.options.cursorBlink = prefs.cursorBlink
      if (themeChanged) e.term.options.theme = themeFor(dark)
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
      e.term.loadAddon(addon as any)
      const drawNow = drawOnCanvasResize(e.term)
      const webgl = {
        dispose: () => {
          drawNow.disconnect()
          addon.dispose()
        }
      }
      addon.onContextLoss(() => {
        webgl.dispose()
        e.webgl = null
      })
      e.webgl = webgl
    } catch {
      this.webglSupported = false
    }
  }

  private fitNow(e: Entry): void {
    this.syncSpacing(e)
    try {
      e.fit.fit()
    } catch {
      /* container not laid out yet */
      return
    }
    // xterm only announces a size that changed, so a size the host missed would stay missed.
    // Saying it again here costs a message and is what makes a wrong width heal by itself.
    window.step.send('host:resize', e.id, e.term.cols, e.term.rows)
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
    if (!MODIFIER_KEYS.has(ev.key)) e.gesture.at = performance.now()
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
   * Text is pasted as usual. An image is handed to the program in front instead: Claude Code reads
   * the clipboard itself on its paste key, and everything else gets the image saved as a file and
   * its path pasted, which agents turn into an attachment and a shell can use as an argument.
   */
  private async paste(e: Entry): Promise<void> {
    const kind = await window.step.invoke('clipboard:kind')
    if (kind === 'image') {
      const agent = this.agentResolver(e.id)
      const how = imagePaste(agent, window.step.platform)
      if (how.kind === 'key') {
        window.step.send('host:input', e.id, new Uint8Array(how.bytes))
        return
      }
      const file = await window.step.invoke('clipboard:saveImage')
      if (file) e.term.paste(imagePathText(agent, file, window.step.platform))
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

  /** Puts back the selection a program's redraw wiped: same cells, so Ctrl+C still finds it. */
  private restoreSelection(e: Entry): void {
    const kept = e.kept
    e.kept = null
    if (!kept || kept.length <= 0) return
    e.term.select(kept.x, kept.y, kept.length)
  }
}

/** Windows build number (e.g. 26200 from "10.0.26200"), so xterm only applies the ConPTY workarounds that build needs. */
function windowsBuild(): number | undefined {
  const m = /\.(\d+)$/.exec(window.step.osVersion ?? '')
  return m ? Number(m[1]) : undefined
}

/**
 * The size to draw the font at so that a cell is a whole number of device pixels wide. xterm
 * floors the measured advance to whole pixels and the WebGL renderer squeezes any glyph wider
 * than its cell, so at 13 px JetBrains Mono (7.8 px advance) came out narrow and heavy; a pixel
 * of letter spacing fixed that but spread the letters apart. Rounding the size up to the next
 * whole-pixel advance instead keeps the font's own spacing, at a size a fraction larger: 13 px
 * becomes 13.33 on a plain screen and stays 13 where the pixels are finer.
 */
/**
 * The weight for ordinary text. On a plain screen the terminal's greyscale antialiasing thins
 * the strokes and the Regular face reads faint, so the Medium face carries the text there; on a
 * fine screen Regular has all the ink it needs, and Medium would read heavy.
 */
function textWeight(): '400' | '500' {
  return (window.devicePixelRatio || 1) < 1.5 ? '500' : '400'
}

function fittedSize(family: string, size: number): number {
  if (!measure) return size
  measure.font = `400 ${size}px ${family}`
  const advance = measure.measureText('W').width
  if (!(advance > 0)) return size
  const dpr = window.devicePixelRatio || 1
  const cell = Math.ceil(advance * dpr - 0.02)
  // A hair over the whole pixel: the browser measures 13.333 px as 7.998, which xterm floors to 7.
  return Math.round(((cell + 0.03) / ((advance / size) * dpr)) * 1000) / 1000
}

/**
 * The card's background as the browser actually paints it: the palette colour washed with the
 * accent. The terminal paints its own background, and with the palette's plain colour it sat as
 * a darker or lighter rectangle inside a tinted card. Resolved through a canvas, because the
 * computed value of a colour-mix is a colour() the terminal cannot read.
 */
function cardBackground(): string | null {
  const probe = document.createElement('div')
  probe.style.cssText = 'position:absolute;width:0;height:0;visibility:hidden;pointer-events:none;background:var(--bg-card)'
  document.body.appendChild(probe)
  const css = getComputedStyle(probe).backgroundColor
  probe.remove()
  const ctx = document.createElement('canvas').getContext('2d')
  if (!css || !ctx) return null
  ctx.fillStyle = css
  ctx.fillRect(0, 0, 1, 1)
  const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data
  if (a === 0) return null
  return '#' + [r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('')
}

/** The palette for the mode, painted on the card's own colour. */
function themeFor(dark: boolean): ITheme {
  const base = dark ? darkTerminal : lightTerminal
  const background = cardBackground()
  return background ? { ...base, background, cursorAccent: background } : base
}

function fontStack(family: string | undefined): string {
  const f = (family || 'JetBrains Mono').trim()
  const quoted = /\s/.test(f) && !f.startsWith('"') && !f.startsWith("'") ? `"${f}"` : f
  return `${quoted}, "JetBrains Mono", "Geist Mono", "SF Mono", "Cascadia Mono", Menlo, Consolas, monospace`
}

/**
 * The WebGL renderer watches its canvas's size in device pixels. When that changes it clears the
 * canvas and asks to be drawn on the next frame, which leaves one frame with no text in it: a
 * blink, each time a terminal grows at a zoom where its size in CSS pixels does not come out to
 * whole device pixels (the top bar closing, at 120%). This observer is made after the renderer's,
 * so it runs right after it in the same frame and draws what was asked for there and then.
 * It reaches into xterm's render debouncer, which has no public way to draw now; without it,
 * the blink simply comes back.
 */
function drawOnCanvasResize(term: Terminal): ResizeObserver {
  const observer = new ResizeObserver(() => {
    const core = (term as unknown as { _core?: { _renderService?: { _renderDebouncer?: { _innerRefresh?: () => void } } } })._core
    core?._renderService?._renderDebouncer?._innerRefresh?.()
  })
  for (const canvas of term.element?.querySelectorAll('.xterm-screen canvas') ?? []) observer.observe(canvas, { box: 'device-pixel-content-box' })
  return observer
}

export const registry = new TerminalRegistry()
