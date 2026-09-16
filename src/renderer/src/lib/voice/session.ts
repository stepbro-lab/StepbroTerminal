import { Mic, Speaker, base64ToPcm16, pcm16ToBase64 } from './audio'
import { audioChunk, buildSetup, parseServerMessage, speechLanguage, textTurn, toolResult, LIVE_URL, type LiveCall } from './protocol'
import { runTool, VOICE_FUNCTIONS, VOICE_INSTRUCTIONS, type ToolOutcome, type VoiceApp } from './tools'

/**
 * One spoken conversation, from the moment the bubble opens to the moment it closes: a socket to
 * the model, the microphone going out, its voice coming back, and the tools it calls in between.
 */

export type VoiceState = 'off' | 'connecting' | 'listening' | 'speaking' | 'error'

export interface VoiceHandlers {
  state: (state: VoiceState, detail?: string) => void
  /** What the person is saying, as it is recognized. */
  heard: (text: string) => void
  /** What the voice is saying, as it says it. */
  said: (text: string) => void
  did: (what: NonNullable<ToolOutcome['did']>) => void
  /** How loud the microphone is, 0 to 1, for the bubble to move to. */
  level: (level: number) => void
}

export interface VoiceOptions {
  apiKey: string
  model: string
  language: string
  voiceName: string
  /** The microphone to listen through; the system default when left out. */
  deviceId?: string
  app: VoiceApp
  on: VoiceHandlers
}

/** A close code carries a reason worth repeating: a key that is not allowed says so here. */
function closeReason(e: CloseEvent): string {
  const reason = (e.reason ?? '').trim()
  if (reason) return reason
  return e.code === 1006 ? 'The connection dropped.' : `The connection closed (${e.code}).`
}

export class VoiceConversation {
  private ws: WebSocket | null = null
  private mic = new Mic()
  private speaker = new Speaker()
  private o: VoiceOptions
  private stopped = false
  private speaking = false

  constructor(o: VoiceOptions) {
    this.o = o
  }

  async start(): Promise<void> {
    this.o.on.state('connecting')
    // The microphone first: being refused it is the common failure, and there is no point
    // holding a socket open to say so.
    try {
      await this.mic.open({
        deviceId: this.o.deviceId,
        onBlock: (pcm, level) => {
          this.o.on.level(level)
          if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(audioChunk(pcm16ToBase64(pcm)))
        }
      })
    } catch (e: any) {
      this.fail(e?.name === 'NotAllowedError' ? 'microphone-denied' : (e?.message ?? 'The microphone could not be opened.'))
      return
    }
    this.speaker.onSpeaking = (on) => {
      this.speaking = on
      if (!this.stopped) this.o.on.state(on ? 'speaking' : 'listening')
    }

    const ws = new WebSocket(`${LIVE_URL}?key=${encodeURIComponent(this.o.apiKey)}`)
    this.ws = ws
    ws.onopen = () => {
      ws.send(
        buildSetup({
          model: this.o.model,
          instructions: VOICE_INSTRUCTIONS,
          functions: VOICE_FUNCTIONS,
          languageCode: speechLanguage(this.o.language),
          voiceName: this.o.voiceName
        })
      )
    }
    ws.onmessage = (ev) => void this.onMessage(ev)
    ws.onerror = () => {
      // An error always arrives with a close right behind it, which carries the reason.
    }
    ws.onclose = (e) => {
      if (this.stopped) return
      this.fail(closeReason(e))
    }
  }

  private async onMessage(ev: MessageEvent): Promise<void> {
    const raw = typeof ev.data === 'string' ? ev.data : await (ev.data as Blob).text()
    for (const event of parseServerMessage(raw)) {
      switch (event.kind) {
        case 'ready':
          this.o.on.state('listening')
          break
        case 'audio':
          this.speaker.play(base64ToPcm16(event.data))
          break
        case 'heard':
          this.o.on.heard(event.text)
          break
        case 'said':
          this.o.on.said(event.text)
          break
        case 'interrupted':
          // Spoken over: what is queued is already out of date.
          this.speaker.stop()
          break
        case 'tools':
          void this.answerTools(event.calls)
          break
        case 'goAway':
          this.fail('The conversation reached its limit. Start it again.')
          break
        default:
          break
      }
    }
  }

  /** Some tools open a terminal, which takes a moment; the model waits for all of them at once. */
  private async answerTools(calls: LiveCall[]): Promise<void> {
    const answers = await Promise.all(
      calls.map(async (call) => {
        let outcome: ToolOutcome
        try {
          outcome = await runTool(this.o.app, call.name, call.args)
        } catch (e: any) {
          outcome = { output: `That failed: ${e?.message ?? 'unknown error'}` }
        }
        if (outcome.did) this.o.on.did(outcome.did)
        return { id: call.id, name: call.name, output: outcome.output }
      })
    )
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(toolResult(answers))
  }

  /** Something typed into the bubble instead of spoken. */
  say(text: string): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(textTurn(text))
  }

  /** Stops the microphone without hanging up; the voice can still be heard. */
  setMuted(muted: boolean): void {
    this.mic.setMuted(muted)
  }

  /** True while the model's voice is coming out of the speakers. */
  isSpeaking(): boolean {
    return this.speaking
  }

  private fail(detail: string): void {
    if (this.stopped) return
    this.o.on.state('error', detail)
    this.stop(true)
  }

  stop(keepState = false): void {
    this.stopped = true
    this.mic.close()
    this.speaker.close()
    const ws = this.ws
    this.ws = null
    if (ws) {
      ws.onclose = null
      ws.onerror = null
      ws.onmessage = null
      try {
        ws.close()
      } catch {
        /* already gone */
      }
    }
    if (!keepState) this.o.on.state('off')
  }
}
