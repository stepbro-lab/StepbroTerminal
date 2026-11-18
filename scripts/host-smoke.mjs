// Usage: node scripts/host-smoke.mjs
import net from 'node:net'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const info = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.step', 'host.json'), 'utf8'))
console.log('host', info)

function encodeFrame(msg, bin) {
  const json = Buffer.from(JSON.stringify(msg))
  const binLen = bin ? bin.length : 0
  const out = Buffer.alloc(8 + json.length + binLen)
  out.writeUInt32BE(json.length, 0)
  out.writeUInt32BE(binLen, 4)
  json.copy(out, 8)
  if (bin) bin.copy(out, 8 + json.length)
  return out
}

let acc = Buffer.alloc(0)
const sock = net.connect(info.socketPath)
const send = (m, b) => sock.write(encodeFrame(m, b))
let id = null
let output = ''

sock.on('connect', () => {
  send({ t: 'hello', version: 'smoke' })
  const win = process.platform === 'win32'
  send({
    t: 'new',
    reqId: 'r1',
    opts: {
      projectPath: os.homedir(),
      presetId: 'shell',
      cols: 100,
      rows: 30,
      launch: win ? { command: 'cmd.exe', args: [], hooks: false } : { command: '/bin/sh', args: [], hooks: false }
    }
  })
})

sock.on('data', (d) => {
  acc = Buffer.concat([acc, d])
  while (acc.length >= 8) {
    const jl = acc.readUInt32BE(0)
    const bl = acc.readUInt32BE(4)
    if (acc.length < 8 + jl + bl) break
    const msg = JSON.parse(acc.subarray(8, 8 + jl).toString())
    const bin = acc.subarray(8 + jl, 8 + jl + bl)
    acc = acc.subarray(8 + jl + bl)
    if (msg.t === 'hello') console.log('hello from host', msg.version, msg.pid)
    else if (msg.t === 'sessions') console.log('sessions', msg.sessions.length)
    else if (msg.t === 'created') {
      id = msg.session.id
      console.log('created', id, msg.session.status)
      send({ t: 'attach', id })
      setTimeout(() => send({ t: 'input', id }, Buffer.from('echo step-smoke-ok\r')), 800)
      setTimeout(() => {
        console.log('--- output ---\n' + output.replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '') + '\n--- end ---')
        console.log('contains marker:', output.includes('step-smoke-ok'))
        send({ t: 'close', id })
        setTimeout(() => process.exit(output.includes('step-smoke-ok') ? 0 : 1), 300)
      }, 2500)
    } else if (msg.t === 'output' || msg.t === 'replay') output += bin.toString()
    else if (msg.t === 'session') console.log('session', msg.session.status, JSON.stringify(msg.session.title))
    else if (msg.t === 'exit') console.log('exit', msg.code)
    else if (msg.t === 'error') console.log('error', msg.message)
  }
})
sock.on('error', (e) => {
  console.error('socket error', e.message)
  process.exit(1)
})
