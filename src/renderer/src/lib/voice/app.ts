import { useData } from '@/stores/data'
import { useUi } from '@/stores/ui'
import { registry } from '@/terminal/TerminalRegistry'
import { createSession, splitWithNewShell } from '@/lib/actions'
import { defaultTitle, rowPresetId } from '@/lib/sidebarModel'
import type { VoiceAgent, VoiceApp, VoiceFolder, VoiceSession } from './tools'

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

    async open(folderPath: string, presetId: string): Promise<string | null> {
      const session = await createSession(folderPath, presetId)
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
      window.step.send('host:input', id, new TextEncoder().encode(text))
    },

    enter(id: string): void {
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
