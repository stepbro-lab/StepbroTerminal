import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type { LaunchSpec } from '@shared/types'
import { claudeConversationExists, conversationFromTranscript, latestClaudeConversation, startsResumed } from './resumeChoice'

const claude: LaunchSpec = { command: 'claude', args: ['--session-id', '{sessionId}'], resumeArgs: ['--resume', '{sessionId}'], hooks: true }
const codex: LaunchSpec = { command: 'codex', args: [], resumeArgs: ['resume', '{sessionId}'], hooks: false }

describe('startsResumed', () => {
  it('resumes Claude Code only into a conversation it saved', () => {
    expect(startsResumed(claude, 'a', true, () => true)).toBe(true)
    // Never sent a prompt: --resume would say "No conversation found with session ID".
    expect(startsResumed(claude, 'a', true, () => false)).toBe(false)
  })

  it('never starts Claude Code over with an id it has already used', () => {
    // --session-id would say "Session ID … is already in use".
    expect(startsResumed(claude, 'a', false, () => true)).toBe(true)
  })

  it('leaves the other agents to what was asked', () => {
    expect(startsResumed(codex, 'a', true, () => false)).toBe(true)
    expect(startsResumed(codex, 'a', false, () => true)).toBe(false)
    expect(startsResumed(codex, undefined, true, () => true)).toBe(false)
    expect(startsResumed({ ...claude, resumeArgs: undefined }, 'a', true, () => true)).toBe(false)
  })
})

describe('claudeConversationExists', () => {
  let dir: string
  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'step-claude-'))
  })
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true })
  })

  it('finds a saved conversation under any project', async () => {
    await fs.mkdir(path.join(dir, 'projects', '-Users-me-elsewhere'), { recursive: true })
    await fs.writeFile(path.join(dir, 'projects', '-Users-me-elsewhere', 'abc-123.jsonl'), '{}\n')
    expect(claudeConversationExists('abc-123', dir)).toBe(true)
    expect(claudeConversationExists('def-456', dir)).toBe(false)
  })

  it('is false with nothing saved at all, or for an id that is not one', () => {
    expect(claudeConversationExists('abc-123', dir)).toBe(false)
    expect(claudeConversationExists('../x', dir)).toBe(false)
  })
})

describe('following a Claude Code conversation', () => {
  let dir: string
  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'step-claude-'))
  })
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true })
  })
  const A = '11111111-1111-4111-8111-111111111111'
  const B = '22222222-2222-4222-8222-222222222222'
  const save = async (cwd: string, id: string, agoMs: number): Promise<void> => {
    const folder = path.join(dir, 'projects', cwd.replace(/[^a-zA-Z0-9]/g, '-'))
    await fs.mkdir(folder, { recursive: true })
    const file = path.join(folder, `${id}.jsonl`)
    await fs.writeFile(file, '{}\n')
    const t = (Date.now() - agoMs) / 1000
    await fs.utimes(file, t, t)
  }

  it('reads the conversation off the transcript a hook names', () => {
    expect(conversationFromTranscript(`/Users/me/.claude/projects/-Users-me-app/${A}.jsonl`)).toBe(A)
    expect(conversationFromTranscript('C:\\Users\\me\\.claude\\projects\\x\\' + B + '.jsonl')).toBe(B)
    expect(conversationFromTranscript(undefined)).toBeNull()
    expect(conversationFromTranscript('/tmp/notes.txt')).toBeNull()
  })

  it('finds the one last written in the folder since the session began, not another session\'s', async () => {
    await save('/Users/me/my_app', A, 60_000)
    await save('/Users/me/my_app', B, 5_000)
    expect(latestClaudeConversation('/Users/me/my_app', Date.now() - 600_000, new Set(), dir)).toBe(B)
    expect(latestClaudeConversation('/Users/me/my_app', Date.now() - 600_000, new Set([B]), dir)).toBe(A)
    expect(latestClaudeConversation('/Users/me/my_app', Date.now() - 1000, new Set(), dir)).toBeNull()
    expect(latestClaudeConversation('/Users/me/other', Date.now() - 600_000, new Set(), dir)).toBeNull()
  })
})
