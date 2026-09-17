import type http from 'node:http'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { z } from 'zod'
import { TOPITO_MOODS, type BrowserOp, type BrowserResult, type Note, type NoteSource, type Session, type TopitoMood, type TopitoSay } from '@shared/types'
import type { NoteStore } from './NoteStore'
import type { AgentBus } from './AgentBus'
import { agentOf, pickSession } from './handoff'
import { TopitoGate } from './topitoGate'

export interface McpDeps {
  notes: NoteStore
  bus: AgentBus
  session: (id: string) => Session | undefined
  sessions: () => Session[]
  /** Types text into another session on behalf of the caller; `suffix` is typed too but kept out of the session's title. */
  /** Types into the session now, or holds the text until the agent there is free. */
  send: (from: string, to: string, text: string, submit: boolean, suffix?: string) => 'typed' | 'held' | 'lost'
  /** The last lines on a session's screen, scrollback included. */
  screen: (id: string, lines: number) => Promise<string[]>
  /** Something for the preview pane beside a session: the app does it and reports back. */
  browser: (sessionId: string, op: BrowserOp, timeoutMs?: number) => Promise<BrowserResult>
  /** Has Topito, the mole in the person's window, come out with a few words from an agent. */
  topito: (say: TopitoSay) => void
  version: string
}

// Claude Code gives an MCP tool call well under four minutes before it gives up on it; the wait
// stays short and says to call again, which costs nothing.
const WAIT_DEFAULT_S = 45
const WAIT_MAX_S = 120
/** After work is handed over, the target counts as busy this long even if its status has not moved yet. */
const SETTLE_MS = 5000

const INSTRUCTIONS = `You are running inside stepbro terminal, next to other sessions, and this server lets you work with them. Two layers:
- Sessions are terminals. list_sessions shows them, read_screen shows what is on one, send_to_session types into one as if the user had.
- Agents talk to each other with report. A message you send with report shows up in the other agent's conversation as soon as it is free, the same way a message from another agent arrives in yours as a new turn.
To delegate: send_to_session the task, then end your turn. Do not sit waiting: the answer arrives in your conversation as a message, and you continue from there. Keep the conversation going: answer questions, ask for what you need, and say when you are done. When someone hands you work, report back to them when you finish. wait exists for the rare case where you must block, for example to watch a session finish; it is not needed to receive messages.
- Topito is the little mole in the person's window. The topito tool has him come out at the corner of their terminal with a short message from you, which they notice even while looking at another session. Keep it for what needs their eyes now.
- The preview pane is a browser beside your session. open_preview shows a page there (the dev server you started, a site the user names); then preview_screenshot shows you what it looks like, preview_read gives its text or an outline of its headings, links, buttons and fields, and preview_scroll, preview_click, preview_type, preview_eval and preview_console let you work the page and watch its console. Open it when the user asks to see something, and when you need to check what a page shows.`

/**
 * The MCP endpoint agents get per session (`claude --mcp-config`, `codex -c mcp_servers…`).
 * Notes, the other sessions, and a way for agents to coordinate. Stateless: a server per request
 * is cheap and keeps request ids from colliding between sessions.
 */
export async function handleMcp(deps: McpDeps, sessionId: string, req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const server = buildServer(deps, sessionId)
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })
  res.on('close', () => {
    void transport.close()
    void server.close()
  })
  await server.connect(transport)
  await transport.handleRequest(req, res)
}

// The server is built anew for every request, so what Topito remembers lives out here.
const topitoGate = new TopitoGate()

const short = (id: string): string => id.slice(0, 8)
const label = (s: Session): string => s.title || '(untitled)'
const line = (s: Session): string => `[${short(s.id)}] ${label(s)} — ${agentOf(s)}, ${s.alive ? s.status : 'exited'}, ${s.projectPath}`
const clip = (t: string, n: number): string => {
  const one = t.replace(/\s+/g, ' ').trim()
  return one.length > n ? one.slice(0, n - 1) + '…' : one
}

/** Whether a session is still at work: by its status, or because work was just typed in and the hooks have not caught up. */
function busy(deps: McpDeps, s: Session): boolean {
  if (!s.alive) return false
  if (s.status === 'working' || s.status === 'starting') return true
  const sent = deps.bus.sentAt(s.id)
  return !!sent && s.statusAt <= sent && Date.now() - sent < SETTLE_MS
}

