import { app, Menu, shell } from 'electron'
import type { Ctx } from './context'

/**
 * Application menu. On macOS it is required for Cmd+C/V/Q to work; on other platforms
 * the window is frameless and the menu stays hidden, so only the accelerators matter.
 */
export function buildAppMenu(ctx: Ctx): void {
  const mac = process.platform === 'darwin'
  const cmd = (name: string): (() => void) => () => ctx.emit('ui:command', name)
  const template: Electron.MenuItemConstructorOptions[] = [
    ...(mac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' as const },
              { type: 'separator' as const },
              { label: 'Settings…', accelerator: 'Cmd+,', click: cmd('settings') },
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
        { label: 'New Session…', accelerator: 'CmdOrCtrl+N', click: cmd('new-session') },
        { label: 'New Shell', accelerator: 'CmdOrCtrl+T', click: cmd('new-shell') },
        { label: 'Add Project…', accelerator: 'CmdOrCtrl+Shift+O', click: cmd('add-project') },
        { type: 'separator' },
        { label: 'Close Session', accelerator: 'CmdOrCtrl+W', click: cmd('close-session') },
        ...(mac ? [] : [{ type: 'separator' as const }, { role: 'quit' as const }])
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
        { label: 'Find in Terminal', accelerator: 'CmdOrCtrl+F', click: cmd('find') }
      ]
    },
    {
      label: 'View',
      submenu: [
        { label: 'Command Palette', accelerator: 'CmdOrCtrl+K', click: cmd('palette') },
        { label: 'Toggle Sidebar', accelerator: 'CmdOrCtrl+B', click: cmd('toggle-sidebar') },
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
        { label: 'Restart Session', accelerator: 'CmdOrCtrl+Shift+R', click: cmd('restart-session') },
        { label: 'Rename Session', accelerator: 'F2', click: cmd('rename-session') }
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
