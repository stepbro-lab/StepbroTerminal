/**
 * Settings of features the app no longer has. The voice agent kept a Gemini API key, its model,
 * voice and microphone, and keys of its own; with the voice gone, none of it has a use, and a key
 * to someone's account should not sit on disk for nothing. Returns whether anything was dropped,
 * so the file can be written without it at once.
 */
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
