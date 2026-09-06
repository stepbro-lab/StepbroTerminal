import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { log } from './log'

export interface HookSink {
  applyHook(agentSessionId: string, name: string, payload: Record<string, unknown>, stepSessionId?: string): void
}

/** Serves one MCP request for the session whose endpoint was hit. */
export type McpHandler = (sessionId: string, req: http.IncomingMessage, res: http.ServerResponse) => Promise<void>

const MAX_BODY = 1024 * 1024

/** Handed to Claude Code at session start, so "note that…" goes straight to the notes tools. */
const NOTES_CONTEXT =
  'You are running inside stepbro terminal and its `stepbro` MCP server is connected: it keeps the notes of the person you are working with. ' +
  'When they ask you to note, write down, remember, keep or save something for later (in Spanish: anota, anótate, apunta, guárdame, acuérdate), ' +
  'call the save_note tool right away with the note in their own words, and do not look for a notes feature in the project. ' +
  'list_notes reads the notes, update_note edits them or marks them done, delete_note removes one. ' +
  'When they ask you to send, pass or hand something to another agent or session of this terminal ("send this to codex"), ' +
  'call send_to_session with a complete, self-contained message; list_sessions shows what is open.'

/** Local HTTP endpoint that Claude Code's `type: "http"` hooks post to. Always answers 200 `{}`. */
export class HookServer {
  private server: http.Server
  private port = 0

  constructor(
    private readonly sink: HookSink,
    private readonly token: string,
    private readonly mcp?: McpHandler
  ) {
    this.server = http.createServer((req, res) => this.handle(req, res))
    this.server.on('error', (e) => log('hook server error', e))
  }

  listen(): Promise<number> {
    return new Promise((resolve, reject) => {
      this.server.once('error', reject)
      this.server.listen(0, '127.0.0.1', () => {
        this.port = (this.server.address() as AddressInfo).port
        resolve(this.port)
      })
    })
  }

  /** The hooks endpoint; with a session id the host knows which session the events belong to. */
  url(sessionId?: string): string {
    return `http://127.0.0.1:${this.port}/hooks/${this.token}` + (sessionId ? `/${sessionId}` : '')
  }

  /** The MCP endpoint an agent in `sessionId` gets: the notes tools, tagged with that session. */
  mcpUrl(sessionId: string): string {
    return `http://127.0.0.1:${this.port}/mcp/${this.token}/${sessionId}`
  }

  close(): void {
    this.server.close()
  }

  private handle(req: http.IncomingMessage, res: http.ServerResponse): void {
    const mcpPrefix = `/mcp/${this.token}/`
    if (this.mcp && req.url?.startsWith(mcpPrefix)) {
      const sessionId = req.url.slice(mcpPrefix.length).split(/[/?]/)[0]
      this.mcp(sessionId, req, res).catch((e) => {
        log('mcp error', e)
        if (!res.headersSent) res.writeHead(500).end()
      })
      return
    }
    const m = req.method === 'POST' ? new RegExp(`^/hooks/${this.token}(?:/([^/?]+))?$`).exec(req.url ?? '') : null
    if (!m) {
      res.writeHead(404).end()
      return
    }
    const stepSessionId = m[1]
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (c: Buffer) => {
      size += c.length
      if (size <= MAX_BODY) chunks.push(c)
    })
    req.on('end', () => {
      let reply: Record<string, unknown> = {}
      if (size <= MAX_BODY) {
        try {
          const body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
          const sid = body?.session_id
          const name = body?.hook_event_name
          if (typeof sid === 'string' && typeof name === 'string') {
            this.sink.applyHook(sid, name, body, stepSessionId)
            if (name === 'SessionStart') reply = { hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: NOTES_CONTEXT } }
          }
        } catch (e) {
          log('hook parse error', e)
        }
      }
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(reply))
    })
    req.on('error', () => {
      try {
        res.writeHead(200).end('{}')
      } catch {
        /* already ended */
      }
    })
  }
}
