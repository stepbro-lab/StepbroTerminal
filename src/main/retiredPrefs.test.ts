import { describe, expect, it } from 'vitest'
import { dropRetiredPrefs } from './retiredPrefs'

describe('dropRetiredPrefs', () => {
  it('takes the voice settings off disk, the Gemini key first of all', () => {
    const raw: Record<string, unknown> = { geminiApiKey: 'AIza-secret', voiceModel: 'm', voiceName: 'Puck', voiceInput: 'mic', readSpeed: 'fast', voiceAnywhere: false, fontSize: 14, keybindings: { voice: '.', 'voice-anywhere': null, 'read-aloud': 'Mod+Shift+P', palette: 'Mod+P' } }
    expect(dropRetiredPrefs(raw)).toBe(true)
    expect(raw).toEqual({ fontSize: 14, keybindings: { palette: 'Mod+P' } })
  })

  it('leaves settings without any of it untouched', () => {
    const raw: Record<string, unknown> = { fontSize: 14, deepseekApiKey: 'sk-keep', keybindings: { palette: 'Mod+P' } }
    expect(dropRetiredPrefs(raw)).toBe(false)
    expect(raw).toEqual({ fontSize: 14, deepseekApiKey: 'sk-keep', keybindings: { palette: 'Mod+P' } })
  })
})
