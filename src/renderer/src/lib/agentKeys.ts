/**
 * What Shift+Enter should send so an agent inserts a line break instead of submitting.
 * Claude Code and Gemini CLI treat a backslash followed by Enter as a line break; Codex
 * takes Ctrl+J. Shells keep their own Shift+Enter, so null there.
 */
export function newlineSequence(agent: string | null | undefined): string | null {
  if (agent === 'claude' || agent === 'gemini') return '\\\r'
  if (agent === 'codex') return '\n'
  return null
}