function buildServer(deps: McpDeps, sessionId: string): McpServer {
  const server = new McpServer({ name: 'stepbro-terminal', version: deps.version }, { instructions: INSTRUCTIONS })
  const source = (): NoteSource => {
    const s = deps.session(sessionId)
    return { kind: 'agent', sessionId, presetId: s?.agent.detectedPreset ?? s?.presetId ?? 'agent', title: s?.title ?? '' }
  }
  const text = (t: string) => ({ content: [{ type: 'text' as const, text: t }] })
  const others = (): Session[] => deps.sessions().filter((s) => s.id !== sessionId)
  const noMatch = (to: string): string => {
    const names = others().map((s) => `${label(s)} (${agentOf(s)}, ${short(s.id)})`)
    return names.length ? `No session matches "${to}". Open sessions: ${names.join('; ')}.` : 'No other sessions are open.'
  }

  // ---- Topito ----

  server.registerTool(
    'topito',
    {
      title: 'Tell the person something through Topito',
      description:
        "Topito is the little mole mascot in the user's stepbro terminal window. This has him pop out at the corner of their terminal with a short message from you, which they see even while looking at another session, and a click on it takes them to yours. Use it sparingly, for what they should notice now: you finished something they are waiting on, you need a decision from them, something worth celebrating, or something went wrong. Not for progress updates, and not to repeat what you are already telling them in your reply. One short sentence, in the language they use with you.",
      inputSchema: {
        message: z.string().min(1).max(140).describe('What Topito says. One short sentence.'),
        mood: z
          .enum(TOPITO_MOODS as [TopitoMood, ...TopitoMood[]])
          .optional()
          .describe('How he looks while he says it: done, needs_you, happy, thinking, oops, hello, surprised or coffee. hello when left out.')
      }
    },
    async ({ message, mood }) => {
      const wait = topitoGate.take(sessionId)
      if (wait) return text(`Topito passed on a message from you a moment ago; he can take another in ${Math.ceil(wait / 1000)} s.`)
      deps.topito({ sessionId, message: clip(message, 140), mood: mood ?? 'hello', at: Date.now() })
      return text('Topito came out at the corner of their terminal and said it.')
    }
  )

  // ---- notes ----

  server.registerTool(
    'save_note',
    {
      title: 'Save a note',
      description:
        'Save a note in the Notes panel of the user\'s terminal. Use it whenever they ask you to note, remember, write down or keep something for later: an idea, a todo, a reminder, a decision. Write the note the way they would want to read it back, in their language.',
      inputSchema: { text: z.string().min(1).max(4000).describe('The note itself. One idea per note.') }
    },
    async ({ text: body }) => {
      const n = deps.notes.add(body, source())
      return text(`Saved as note ${n.id}. The user can see it in their Notes panel.`)
    }
  )

  server.registerTool(
    'list_notes',
    {
      title: 'List notes',
      description: 'Read the notes the user and their agents have saved. Open notes come first, newest first.',
      inputSchema: { include_done: z.boolean().optional().describe('Also include notes marked as done. Off by default.') }
    },
    async ({ include_done }) => {
      const all = deps.notes.list().filter((n) => include_done || !n.done)
      if (!all.length) return text('No notes yet.')
      return text(all.map(describe).join('\n'))
    }
  )

  server.registerTool(
    'update_note',
    {
      title: 'Update a note',
      description: 'Change the text of a note or mark it done or open again. Use the id from list_notes.',
      inputSchema: {
        id: z.string().describe('Note id'),
        text: z.string().min(1).max(4000).optional().describe('New text, replacing the old one'),
        done: z.boolean().optional().describe('true to mark done, false to reopen')
      }
    },
    async ({ id, text: body, done }) => {
      const n = deps.notes.update(id, { text: body, done })
      return text(n ? `Updated note ${n.id}.` : `No note with id ${id}.`)
    }
  )

  server.registerTool(
    'delete_note',
    {
      title: 'Delete a note',
      description: 'Remove a note for good. Prefer marking it done unless the user asks to delete it.',
      inputSchema: { id: z.string().describe('Note id') }
    },
    async ({ id }) => text(deps.notes.remove(id) ? `Deleted note ${id}.` : `No note with id ${id}.`)
  )

  // ---- sessions: terminals ----

  server.registerTool(
    'list_sessions',
    {
      title: 'List sessions',
      description:
        'The sessions open in this terminal, yours first: id, title, which agent or shell is in front, status (working, idle, attention = waiting for a person) and folder. Use it to see where work can go and who is busy.',
      inputSchema: {}
    },
    async () => {
      const me = deps.session(sessionId)
      const head = me ? `You are ${line(me)}` : `You are session ${short(sessionId)}`
      const rest = others()
      if (!rest.length) return text(`${head}\nNo other sessions are open.`)
      return text([head, 'Other sessions:', ...rest.map(line)].join('\n'))
    }
  )

  server.registerTool(
    'read_screen',
    {
      title: 'Read a session\'s screen',
      description:
        'The last lines on another session\'s screen, scrollback included: what an agent there printed, test output, a prompt it is stuck on. Use it to check on work you handed over or to see what someone is doing before you send them something.',
      inputSchema: {
        to: z.string().describe('Agent name (codex, claude, gemini, opencode), part of the session title, or an id from list_sessions'),
        lines: z.number().int().min(5).max(200).optional().describe('How many lines from the bottom. 40 by default.')
      }
    },
    async ({ to, lines }) => {
      const target = pickSession(deps.sessions(), to, sessionId)
      if (!target) return text(noMatch(to))
      const rows = await deps.screen(target.id, lines ?? 40)
      const last = [...rows].reverse().find((r) => r.trim()) ?? ''
      if (!rows.length) return text(`${line(target)}\n(nothing on screen)`)
      return text(`${line(target)}\n--- last ${rows.length} lines ---\n${rows.join('\n')}`)
    }
  )

  server.registerTool(
    'send_to_session',
    {
      title: 'Send text to another session',
      description:
        'Type text into another session of this terminal and press Enter, as if the user had written it there. Use it to hand work to another agent ("send this to codex") or when the user asks you to pass something along. `to` can be an agent name (codex, claude, gemini, opencode), part of the session title, or an id from list_sessions. Unless expect_reply is false, the text ends with a request to report back to you; then call wait to hear from them.',
      inputSchema: {
        to: z.string().describe('Agent name, title fragment or session id'),
        text: z.string().min(1).max(20000).describe('What to type there. Make it complete and self-contained: the other agent knows nothing about this conversation.'),
        submit: z.boolean().optional().describe('Press Enter after typing. On by default.'),
        expect_reply: z.boolean().optional().describe('Ask the other agent to report back to you when done. On by default.')
      }
    },
    async ({ to, text: body, submit, expect_reply }) => {
      const target = pickSession(deps.sessions(), to, sessionId)
      if (!target) return text(noMatch(to))
      if (!target.alive) return text(`Session "${label(target)}" has exited; nothing is listening there.`)
      const suffix = expect_reply === false ? '' : ` — when you are done, call the stepbro tool "report" with to: "${short(sessionId)}".`
      deps.bus.noteSend(sessionId, target.id)
      const outcome = deps.send(sessionId, target.id, body, submit !== false, suffix)
      if (outcome === 'lost') return text(`Session "${label(target)}" is not accepting input right now.`)
      const tail = 'Their answer will arrive in your conversation as a message, so you can end your turn now; read_screen shows what they are doing meanwhile.'
      if (outcome === 'held')
        return text(`"${label(target)}" (${agentOf(target)}) is ${target.status === 'attention' ? 'waiting on a person' : 'in the middle of a turn'}; your text is held and goes in the moment they are free. ${tail}`)
      return text(`Sent to "${label(target)}" (${agentOf(target)}). ${tail}`)
    }
  )

  // ---- agents: inboxes ----

  server.registerTool(
    'report',
    {
      title: 'Message another agent',
      description:
        'Send a message to the agent in another session: results, a summary, a question, an answer. It appears in their conversation as soon as they are free, or as the result of their wait if they are waiting; it is held while they work or ask a person something. Without `to` it goes to whoever last sent you work or a message. Use it to report back, and to keep talking.',
      inputSchema: {
        to: z.string().optional().describe('Agent name, title fragment or session id. Defaults to the session that last sent you work.'),
        text: z.string().min(1).max(8000).describe('What to tell them. Complete and self-contained: files touched, what passed, what is left.')
      }
    },
    async ({ to, text: body }) => {
      let targetId: string | undefined
      if (to) {
        const t = pickSession(deps.sessions(), to, sessionId)
        if (!t) return text(noMatch(to))
        targetId = t.id
      } else {
        targetId = deps.bus.replyTarget(sessionId)
        if (!targetId) return text('Nobody to report to: no session handed you work, and no "to" was given. Pass to: an agent name, a title fragment or an id from list_sessions.')
      }
      const target = deps.session(targetId)
      if (!target) return text('That session is gone.')
      deps.bus.post(sessionId, targetId, body)
      const held = deps.bus.pending(targetId) > 0
      return text(
        held
          ? `Message for "${label(target)}" (${agentOf(target)}) is ${deps.bus.isWaiting(targetId) ? 'waiting for their wait to return' : `held until they are free (they are ${target.status})`}.`
          : `Message delivered to "${label(target)}" (${agentOf(target)}); it is in their conversation now.`
      )
    }
  )

  server.registerTool(
    'wait',
    {
      title: 'Block until a message arrives or a session goes quiet',
      description:
        'Only for when you must block: messages reach your conversation on their own, so normally you just end your turn. Returns as soon as a message arrives for you. With `for`, also returns when that session stops working (idle, or waiting for a person), with its last screen lines. Times out after timeout_s (45 by default, 120 at most) saying so; call it again if you still need to block.',
      inputSchema: {
        for: z.string().optional().describe('A session to watch: agent name, title fragment or id. Without it, only your inbox is watched.'),
        timeout_s: z.number().int().min(1).max(WAIT_MAX_S).optional().describe(`Seconds to wait before giving up. ${WAIT_DEFAULT_S} by default.`)
      }
    },
    async ({ for: watch, timeout_s }) => {
      const ms = Math.min(Math.max(timeout_s ?? WAIT_DEFAULT_S, 1), WAIT_MAX_S) * 1000
      const watched = watch ? pickSession(deps.sessions(), watch, sessionId) : null
      if (watch && !watched) return text(noMatch(watch))
      const deadline = Date.now() + ms
      const seconds = Math.round(ms / 1000)
      deps.bus.setWaiting(sessionId, true)
      try {
        return await waitLoop()
      } finally {
        deps.bus.setWaiting(sessionId, false)
      }
      async function waitLoop(): Promise<ReturnType<typeof text>> {
        for (;;) {
          const msgs = deps.bus.take(sessionId)
          if (msgs.length) {
            const who = (id: string): string => {
              const s = deps.session(id)
              return s ? `${label(s)} (${agentOf(s)}, ${short(id)})` : short(id)
            }
            return text(msgs.map((m) => `Report from ${who(m.from)}:\n${m.text}`).join('\n\n'))
          }
          if (watched) {
            const cur = deps.session(watched.id)
            if (!cur) {
              return text(`Session "${label(watched)}" was closed.`)
            }
            if (!busy(deps, cur)) {
              const rows = await deps.screen(cur.id, 12)
              const state = cur.alive ? cur.status : 'exited'
              return text(`"${label(cur)}" is ${state} and has not reported${state === 'attention' ? '; it is waiting for a person' : ''}.\n--- its last lines ---\n${rows.join('\n')}`)
            }
          }
          const left = deadline - Date.now()
          if (left <= 0) {
            return text(
              watched
                ? `"${label(watched)}" is still working after ${seconds} s and nothing arrived. Call wait again to keep waiting, or read_screen to look.`
                : `Nothing arrived in ${seconds} s. Call wait again to keep waiting.`
            )
          }
          await deps.bus.waitFor(watched ? [sessionId, watched.id] : [sessionId], Math.min(left, 2000))
        }
      }
    }
  )

  // ---- the preview pane: a browser beside the session ----

  const preview = (op: BrowserOp, timeoutMs?: number): Promise<BrowserResult> => deps.browser(sessionId, op, timeoutMs)
  const where = (r: BrowserResult): string => `${r.title || '(no title)'} — ${r.url}`
  const failed = (e: unknown) => text(`Preview: ${String((e as Error)?.message ?? e)}`)
  const TARGET = 'A CSS selector, or text=… for the visible text of a link, button or other element (a partial match will do).'

  server.registerTool(
    'open_preview',
    {
      title: 'Open a page in the preview pane',
      description:
        'Shows a web page in the preview pane beside your session, inside the terminal window, and waits for it to load. Use it when the user asks to see or open a page, and when you want to check what your dev server is serving. Without a url it opens the address this session\'s program printed (a dev server, for example). Then preview_screenshot shows the page, preview_read its text or an outline.',
      inputSchema: { url: z.string().optional().describe('http:// or https:// address. Leave it out to open the address the program in this session printed.') }
    },
    async ({ url }) => {
      const s = deps.session(sessionId)
      const target = url?.trim() || s?.previewUrl
      if (!target) return text('No address given, and nothing in this session has printed one. Pass the url to open.')
      if (!/^https?:\/\//i.test(target)) return text(`Only http:// and https:// addresses open in the preview; "${target}" is neither.`)
      try {
        const r = await preview({ kind: 'open', url: target }, 45_000)
        return text(`Opened ${where(r)} in the preview pane. preview_screenshot shows it; preview_read gives its text or an outline of what is on it.`)
      } catch (e) {
        return failed(e)
      }
    }
  )

  server.registerTool(
    'preview_screenshot',
    {
      title: 'See the preview pane',
      description: 'A picture of the page in the preview pane, as it looks right now. Scroll first to see further down.',
      inputSchema: {}
    },
    async () => {
      try {
        const r = await preview({ kind: 'screenshot' })
        if (!r.png) return text(`Nothing to show for ${where(r)}.`)
        return { content: [{ type: 'image' as const, data: r.png, mimeType: 'image/png' }, { type: 'text' as const, text: where(r) }] }
      } catch (e) {
        return failed(e)
      }
    }
  )

  server.registerTool(
    'preview_read',
    {
      title: 'Read the page in the preview pane',
      description:
        'What the page in the preview pane says. "outline" lists its title, headings, links, buttons and form fields, each in a form you can pass as a target to preview_click and preview_type; "text" is everything readable on it; "html" is its markup. A target narrows any of them to one element.',
      inputSchema: {
        what: z.enum(['outline', 'text', 'html']).optional().describe('outline by default'),
        target: z.string().optional().describe(TARGET)
      }
    },
    async ({ what, target }) => {
      try {
        const r = await preview({ kind: 'read', what: what ?? 'outline', target })
        return text(`${where(r)}\n\n${r.text ?? ''}`)
      } catch (e) {
        return failed(e)
      }
    }
  )

  server.registerTool(
    'preview_scroll',
    {
      title: 'Scroll the preview pane',
      description: 'Scrolls the page: a screen down or up, to the top or bottom, by a number of pixels, or to bring a target into view.',
      inputSchema: {
        to: z.union([z.enum(['down', 'up', 'top', 'bottom']), z.number()]).optional().describe('down by default; a number scrolls by that many pixels (negative goes up)'),
        target: z.string().optional().describe(TARGET)
      }
    },
    async ({ to, target }) => {
      try {
        const r = await preview({ kind: 'scroll', to: to ?? 'down', target })
        return text(r.text ?? 'Scrolled.')
      } catch (e) {
        return failed(e)
      }
    }
  )

  server.registerTool(
    'preview_click',
    {
      title: 'Click something in the preview pane',
      description: 'Clicks a link, button or other element on the page, then reports where the page is.',
      inputSchema: { target: z.string().describe(TARGET) }
    },
    async ({ target }) => {
      try {
        const r = await preview({ kind: 'click', target })
        return text(`${r.text ?? 'Clicked.'}\nNow at ${where(r)}.`)
      } catch (e) {
        return failed(e)
      }
    }
  )

  server.registerTool(
    'preview_type',
    {
      title: 'Type into a field in the preview pane',
      description: 'Puts text into an input, textarea or editable element, replacing what was there; with submit, presses Enter afterwards.',
      inputSchema: {
        target: z.string().describe(TARGET),
        text: z.string().max(20000),
        submit: z.boolean().optional().describe('Press Enter after typing.')
      }
    },
    async ({ target, text: body, submit }) => {
      try {
        const r = await preview({ kind: 'type', target, text: body, submit })
        return text(`${r.text ?? 'Typed.'}\nNow at ${where(r)}.`)
      } catch (e) {
        return failed(e)
      }
    }
  )

  server.registerTool(
    'preview_eval',
    {
      title: 'Run JavaScript in the preview pane',
      description:
        'Runs JavaScript in the page and returns the value of the last expression (as JSON when it is not a string). For anything the other preview tools do not cover: reading a specific element, checking state, calling into the app under test.',
      inputSchema: { js: z.string().min(1).max(20000) }
    },
    async ({ js }) => {
      try {
        const r = await preview({ kind: 'eval', js })
        return text(r.text ?? '(no value)')
      } catch (e) {
        return failed(e)
      }
    }
  )

  server.registerTool(
    'preview_console',
    {
      title: 'Read the console of the preview pane',
      description: 'What the page logged to its console since the preview opened: errors, warnings and logs, newest last. Clear it to read only what comes next.',
      inputSchema: { clear: z.boolean().optional().describe('Empty the log after reading it.') }
    },
    async ({ clear }) => {
      try {
        const r = await preview({ kind: 'console', clear })
        return text(r.text || 'The console is empty.')
      } catch (e) {
        return failed(e)
      }
    }
  )

  server.registerTool(
    'close_preview',
    { title: 'Close the preview pane', description: 'Closes the preview pane beside your session.', inputSchema: {} },
    async () => {
      try {
        await preview({ kind: 'close' })
        return text('The preview pane is closed.')
      } catch (e) {
        return failed(e)
      }
    }
  )

  return server
}

function describe(n: Note): string {
  const who = n.source.kind === 'agent' ? n.source.presetId : 'user'
  const when = new Date(n.createdAt).toISOString().slice(0, 16).replace('T', ' ')
  return `${n.id} · ${n.done ? 'done' : 'open'} · ${who} · ${when}\n${n.text}`
}
