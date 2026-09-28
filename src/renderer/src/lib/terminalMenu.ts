import type { MenuItemSpec, Session } from '@shared/types'
import { useData } from '@/stores/data'
import { useUi } from '@/stores/ui'
import { useHandoff } from '@/stores/handoff'
import { registry } from '@/terminal/TerminalRegistry'
import { popup, sep } from './menus'
import { defaultTitle, rowPresetId } from './sidebarModel'
import { redrawSession } from './actions'
import { t } from '@/lib/i18n'

const encoder = new TextEncoder()

function isAgent(s: Session): boolean {
  return s.launch.hooks || !!s.agent.detectedPreset || s.presetId !== 'shell'
}

/**
 * Types text into another session. For agents the text is followed by Enter once the paste burst
 * is well over, so the agent submits it rather than folding the Enter into the paste; shells just
 * get the text to edit or run. The text flies to the receiver on screen, which is the whole
 * confirmation; no toast.
 */
export function sendToSession(from: string, targetId: string, text: string): void {
  const target = useData.getState().sessions[targetId]
  if (!target) return
  window.step.send('host:input', targetId, encoder.encode(text))
  if (isAgent(target)) window.setTimeout(() => window.step.send('host:input', targetId, new Uint8Array([0x0d])), 900)
  useHandoff.getState().arrive({ from, to: targetId, text })
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
      { id: 'copy', label: t('Copy'), enabled: !!selection },
      { id: 'paste', label: t('Paste') },
      sep,
      { label: t('Send selection to'), submenu: targets, enabled: !!selection && targets.length > 0 },
      sep,
      { id: 'find', label: t('Find…') },
      { id: 'redraw', label: t('Redraw screen') },
      { id: 'selectAll', label: t('Select all') },
      { id: 'clearSel', label: t('Clear selection'), enabled: !!selection }
    ],
    { x, y }
  )
  if (!pick) return
  if (pick.startsWith('send:')) {
    sendToSession(id, pick.slice(5), selection)
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
