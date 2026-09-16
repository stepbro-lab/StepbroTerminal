import { useData } from '@/stores/data'
import { useUi } from '@/stores/ui'
import { registry } from '@/terminal/TerminalRegistry'
import { createSession, splitWithNewShell } from '@/lib/actions'
import { defaultTitle, rowPresetId } from '@/lib/sidebarModel'
import type { VoiceAgent, VoiceApp, VoiceFolder, VoiceSession } from './tools'

/**
 * What to read out when asked without a word about what: whatever is selected in the pane in
 * front, and when nothing is, what is on its screen. Reaching a menu means moving the mouse, and
 * a click on the way there takes the selection with it, so this needs neither.
 */
export function selectionOrScreen(): string {
  const id = useUi.getState().activeId
  if (!id) return ''
  const term = registry.get(id)?.term
  if (!term) return ''
  const selected = term.getSelection().trim()
  if (selected) return selected
  const buf = term.buffer.active
  const lines: string[] = []
  for (let i = 0; i < term.rows; i++) lines.push(buf.getLine(buf.viewportY + i)?.translateToString(true) ?? '')
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop()
  return lines.join('\n')
}

/** When each session was last typed into, so an Enter never lands on top of the text it submits. */
const typedAt = new Map<string, number>()
const ENTER_GAP_MS = 900

/** The voice's view of the running app: the sessions it can see, read and write to. */
export function liveApp(): VoiceApp {
  return {
    sessions(): VoiceSession[] {
      const { sessions } = useData.getState()
      const activeId = useUi.getState().activeId
      return Object.values(sessions)
        .filter((s) => !s.archived)
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .map((s) => ({
          id: s.id,
          title: s.title || defaultTitle(s),
          agent: rowPresetId(s),
          folder: s.projectPath.split(/[\\/]/).filter(Boolean).pop() ?? s.projectPath,
          status: s.alive ? s.status : 'closed',
          active: s.id === activeId
        }))
    },

    folders(): VoiceFolder[] {
      return useData.getState().projects.map((p) => ({ path: p.path, name: p.name }))
    },

    agents(): VoiceAgent[] {
      return useData
        .getState()
        .presets.filter((p) => p.installed)
        .map((p) => ({ id: p.id, name: p.name }))
    },

    async open(folderPath: string, presetId: string, firstMessage?: string): Promise<string | null> {
      // A first message is handed to the host rather than typed from here: it waits for the pane's
      // first quiet spell before entering it, so an agent still drawing its prompt never loses it.
      const session = await createSession(folderPath, presetId, { runOnStart: firstMessage })
      return session?.id ?? null
    },

    async split(dir: 'row' | 'column'): Promise<void> {
      await splitWithNewShell(dir)
    },

    screen(id: string): string {
      const term = registry.get(id)?.term
      if (!term) return ''
      const buf = term.buffer.active
      const lines: string[] = []
      for (let i = 0; i < term.rows; i++) lines.push(buf.getLine(buf.viewportY + i)?.translateToString(true) ?? '')
      // Blank rows at the foot of a screen say nothing worth spending words on.
      while (lines.length && !lines[lines.length - 1].trim()) lines.pop()
      return lines.join('\n')
    },

    type(id: string, text: string): void {
      typedAt.set(id, Date.now())
      window.step.send('host:input', id, new TextEncoder().encode(text))
    },

    async enter(id: string): Promise<void> {
      // An input line needs a moment to take a burst of text in. Sent too soon after it, the
      // Enter is folded into the paste and the prompt sits there unsent, which is the one thing
      // somebody who asked for it to be sent would notice.
      const since = Date.now() - (typedAt.get(id) ?? 0)
      if (since < ENTER_GAP_MS) await new Promise((r) => setTimeout(r, ENTER_GAP_MS - since))
      window.step.send('host:input', id, new TextEncoder().encode('\r'))
    },

    focus(id: string): void {
      const ui = useUi.getState()
      const session = useData.getState().sessions[id]
      if (session) ui.setActiveProject(session.projectPath)
      ui.setActive(id)
    }
  }
}
