/**
 * The wire protocol of Gemini's live API, the one that carries speech both ways over a single
 * socket. Everything here is pure: what to say to open a conversation, and how to read what comes
 * back. The socket itself, the microphone and the speakers live next door in session.ts.
 */

/** Audio the model expects from the microphone, and the audio it sends back. */
export const INPUT_RATE = 16000
export const OUTPUT_RATE = 24000

export const LIVE_URL = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent'

/** The model that listens and speaks. Any model whose name ends in live or native-audio will do. */
export const DEFAULT_VOICE_MODEL = 'models/gemini-3.8-live'

export interface FunctionDeclaration {
  name: string
  description: string
  parameters: { type: 'object'; properties: Record<string, unknown>; required?: string[] }
}

export interface SetupOptions {
  model: string
  instructions: string
  functions: FunctionDeclaration[]
  /** BCP-47 tag of the language to speak, e.g. es-ES. */
  languageCode: string
  voiceName: string
}

/** The first message of a conversation: which model, what it may do, and how it should sound. */
export function buildSetup(o: SetupOptions): string {
  return JSON.stringify({
    setup: {
      model: o.model.startsWith('models/') ? o.model : `models/${o.model}`,
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          languageCode: o.languageCode,
          voiceConfig: { prebuiltVoiceConfig: { voiceName: o.voiceName } }
        }
      },
      systemInstruction: { parts: [{ text: o.instructions }] },
      tools: o.functions.length ? [{ functionDeclarations: o.functions }] : [],
      // Both sides transcribed: what was heard is what the prompt is written from.
      inputAudioTranscription: {},
      outputAudioTranscription: {},
      // Push to talk: the turn ends when the person lets go of the key, not when they go quiet.
      // Someone thinking out loud stops and starts, and being cut off mid-thought is the whole
      // reason talking to a machine is tiring.
      realtimeInputConfig: { automaticActivityDetection: { disabled: true } }
    }
  })
}

/**
 * A slice of microphone audio. The field carrying it was renamed once in this API's life; if a
 * server ever ignores what we send, this single line is the place to look.
 */
export function audioChunk(base64: string): string {
  return JSON.stringify({ realtimeInput: { audio: { mimeType: `audio/pcm;rate=${INPUT_RATE}`, data: base64 } } })
}

/** The person pressed the key to speak, and let it go. Audio between the two is one turn. */
export function turnStart(): string {
  return JSON.stringify({ realtimeInput: { activityStart: {} } })
}

export function turnEnd(): string {
  return JSON.stringify({ realtimeInput: { activityEnd: {} } })
}

/** Something typed rather than spoken, sent as a finished turn. */
export function textTurn(text: string): string {
  return JSON.stringify({ clientContent: { turns: [{ role: 'user', parts: [{ text }] }], turnComplete: true } })
}

/** What a tool the model called gave back. */
export function toolResult(calls: Array<{ id?: string; name: string; output: unknown }>): string {
  return JSON.stringify({
    toolResponse: {
      functionResponses: calls.map((c) => ({ id: c.id, name: c.name, response: { output: c.output } }))
    }
  })
}

export interface LiveCall {
  id?: string
  name: string
  args: Record<string, unknown>
}

/** What the far side can say to us, once read into something the app can act on. */
export type LiveEvent =
  | { kind: 'ready' }
  /** A slice of the model's speech, as raw 16-bit samples at OUTPUT_RATE. */
  | { kind: 'audio'; data: string }
  /** Words, as they are recognized: ours while we speak, the model's while it speaks. */
  | { kind: 'heard'; text: string }
  | { kind: 'said'; text: string }
  /** The person spoke over the model: whatever is still queued must be dropped at once. */
  | { kind: 'interrupted' }
  | { kind: 'turnEnd' }
  | { kind: 'tools'; calls: LiveCall[] }
  /** Calls the model withdrew before they were answered. */
  | { kind: 'cancelTools'; ids: string[] }
  /** The socket will be closed soon and a fresh one should take over. */
  | { kind: 'goAway' }
  | { kind: 'other' }

/**
 * Reads one message from the socket. Unknown shapes come back as 'other' rather than throwing:
 * this protocol grows new fields between model versions, and a conversation should survive them.
 */
export function parseServerMessage(raw: string): LiveEvent[] {
  let msg: Record<string, any>
  try {
    msg = JSON.parse(raw)
  } catch {
    return [{ kind: 'other' }]
  }
  const out: LiveEvent[] = []
  if (msg.setupComplete) out.push({ kind: 'ready' })

  const content = msg.serverContent
  if (content) {
    for (const part of content.modelTurn?.parts ?? []) {
      const data = part.inlineData?.data
      if (data && String(part.inlineData.mimeType ?? '').startsWith('audio/')) out.push({ kind: 'audio', data })
    }
    // The two transcripts have carried both names; read either.
    const heard = content.inputTranscription?.text ?? content.inputAudioTranscription?.text
    const said = content.outputTranscription?.text ?? content.outputAudioTranscription?.text
    if (heard) out.push({ kind: 'heard', text: heard })
    if (said) out.push({ kind: 'said', text: said })
    if (content.interrupted) out.push({ kind: 'interrupted' })
    if (content.turnComplete) out.push({ kind: 'turnEnd' })
  }

  const calls = msg.toolCall?.functionCalls
  if (Array.isArray(calls) && calls.length) {
    out.push({
      kind: 'tools',
      calls: calls.map((c: any) => ({ id: c.id, name: String(c.name ?? ''), args: (c.args ?? {}) as Record<string, unknown> }))
    })
  }
  const cancelled = msg.toolCallCancellation?.ids
  if (Array.isArray(cancelled) && cancelled.length) out.push({ kind: 'cancelTools', ids: cancelled.map(String) })
  if (msg.goAway) out.push({ kind: 'goAway' })

  return out.length ? out : [{ kind: 'other' }]
}

/** The tag the model speaks in, from the language the app is set to. */
export function speechLanguage(appLanguage: string): string {
  return appLanguage === 'es' ? 'es-ES' : 'en-US'
}
