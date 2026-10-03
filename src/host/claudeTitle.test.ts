import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { TranscriptTitles, titleRecord } from './claudeTitle'

const line = (o: object): string => JSON.stringify(o) + '\n'
const user = (text: string): string => line({ type: 'user', message: { role: 'user', content: text } })

describe('the records that name a Claude conversation', () => {
  it('reads the title Claude gave it and the one the person gave it', () => {
    expect(titleRecord(JSON.stringify({ type: 'ai-title', aiTitle: 'Status line mejora', sessionId: 'x' }))).toEqual({ kind: 'ai', title: 'Status line mejora' })
    expect(titleRecord(JSON.stringify({ type: 'custom-title', customTitle: '  STEPBRO\n TERMINAL ' }))).toEqual({ kind: 'custom', title: 'STEPBRO TERMINAL' })
  })

  it('ignores every other line, a prompt that merely mentions one included', () => {
    expect(titleRecord(user('what does "ai-title" mean in a transcript?'))).toBeNull()
    expect(titleRecord(JSON.stringify({ type: 'ai-title', aiTitle: '   ' }))).toBeNull()
    expect(titleRecord('{"type":"ai-title", broken')).toBeNull()
  })
})

describe('following a transcript as it grows', () => {
  let dir: string
  beforeAll(() => (dir = fs.mkdtempSync(path.join(os.tmpdir(), 'step-title-'))))
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }))

  it('has no title until Claude writes one, then the latest of each kind', async () => {
    const file = path.join(dir, 'a.jsonl')
    const titles = new TranscriptTitles()
    fs.writeFileSync(file, user('necesito que mejores mi status line mas bonita'))
    expect(await titles.read(file)).toEqual({})
    fs.appendFileSync(file, line({ type: 'ai-title', aiTitle: 'Status line mejora' }))
    expect(await titles.read(file)).toEqual({ ai: 'Status line mejora' })
    fs.appendFileSync(file, user('y ahora los colores') + line({ type: 'ai-title', aiTitle: 'Status line con colores' }) + line({ type: 'custom-title', customTitle: 'Mi status' }))
    expect(await titles.read(file)).toEqual({ ai: 'Status line con colores', custom: 'Mi status' })
  })

  it('finds a record split across two reads', async () => {
    const file = path.join(dir, 'b.jsonl')
    const titles = new TranscriptTitles()
    const record = line({ type: 'ai-title', aiTitle: 'Terminal estilo Warp optimizada' })
    fs.writeFileSync(file, user('hola') + record.slice(0, 20))
    expect(await titles.read(file)).toEqual({})
    fs.appendFileSync(file, record.slice(20))
    expect(await titles.read(file)).toEqual({ ai: 'Terminal estilo Warp optimizada' })
  })

  it('finds a title deep in a transcript of many megabytes', async () => {
    const file = path.join(dir, 'c.jsonl')
    const big = user('x'.repeat(200_000))
    fs.writeFileSync(file, big.repeat(12) + line({ type: 'ai-title', aiTitle: 'Factura electrónica' }) + big.repeat(3))
    expect(await new TranscriptTitles().read(file)).toEqual({ ai: 'Factura electrónica' })
  })

  it('reads a rewritten file again, and a missing one as untitled', async () => {
    const file = path.join(dir, 'd.jsonl')
    const titles = new TranscriptTitles()
    fs.writeFileSync(file, user('uno') + line({ type: 'ai-title', aiTitle: 'Primero' }))
    expect(await titles.read(file)).toEqual({ ai: 'Primero' })
    fs.writeFileSync(file, line({ type: 'ai-title', aiTitle: 'Otro' }))
    expect(await titles.read(file)).toEqual({ ai: 'Otro' })
    expect(await titles.read(path.join(dir, 'missing.jsonl'))).toEqual({})
  })
})

describe('reading the same transcript twice at once', () => {
  it('takes each record once, in order', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'step-title-'))
    const file = path.join(dir, 'e.jsonl')
    fs.writeFileSync(file, user('x'.repeat(3_000_000)) + line({ type: 'ai-title', aiTitle: 'Uno' }))
    const titles = new TranscriptTitles()
    const [a, b] = await Promise.all([titles.read(file), titles.read(file)])
    expect(a).toEqual({ ai: 'Uno' })
    expect(b).toEqual({ ai: 'Uno' })
    fs.appendFileSync(file, line({ type: 'ai-title', aiTitle: 'Dos' }))
    expect(await titles.read(file)).toEqual({ ai: 'Dos' })
    fs.rmSync(dir, { recursive: true, force: true })
  })
})
