/**
 * Shift+Enter as a Windows console key event, in the win32-input-mode form ConPTY reads from the
 * terminal: virtual key 13 (Enter), scan code 28, character 13, key down, Shift held, once.
 */
export const WIN32_SHIFT_ENTER = '\x1b[13;28;13;1;16;1_'

/**
 * What Shift+Enter should send so an agent inserts a line break instead of submitting.
 * Claude Code and Gemini CLI treat a backslash followed by Enter as a line break. Codex takes
 * Shift+Enter or Ctrl+J, but on Windows ConPTY turns the Ctrl+J byte into Ctrl+Enter, which Codex
 * ignores, so there it gets Shift+Enter itself as a console key event. Shells keep their own
 * Shift+Enter, so null there.
 */
export function newlineSequence(agent: string | null | undefined, platform: string): string | null {
  if (agent === 'claude' || agent === 'gemini') return '\\\r'
  if (agent === 'codex') return platform === 'win32' ? WIN32_SHIFT_ENTER : '\n'
  return null
}

/**
 * What Alt+Up and Alt+Down should send to an agent that binds them. Outside macOS xterm.js sends
 * Ctrl+Up and Ctrl+Down for them, so Codex never sees Alt; this is what other terminals send, and
 * what ConPTY hands on as Alt with the arrow. Everything else keeps xterm's own.
 */
export function altArrowSequence(agent: string | null | undefined, key: 'ArrowUp' | 'ArrowDown', platform: string): string | null {
  if (agent !== 'codex' || platform === 'darwin') return null
  return key === 'ArrowUp' ? '\x1b[1;3A' : '\x1b[1;3B'
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
