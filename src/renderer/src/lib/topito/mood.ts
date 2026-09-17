import type { Session, TopitoMood } from '@shared/types'
import type { TopitoClipName } from './frames'

/**
 * What Topito is doing, worked out from what the app is doing. Pure, so every rule can be read and
 * checked on its own: the director (director.ts) feeds it the stores and plays what it returns.
 */

export type VoiceLook = 'off' | 'connecting' | 'ready' | 'talking' | 'answering' | 'error'

export interface TopitoWorld {
  voice: VoiceLook
  hostConnecting: boolean
  sessions: Session[]
}

const TYPING = /^(edit|write|multiedit|notebookedit|apply_patch|str_replace|create_file|replace)/i
const READING = /^(read|grep|glob|ls|notebookread|view|search_files|list_files|read_screen)/i
const SEARCHING = /^(websearch|webfetch|fetch|browser|preview_)/i
const NOTING = /(save_note|update_note|todowrite)/i
const WRITING_TO = /(report|send_to_session)/i
const WAITING = /(^|__)wait$/i

/** What an agent's current tool looks like Topito doing. */
export function clipForTool(tool: string | undefined, agent: string): TopitoClipName {
  if (!tool) return agent === 'claude' ? 'think' : 'dig'
  // MCP tools arrive as mcp__server__name; the name is what says what it does.
  const name = tool.includes('__') ? tool.slice(tool.lastIndexOf('__') + 2) : tool
  if (NOTING.test(name)) return 'note'
  if (WRITING_TO.test(name)) return 'letter'
  if (WAITING.test(tool)) return 'coffee'
  if (TYPING.test(name)) return 'type'
  if (READING.test(name)) return 'read'
  if (SEARCHING.test(name)) return 'search'
  if (/^task$|^agent$/i.test(name)) return 'think'
  return 'dig'
}

const live = (s: Session): boolean => s.alive && !s.archived
const agentOf = (s: Session): string => s.agent.detectedPreset ?? s.presetId

/**
 * The look Topito keeps while nothing in particular is happening, most pressing first: the voice
 * agent, then the connection to the host, then anyone waiting on the person, then work under way,
 * and asleep when there is none.
 */
export function ambientClip(w: TopitoWorld): TopitoClipName {
  if (w.voice === 'talking') return 'listen'
  if (w.voice === 'answering') return 'talk'
  if (w.voice === 'connecting' || w.hostConnecting) return 'search'
  const open = w.sessions.filter(live)
  if (open.some((s) => s.status === 'attention' || s.status === 'error')) return 'peek'
  const working = open.filter((s) => s.status === 'working' || s.status === 'starting')
  if (working.length) {
    // The one that moved most recently is the one worth showing.
    const latest = working.reduce((a, b) => (b.statusAt > a.statusAt ? b : a))
    return clipForTool(latest.agent.tool, agentOf(latest))
  }
  return 'sleep'
}

/**
 * The one-off moments between two looks at the sessions: one finishing, one failing, one opening
 * or going away. Nothing on the very first look, when every session arrives at once.
 */
export function moments(prev: Record<string, Session>, next: Record<string, Session>): TopitoClipName[] {
  const before = Object.keys(prev)
  if (!before.length) return []
  const out: TopitoClipName[] = []
  for (const s of Object.values(next)) {
    const was = prev[s.id]
    if (!was) {
      if (live(s)) out.push('hello')
      continue
    }
    if (live(was) && !live(s)) {
      out.push('bye')
      continue
    }
    if (!live(s) || was.status === s.status) continue
    if (s.status === 'done' && (was.status === 'working' || was.status === 'starting')) out.push('done')
    else if (s.status === 'error') out.push('oops')
  }
  for (const id of before) if (!next[id] && live(prev[id])) out.push('bye')
  return out
}

/** Sessions that have just started waiting on the person. */
export function newlyWaiting(prev: Record<string, Session>, next: Record<string, Session>): Session[] {
  if (!Object.keys(prev).length) return []
  return Object.values(next).filter((s) => live(s) && s.status === 'attention' && prev[s.id] && prev[s.id].status !== 'attention')
}

/** The clip for the mood an agent asked for. */
export function clipForMood(mood: TopitoMood): TopitoClipName {
  const clips: Record<TopitoMood, TopitoClipName> = {
    done: 'done',
    needs_you: 'peek',
    happy: 'love',
    thinking: 'think',
    oops: 'oops',
    hello: 'hello',
    surprised: 'surprise',
    coffee: 'coffee'
  }
  return clips[mood] ?? 'hello'
}
