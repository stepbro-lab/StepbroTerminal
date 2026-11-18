import type { Prefs } from '@shared/types'

export function closesToTray(platform: NodeJS.Platform, prefs: Pick<Prefs, 'closeToTray'>, trayShown: boolean, quitting: boolean): boolean {
  return platform === 'win32' && trayShown && !quitting && prefs.closeToTray !== false
}
