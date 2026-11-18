import type { Prefs } from './types'

export function canBlurBehind(platform: string, osVersion: string): boolean {
  if (platform === 'darwin') return true
  if (platform === 'win32') return Number(osVersion.split('.')[2]) >= 22621
  return false
}

export function isTranslucent(prefs: Pick<Prefs, 'frameOpacity' | 'contentOpacity'>, platform: string, osVersion: string): boolean {
  return canBlurBehind(platform, osVersion) && (prefs.frameOpacity < 1 || prefs.contentOpacity < 1)
}
