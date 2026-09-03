import type { Preset } from '@shared/types'

export type BuiltinPreset = Omit<Preset, 'installed' | 'resolvedPath'> & { binaries: string[] }

/** Order here is the default order in the preset strip; shell always comes first. */
export const builtinPresets: BuiltinPreset[] = [
  { id: 'shell', name: 'Shell', color: '#8a8a90', binary: '', binaries: [], args: [], hooks: false },
  {
    id: 'claude',
    name: 'Claude Code',
    color: '#d97757',
    binary: 'claude',
    binaries: ['claude'],
    args: ['--session-id', '{sessionId}', '--settings', '{hooksSettings}', '--mcp-config', '{mcpConfig}'],
    resumeArgs: ['--resume', '{sessionId}', '--settings', '{hooksSettings}', '--mcp-config', '{mcpConfig}'],
    hooks: true
  },
  {
    id: 'codex',
    name: 'Codex',
    color: '#7aa2ff',
    binary: 'codex',
    binaries: ['codex'],
    args: ['-c', 'mcp_servers.stepbro.url="{mcpUrl}"'],
    resumeArgs: ['-c', 'mcp_servers.stepbro.url="{mcpUrl}"', 'resume', '{sessionId}'],
    hooks: false
  },
  {
    id: 'gemini',
    name: 'Gemini CLI',
    color: '#4c8bf5',
    binary: 'gemini',
    binaries: ['gemini'],
    args: [],
    resumeArgs: ['--resume'],
    hooks: false
  },
  {
    id: 'cursor',
    name: 'Cursor Agent',
    color: '#22c55e',
    binary: 'cursor-agent',
    binaries: ['cursor-agent', 'agent'],
    args: [],
    hooks: false
  },
  { id: 'opencode', name: 'OpenCode', color: '#f2c94c', binary: 'opencode', binaries: ['opencode'], args: [], hooks: false },
  { id: 'kimi', name: 'Kimi Code', color: '#9b8cff', binary: 'kimi', binaries: ['kimi'], args: [], hooks: false }
]

export function presetColor(id: string, presets?: Preset[]): string {
  return presets?.find((p) => p.id === id)?.color ?? builtinPresets.find((p) => p.id === id)?.color ?? '#8a8a90'
}
