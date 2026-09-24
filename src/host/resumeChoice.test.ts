import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type { LaunchSpec } from '@shared/types'
import { claudeConversationExists, startsResumed } from './resumeChoice'

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
