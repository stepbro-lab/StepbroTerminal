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

/**
 * How an image on the clipboard reaches the program in front. Claude Code reads the clipboard
 * itself when it sees its paste key: Alt+V on Windows, where terminals swallow Ctrl+V, and
 * Ctrl+V elsewhere. Every other program gets the image as a file, the way a dropped file
 * arrives: Gemini CLI wants the path after an @, Codex, OpenCode and Clyra turn a bare path to
 * an image into an attachment, and a shell can hand the path to any command.
 */
export function imagePaste(agent: string | null | undefined, platform: string): { kind: 'key'; bytes: number[] } | { kind: 'path' } {
  if (agent === 'claude') return { kind: 'key', bytes: platform === 'win32' ? [0x1b, 0x76] : [0x16] }
  return { kind: 'path' }
}

/** The text to paste for an image saved at `file`: quoted the way the platform's terminals quote a dropped file. */
export function imagePathText(agent: string | null | undefined, file: string, platform: string): string {
  const quoted = !/\s/.test(file) ? file : platform === 'win32' ? `"${file}"` : file.replace(/ /g, '\\ ')
  return (agent === 'gemini' ? '@' : '') + quoted + ' '
}
