// Dev helper: call the stepbro MCP tools the way an agent in a session would.
// Usage: node scripts/mcp.mjs <sessionId> <tool> [json-args]
//        node scripts/mcp.mjs <sessionId> --tools           (list the tools and the server instructions)
// Reads the running host's port and token from $STEP_HOME/host.json (or ~/.step/host.json).
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'

const [sessionId, tool, json] = process.argv.slice(2)
if (!sessionId || !tool) {
  console.error('usage: node scripts/mcp.mjs <sessionId> <tool|--tools> [json-args]')
  process.exit(1)
}
const home = process.env.STEP_HOME || path.join(os.homedir(), '.step')
const info = JSON.parse(fs.readFileSync(path.join(home, 'host.json'), 'utf8'))
const url = new URL(`http://127.0.0.1:${info.hookPort}/mcp/${info.hookToken}/${sessionId}`)

const client = new Client({ name: 'stepbro-mcp-probe', version: '0' })
await client.connect(new StreamableHTTPClientTransport(url))
if (tool === '--tools') {
  console.log(client.getInstructions() ?? '(no instructions)')
  const { tools } = await client.listTools()
  for (const t of tools) console.log(`- ${t.name}: ${t.description?.slice(0, 90)}`)
} else {
  const started = Date.now()
  // wait can block for up to two minutes; give the call room beyond that.
  const r = await client.callTool({ name: tool, arguments: json ? JSON.parse(json) : {} }, undefined, { timeout: 150_000 })
  console.log(`(${Date.now() - started} ms)`)
  for (const c of r.content ?? []) console.log(c.type === 'text' ? c.text : JSON.stringify(c))
}
await client.close()
