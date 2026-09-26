import type { Prefs } from '@shared/types'

/**
 * Whether closing the window leaves the app running in the tray instead of quitting it.
 *
 * On Windows the app used to quit with its window: the sessions went on in the host, but nothing
 * was left to say when one finished or needed you, and the tray icon went with it. Now the window
 * goes and the app stays in the tray, the way chat apps do there, until it is quit from the tray.
 * A Mac already keeps the app in the Dock; Linux desktops do not all show a tray, and a window
 * hidden there could not be brought back. Quitting for real (from the tray, for an update, or as
 * the system shuts down) always goes through.
 */
export function closesToTray(platform: NodeJS.Platform, prefs: Pick<Prefs, 'closeToTray'>, trayShown: boolean, quitting: boolean): boolean {
  return platform === 'win32' && trayShown && !quitting && prefs.closeToTray !== false
}
