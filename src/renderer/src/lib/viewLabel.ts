import type { Session } from '@shared/types'
import { defaultTitle, rowPresetId } from './sidebarModel'

export interface ViewLabel {
  /** Short name for the tab: one title, the part the titles share, or the agents in it. */
  text: string
  /** Agents in the view, first seen first, at most three; drawn as stacked logos. */
  presetIds: string[]
  count: number
}

const MAX = 28

/**
 * Names a view for the title-bar tabs. One session shows its title. Several sessions show
 * what their titles have in common ("STEPBRO TERMINAL" for "STEPBRO TERMINAL CLAUDE" and
 * "STEPBRO TERMINAL CODEX"); failing that, the agents ("Claude Code · Codex"); failing that,
 * the first title and how many more there are. Never a title chopped mid-word.
 */
export function viewLabel(sessions: Session[], presetName: (presetId: string) => string): ViewLabel {
  const presetIds = [...new Set(sessions.map(rowPresetId))].slice(0, 3)
  const count = sessions.length
  if (count === 0) return { text: 'Empty', presetIds, count }
  const titles = sessions.map((s) => (s.title || defaultTitle(s)).trim())
  if (count === 1) return { text: clip(titles[0]), presetIds, count }

  const shared = sharedWords(titles)
  if (shared.length >= 6) return { text: clip(shared), presetIds, count }

  const names = sessions.map((s) => presetName(rowPresetId(s)))
  if (new Set(names).size === names.length) return { text: clip(names.join(' · ')), presetIds, count }

  return { text: clip(`${titles[0]} +${count - 1}`), presetIds, count }
}

/** The leading words every title has in common, case-insensitively, without trailing separators. */
function sharedWords(titles: string[]): string {
  const split = titles.map((t) => t.split(/\s+/))
  const first = split[0]
  let k = 0
  while (k < first.length && split.every((w) => w[k] !== undefined && w[k].toLowerCase() === first[k].toLowerCase())) k++
  return first
    .slice(0, k)
    .join(' ')
    .replace(/[\s·:—–-]+$/, '')
}

function clip(text: string): string {
  return text.length > MAX ? text.slice(0, MAX - 1).trimEnd() + '…' : text
}
