import type { MenuItemSpec, Session } from '@shared/types'
import { useData } from '@/stores/data'
import { useUi } from '@/stores/ui'
import { registry } from '@/terminal/TerminalRegistry'
import { popup, sep } from './menus'
import { defaultTitle, rowPresetId } from './sidebarModel'
import { redrawSession } from './actions'

const encoder = new TextEncoder()

function isAgent(s: Session): boolean {
  return s.launch.hooks || !!s.agent.detectedPreset || s.presetId !== 'shell'
}

/**
 * Types text into another session. For agents the text is followed by Enter after a short pause,
 * so the agent sees a prompt rather than a paste burst; shells just get the text to edit or run.
 */
export function sendToSession(targetId: string, text: string): void {
  const target = useData.getState().sessions[targetId]
  if (!target) return
  window.step.send('host:input', targetId, encoder.encode(text))
  if (isAgent(target)) window.setTimeout(() => window.step.send('host:input', targetId, new Uint8Array([0x0d])), 200)
  useUi.getState().toast(`Sent to ${target.title || defaultTitle(target)}`, 'success')
}

/** Right-click menu inside a terminal: copy, paste, hand the selection to another session, find. */
export async function terminalContextMenu(id: string, x: number, y: number): Promise<void> {
  const e = registry.get(id)
  if (!e) return
  const selection = e.term.getSelection()
  const data = useData.getState()
  const presets = data.presets
  const others = Object.values(data.sessions).filter((s) => s.id !== id && s.alive)
  const targets: MenuItemSpec[] = others.map((s) => {
    const preset = presets.find((p) => p.id === rowPresetId(s))
    return { id: `send:${s.id}`, label: `${s.title || defaultTitle(s)}${preset && preset.id !== 'shell' ? `  ·  ${preset.name}` : ''}` }
  })
  const pick = await popup(
    [
      { id: 'copy', label: 'Copy', enabled: !!selection },
      { id: 'paste', label: 'Paste' },
      sep,
      { label: 'Send selection to', submenu: targets, enabled: !!selection && targets.length > 0 },
      sep,
      { id: 'find', label: 'Find…' },
      { id: 'redraw', label: 'Redraw screen' },
      { id: 'selectAll', label: 'Select all' },
      { id: 'clearSel', label: 'Clear selection', enabled: !!selection }
    ],
    { x, y }
  )
  if (!pick) return
  if (pick.startsWith('send:')) {
    sendToSession(pick.slice(5), selection)
    return
  }
  switch (pick) {
    case 'copy':
      window.step.send('clipboard:write', selection)
      break
    case 'paste':
      void registry.pasteInto(id)
      break
    case 'find':
      useUi.getState().setSearchOpen(true)
      break
    case 'redraw':
      redrawSession(id)
      break
    case 'selectAll':
      e.term.selectAll()
      break
    case 'clearSel':
      e.term.clearSelection()
      break
  }
  registry.focus(id)
}
