import type { Preset } from '@shared/types'

export type BuiltinPreset = Omit<Preset, 'installed' | 'resolvedPath'> & { binaries: string[] }

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
    id: 'deepseek',
    name: 'DeepSeek',
    color: '#4d6bfe',
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
  {
    id: 'opencode',
    name: 'OpenCode',
    color: '#f2c94c',
    binary: 'opencode',
    binaries: ['opencode'],
    args: [],
    resumeArgs: ['--continue'],
    hooks: false
  },
  {
    id: 'clyra',
    name: 'Clyra',
    color: '#a78bfa',
    binary: 'clyra',
    binaries: ['clyra'],
    args: [],
    resumeArgs: ['--continue'],
    hooks: false
  },
  { id: 'kimi', name: 'Kimi Code', color: '#9b8cff', binary: 'kimi', binaries: ['kimi'], args: [], hooks: false },
  { id: 'deepcode', name: 'Deep Code', color: '#4d6bfe', binary: 'deepcode', binaries: ['deepcode'], args: [], hooks: false },
  { id: 'codewhale', name: 'Codewhale', color: '#2f9bd6', binary: 'codewhale', binaries: ['codewhale', 'codew'], args: [], hooks: false }
]

export const FULL_ACCESS_FLAGS: Record<string, string> = {
  claude: '--dangerously-skip-permissions',
  deepseek: '--dangerously-skip-permissions',
  codex: '--dangerously-bypass-approvals-and-sandbox',
  gemini: '--yolo',
  opencode: '--auto'
}

export function presetColor(id: string, presets?: Preset[]): string {
  return presets?.find((p) => p.id === id)?.color ?? builtinPresets.find((p) => p.id === id)?.color ?? '#8a8a90'
}
