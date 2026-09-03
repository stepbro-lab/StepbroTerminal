import { describe, expect, it } from 'vitest'
import { waitingForApproval } from './screenPrompts'

const codexScreen = [
  '• Running pnpm test -- --run; pnpm typecheck; pnpm build',
  '',
  '  Would you like to run the following command?',
  '',
  '  Environment: local',
  '',
  '  $ pnpm test -- --run; pnpm typecheck; pnpm build',
  '',
  '› 1. Yes, proceed (y)',
  '  2. Yes, and don\'t ask again for commands that start with `pnpm test` (p)',
  '  3. No, and tell Codex what to do differently (esc)',
  '',
  '  Press enter to confirm or esc to cancel'
]

describe('waitingForApproval', () => {
  it('spots the Codex approval box', () => {
    expect(waitingForApproval(codexScreen)).toBe(true)
  })

  it('spots Gemini asking before a tool runs', () => {
    expect(waitingForApproval(['Shell echo hi', 'Allow execution?', '● Yes, allow once', '  Yes, allow always', '  No (esc)'])).toBe(true)
  })

  it('spots a plain y/n question at the end of a line', () => {
    expect(waitingForApproval(['Overwrite config.json? (y/n)'])).toBe(true)
    expect(waitingForApproval(['Continue [Y/n]: '])).toBe(true)
  })

  it('stays quiet for ordinary output', () => {
    expect(waitingForApproval(['$ pnpm test', 'Tests 61 passed (61)', 'PS C:\\repo>'])).toBe(false)
    expect(waitingForApproval(['esc to interrupt', '› Working on it…', 'Would you like a summary? Sure.'])).toBe(false)
    expect(waitingForApproval([])).toBe(false)
  })
})
