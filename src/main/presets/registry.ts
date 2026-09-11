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
    // DeepSeek serves an Anthropic-shaped API, so Claude Code runs on its models unchanged, with
    // the same hooks, notes and status. The key and the model come from Settings > Agents.
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
    // OpenCode finds its notes server and its status plugin through OPENCODE_CONFIG in the
    // session's environment, so it needs no arguments; a restart picks the last conversation
    // of that folder back up.
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
    // Its own installer puts clyra outside PATH on a fresh install, so detect.ts also looks where
    // that installer leaves it. Nothing else is passed: it takes the conversation from inside.
    id: 'clyra',
    name: 'Clyra',
    color: '#a78bfa',
    binary: 'clyra',
    binaries: ['clyra'],
    args: [],
    hooks: false
  },
  { id: 'kimi', name: 'Kimi Code', color: '#9b8cff', binary: 'kimi', binaries: ['kimi'], args: [], hooks: false },
  // The two terminal agents DeepSeek itself lists for its models. Deep Code keeps its own settings
  // file and picks conversations back up with /resume inside; Codewhale grew out of DeepSeek-TUI.
  { id: 'deepcode', name: 'Deep Code', color: '#4d6bfe', binary: 'deepcode', binaries: ['deepcode'], args: [], hooks: false },
  { id: 'codewhale', name: 'Codewhale', color: '#2f9bd6', binary: 'codewhale', binaries: ['codewhale', 'codew'], args: [], hooks: false }
]

export function presetColor(id: string, presets?: Preset[]): string {
  return presets?.find((p) => p.id === id)?.color ?? builtinPresets.find((p) => p.id === id)?.color ?? '#8a8a90'
}
