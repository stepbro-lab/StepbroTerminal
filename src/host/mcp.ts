import type http from 'node:http'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { z } from 'zod'
import type { Note, NoteSource, Session } from '@shared/types'
import type { NoteStore } from './NoteStore'
import { agentOf, pickSession } from './handoff'

export interface McpDeps {
  notes: NoteStore
  session: (id: string) => Session | undefined
  sessions: () => Session[]
  /** Types text into another session on behalf of the caller. */
  send: (from: string, to: string, text: string, submit: boolean) => void
  version: string
}

/**
 * The MCP endpoint agents get per session (`claude --mcp-config`, `codex -c mcp_servers…`).
 * It exposes the user's notes as four tools. Stateless: a server per request is cheap and
 * keeps request ids from colliding between sessions.
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

function buildServer(deps: McpDeps, sessionId: string): McpServer {
  const server = new McpServer({ name: 'stepbro-terminal', version: deps.version })
  const source = (): NoteSource => {
    const s = deps.session(sessionId)
    return { kind: 'agent', sessionId, presetId: s?.agent.detectedPreset ?? s?.presetId ?? 'agent', title: s?.title ?? '' }
  }
  const text = (t: string) => ({ content: [{ type: 'text' as const, text: t }] })

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

  server.registerTool(
    'list_sessions',
    {
      title: 'List sessions',
      description: 'The other sessions open in this terminal: id, title, which agent or shell is in front, status and folder. Use it to see where something can be sent.',
      inputSchema: {}
    },
    async () => {
      const list = deps.sessions().filter((s) => s.id !== sessionId)
      if (!list.length) return text('No other sessions are open.')
      return text(list.map((s) => `[${s.id.slice(0, 8)}] ${s.title || '(untitled)'} — ${agentOf(s)}, ${s.alive ? s.status : 'exited'}, ${s.projectPath}`).join('\n'))
    }
  )

  server.registerTool(
    'send_to_session',
    {
      title: 'Send text to another session',
      description:
        'Type text into another session of this terminal and press Enter, as if the user had written it there. Use it when they ask you to send, pass or hand something to another agent or session ("send this to codex"). `to` can be an agent name (codex, claude, gemini), part of the session title, or an id from list_sessions.',
      inputSchema: {
        to: z.string().describe('Agent name, title fragment or session id'),
        text: z.string().min(1).max(20000).describe('What to type there. Make it complete and self-contained: the other agent knows nothing about this conversation.'),
        submit: z.boolean().optional().describe('Press Enter after typing. On by default.')
      }
    },
    async ({ to, text: body, submit }) => {
      const target = pickSession(deps.sessions(), to, sessionId)
      if (!target) {
        const names = deps.sessions().filter((s) => s.id !== sessionId).map((s) => `${s.title || s.id.slice(0, 8)} (${agentOf(s)})`)
        return text(names.length ? `No session matches "${to}". Open sessions: ${names.join('; ')}.` : 'No other sessions are open.')
      }
      if (!target.alive) return text(`Session "${target.title || target.id.slice(0, 8)}" has exited; nothing is listening there.`)
      deps.send(sessionId, target.id, body, submit !== false)
      return text(`Sent to "${target.title || target.id.slice(0, 8)}" (${agentOf(target)}).`)
    }
  )

  return server
}

function describe(n: Note): string {
  const who = n.source.kind === 'agent' ? n.source.presetId : 'user'
  const when = new Date(n.createdAt).toISOString().slice(0, 16).replace('T', ' ')
  return `[${n.id}] ${n.done ? '(done) ' : ''}${n.text.replace(/\n/g, ' ')}  — ${who}, ${when}`
}
