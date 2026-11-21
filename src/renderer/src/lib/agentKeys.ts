// Shift+Enter in win32-input-mode: VK 13, scan 28, char 13, key down, Shift held, repeat 1.
export const WIN32_SHIFT_ENTER = '\x1b[13;28;13;1;16;1_'

// DeepSeek runs Claude Code, so it takes Claude Code's keys.
const isClaudeCode = (agent: string | null | undefined): boolean => agent === 'claude' || agent === 'deepseek'

export function newlineSequence(agent: string | null | undefined, platform: string): string | null {
  if (isClaudeCode(agent) || agent === 'gemini') return '\\\r'
  if (agent === 'codex') return platform === 'win32' ? WIN32_SHIFT_ENTER : '\n'
  return null
}

// Outside macOS xterm.js sends Ctrl+Up/Down for Alt+Up/Down, so Codex never sees Alt.
export function altArrowSequence(agent: string | null | undefined, key: 'ArrowUp' | 'ArrowDown', platform: string): string | null {
  if (agent !== 'codex' || platform === 'darwin') return null
  return key === 'ArrowUp' ? '\x1b[1;3A' : '\x1b[1;3B'
}

// Claude Code reads the clipboard on its paste key: Alt+V on Windows, Ctrl+V elsewhere.
export function imagePaste(agent: string | null | undefined, platform: string): { kind: 'key'; bytes: number[] } | { kind: 'path' } {
  if (isClaudeCode(agent)) return { kind: 'key', bytes: platform === 'win32' ? [0x1b, 0x76] : [0x16] }
  return { kind: 'path' }
}

export function imagePathText(agent: string | null | undefined, file: string, platform: string): string {
  const quoted = !/\s/.test(file) ? file : platform === 'win32' ? `"${file}"` : file.replace(/ /g, '\\ ')
  return (agent === 'gemini' ? '@' : '') + quoted + ' '
}
