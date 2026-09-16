import { describe, expect, it } from 'vitest'
import { audioChunk, buildSetup, parseServerMessage, speechLanguage, textTurn, toolResult, INPUT_RATE } from './protocol'

const setup = (over: Partial<Parameters<typeof buildSetup>[0]> = {}) =>
  JSON.parse(
    buildSetup({
      model: 'gemini-3.8-live',
      instructions: 'be brief',
      functions: [{ name: 'list_sessions', description: 'the sessions', parameters: { type: 'object', properties: {} } }],
      languageCode: 'es-ES',
      voiceName: 'Puck',
      ...over
    })
  ).setup

describe('buildSetup', () => {
  it('names the model the way the service wants it, however it was written down', () => {
    expect(setup().model).toBe('models/gemini-3.8-live')
    expect(setup({ model: 'models/gemini-3.8-live' }).model).toBe('models/gemini-3.8-live')
  })

  it('asks for speech, in the chosen language and voice, with both sides transcribed', () => {
    const s = setup()
    expect(s.generationConfig.responseModalities).toEqual(['AUDIO'])
    expect(s.generationConfig.speechConfig.languageCode).toBe('es-ES')
    expect(s.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName).toBe('Puck')
    expect(s.inputAudioTranscription).toBeDefined()
    expect(s.outputAudioTranscription).toBeDefined()
    expect(s.systemInstruction.parts[0].text).toBe('be brief')
  })

  it('offers the tools it has, and none at all rather than an empty set', () => {
    expect(setup().tools[0].functionDeclarations[0].name).toBe('list_sessions')
    expect(setup({ functions: [] }).tools).toEqual([])
  })
})

describe('the messages we send', () => {
  it('labels microphone audio with the rate the model listens at', () => {
    const msg = JSON.parse(audioChunk('AAAA'))
    expect(msg.realtimeInput.audio.mimeType).toBe(`audio/pcm;rate=${INPUT_RATE}`)
    expect(msg.realtimeInput.audio.data).toBe('AAAA')
  })

  it('sends typed words as a finished turn', () => {
    const msg = JSON.parse(textTurn('hola'))
    expect(msg.clientContent.turnComplete).toBe(true)
    expect(msg.clientContent.turns[0]).toEqual({ role: 'user', parts: [{ text: 'hola' }] })
  })

  it('answers each tool call by the id it came with', () => {
    const msg = JSON.parse(toolResult([{ id: 'call-1', name: 'list_sessions', output: 'two' }]))
    expect(msg.toolResponse.functionResponses[0]).toEqual({ id: 'call-1', name: 'list_sessions', response: { output: 'two' } })
  })
})

describe('parseServerMessage', () => {
  it('reads the handshake', () => {
    expect(parseServerMessage(JSON.stringify({ setupComplete: {} }))).toEqual([{ kind: 'ready' }])
  })

  it('pulls speech out of a turn and leaves other parts alone', () => {
    const raw = JSON.stringify({
      serverContent: { modelTurn: { parts: [{ text: 'thinking' }, { inlineData: { mimeType: 'audio/pcm;rate=24000', data: 'QUJD' } }] } }
    })
    expect(parseServerMessage(raw)).toEqual([{ kind: 'audio', data: 'QUJD' }])
  })

  it('reads both transcripts, under either of the names they have had', () => {
    const now = parseServerMessage(JSON.stringify({ serverContent: { inputTranscription: { text: 'hola' }, outputTranscription: { text: 'dime' } } }))
    expect(now).toEqual([
      { kind: 'heard', text: 'hola' },
      { kind: 'said', text: 'dime' }
    ])
    const older = parseServerMessage(JSON.stringify({ serverContent: { inputAudioTranscription: { text: 'hola' } } }))
    expect(older).toEqual([{ kind: 'heard', text: 'hola' }])
  })

  it('reports being spoken over, and the end of a turn', () => {
    expect(parseServerMessage(JSON.stringify({ serverContent: { interrupted: true } }))).toEqual([{ kind: 'interrupted' }])
    expect(parseServerMessage(JSON.stringify({ serverContent: { turnComplete: true } }))).toEqual([{ kind: 'turnEnd' }])
  })

  it('reads tool calls, and the withdrawal of tool calls', () => {
    const calls = parseServerMessage(JSON.stringify({ toolCall: { functionCalls: [{ id: 'a', name: 'read_screen', args: { session: 'claude' } }] } }))
    expect(calls).toEqual([{ kind: 'tools', calls: [{ id: 'a', name: 'read_screen', args: { session: 'claude' } }] }])
    expect(parseServerMessage(JSON.stringify({ toolCallCancellation: { ids: ['a'] } }))).toEqual([{ kind: 'cancelTools', ids: ['a'] }])
  })

  it('reads several things out of one message, in the order they matter', () => {
    const raw = JSON.stringify({
      serverContent: { modelTurn: { parts: [{ inlineData: { mimeType: 'audio/pcm', data: 'AA' } }] }, outputTranscription: { text: 'ya' }, turnComplete: true }
    })
    expect(parseServerMessage(raw).map((e) => e.kind)).toEqual(['audio', 'said', 'turnEnd'])
  })

  it('survives what it has never seen, and what is not even json', () => {
    expect(parseServerMessage(JSON.stringify({ somethingNew: { v: 1 } }))).toEqual([{ kind: 'other' }])
    expect(parseServerMessage('<html>502</html>')).toEqual([{ kind: 'other' }])
  })
})

describe('speechLanguage', () => {
  it('speaks Spanish to a Spanish app and English to the rest', () => {
    expect(speechLanguage('es')).toBe('es-ES')
    expect(speechLanguage('en')).toBe('en-US')
  })
})
