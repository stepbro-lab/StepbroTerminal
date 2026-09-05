import { app, Menu, shell } from 'electron'
import type { Ctx } from './context'
import { resolveBindings, toAccelerator, type ShortcutId } from '@shared/keybindings'

/**
 * Application menu. On macOS it is required for Cmd+C/V/Q to work; on other platforms
 * the window is frameless and the menu stays hidden, so only the accelerators matter.
 * Accelerators follow the user's shortcut choices; the menu is rebuilt when they change.
 */
export function buildAppMenu(ctx: Ctx): void {
  const mac = process.platform === 'darwin'
  const bindings = resolveBindings(ctx.prefs.keybindings, mac)
  const cmd = (name: ShortcutId): (() => void) => () => ctx.emit('ui:command', name)
  const item = (label: string, id: ShortcutId): Electron.MenuItemConstructorOptions => ({
    label,
    accelerator: toAccelerator(bindings[id]),
    click: cmd(id)
  })
  const template: Electron.MenuItemConstructorOptions[] = [
    ...(mac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' as const },
              { type: 'separator' as const },
              item('Settings…', 'settings'),
              { type: 'separator' as const },
              { role: 'hide' as const },
              { role: 'hideOthers' as const },
              { role: 'unhide' as const },
              { type: 'separator' as const },
              { role: 'quit' as const }
            ]
          }
        ]
      : []),
    {
      label: 'File',
      submenu: [
        item('New Session…', 'new-session'),
        item('New Shell', 'new-shell'),
        item('Add Project…', 'add-project'),
        { type: 'separator' },
        item('Close Session', 'close-session'),
        ...(mac ? [] : [{ type: 'separator' as const }, item('Settings…', 'settings'), { type: 'separator' as const }, { role: 'quit' as const }])
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
        { type: 'separator' },
        item('Find in Terminal', 'find')
      ]
    },
    {
      label: 'View',
      submenu: [
        item('Command Palette', 'palette'),
        item('Prompt History', 'prompt-history'),
        item('Notes', 'notes'),
        item('Toggle Sidebar', 'toggle-sidebar'),
        { type: 'separator' },
        item('Next View', 'next-view'),
        item('Previous View', 'prev-view'),
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        ...(app.isPackaged ? [] : [{ type: 'separator' as const }, { role: 'toggleDevTools' as const }])
      ]
    },
    {
      label: 'Session',
      submenu: [
        item('Split Right', 'split-right'),
        item('Split Down', 'split-down'),
        item('Move Pane to Its Own View', 'detach-pane'),
        { type: 'separator' },
        item('Next Session That Needs You', 'next-attention'),
        item('Restart Session', 'restart-session'),
        item('Rename Session', 'rename-session'),
        item('Redraw the Screen', 'redraw')
      ]
    },
    { role: 'windowMenu' },
    {
      role: 'help',
      submenu: [{ label: 'Open Data Folder', click: () => void shell.openPath(require('node:os').homedir() + '/.step') }]
    }
  ]
  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)
}
