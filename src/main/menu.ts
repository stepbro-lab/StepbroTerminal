import { app, Menu, shell } from 'electron'
import type { Ctx } from './context'
import { resolveBindings, toAccelerator, type ShortcutId } from '@shared/keybindings'
import { t } from './i18n'

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
              item(t('Settings…'), 'settings'),
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
      label: t('File'),
      submenu: [
        item(t('New Session…'), 'new-session'),
        item(t('New Shell'), 'new-shell'),
        item(t('Add Project…'), 'add-project'),
        { type: 'separator' },
        item(t('Close Session'), 'close-session'),
        ...(mac ? [] : [{ type: 'separator' as const }, item(t('Settings…'), 'settings'), { type: 'separator' as const }, { role: 'quit' as const }])
      ]
    },
    {
      label: t('Edit'),
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
        { type: 'separator' },
        item(t('Find in Terminal'), 'find')
      ]
    },
    {
      label: t('View'),
      submenu: [
        item(t('Command Palette'), 'palette'),
        item(t('Prompt History'), 'prompt-history'),
        item(t('Notes'), 'notes'),
        item(t('Toggle Sidebar'), 'toggle-sidebar'),
        { type: 'separator' },
        item(t('Next View'), 'next-view'),
        item(t('Previous View'), 'prev-view'),
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
      label: t('Session'),
      submenu: [
        item(t('Split Right'), 'split-right'),
        item(t('Split Down'), 'split-down'),
        item(t('Move Pane to Its Own View'), 'detach-pane'),
        { type: 'separator' },
        item(t('Next Session That Needs You'), 'next-attention'),
        item(t('Restart Session'), 'restart-session'),
        item(t('Rename Session'), 'rename-session'),
        item(t('Redraw the Screen'), 'redraw')
      ]
    },
    { role: 'windowMenu' },
    {
      role: 'help',
      submenu: [{ label: t('Open Data Folder'), click: () => void shell.openPath(require('node:os').homedir() + '/.step') }]
    }
  ]
  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)
}
