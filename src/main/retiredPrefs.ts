const RETIRED = ['geminiApiKey', 'voiceModel', 'voiceName', 'voiceInput', 'readSpeed', 'voiceAnywhere'] as const
const RETIRED_KEYS = ['voice', 'voice-anywhere', 'read-aloud'] as const

export function dropRetiredPrefs(raw: Record<string, unknown>): boolean {
  let dropped = false
  for (const k of RETIRED) {
    if (k in raw) {
      delete raw[k]
      dropped = true
    }
  }
  const keys = raw['keybindings']
  if (keys && typeof keys === 'object') {
    for (const k of RETIRED_KEYS) {
      if (k in keys) {
        delete (keys as Record<string, unknown>)[k]
        dropped = true
      }
    }
  }
  return dropped
}
