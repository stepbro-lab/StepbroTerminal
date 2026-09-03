import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { log } from './log'

export interface HookSink {
  applyHook(agentSessionId: string, name: string, payload: Record<string, unknown>): void
}

const MAX_BODY = 1024 * 1024

/** Local HTTP endpoint that Claude Code's `type: "http"` hooks post to. Always answers 200 `{}`. */
export class HookServer {
  private server: http.Server
  private port = 0

  constructor(
    private readonly sink: HookSink,
    private readonly token: string
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

  url(): string {
    return `http://127.0.0.1:${this.port}/hooks/${this.token}`
  }

  close(): void {
    this.server.close()
  }

  private handle(req: http.IncomingMessage, res: http.ServerResponse): void {
    const ok = req.method === 'POST' && req.url === `/hooks/${this.token}`
    if (!ok) {
      res.writeHead(404).end()
      return
    }
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (c: Buffer) => {
      size += c.length
      if (size <= MAX_BODY) chunks.push(c)
    })
    req.on('end', () => {
      res.writeHead(200, { 'content-type': 'application/json' }).end('{}')
      if (size > MAX_BODY) return
      try {
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
        const sid = body?.session_id
        const name = body?.hook_event_name
        if (typeof sid === 'string' && typeof name === 'string') this.sink.applyHook(sid, name, body)
      } catch (e) {
        log('hook parse error', e)
      }
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
