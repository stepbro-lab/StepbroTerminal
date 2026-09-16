import { Mic, Speaker, base64ToPcm16, pcm16ToBase64 } from './audio'
import { audioChunk, buildSetup, parseServerMessage, speechLanguage, textTurn, toolResult, turnEnd, turnStart, LIVE_URL, type LiveCall } from './protocol'
import { runTool, VOICE_FUNCTIONS, VOICE_INSTRUCTIONS, type ToolOutcome, type VoiceApp } from './tools'

/**
 * One spoken conversation: a socket to the model, the microphone going out while the key is held,
 * its voice coming back, and the tools it calls in between.
 *
 * The microphone stays open the whole time but muted between turns, so pressing to speak is
 * instant, and nothing is converted or sent while nobody is talking.
 */

export type VoiceState = 'off' | 'connecting' | 'ready' | 'talking' | 'answering' | 'error'

export interface VoiceHandlers {
  state: (state: VoiceState, detail?: string) => void
  /** What the person said, once it has been recognized. */
  heard: (text: string) => void
  did: (what: NonNullable<ToolOutcome['did']>) => void
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
  private ready = false
  private talking = false
  /** Pressed before the socket was ready: the turn opens the moment it is. */
  private waiting = false
  /** Said before the socket was ready: sent the moment it is. */
  private queued: string[] = []

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
        onBlock: (pcm) => {
          if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(audioChunk(pcm16ToBase64(pcm)))
        }
      })
    } catch (e: any) {
      this.fail(e?.name === 'NotAllowedError' ? 'microphone-denied' : (e?.message ?? 'The microphone could not be opened.'))
      return
    }
    this.speaker.onSpeaking = (on) => {
      if (this.stopped || this.talking) return
      this.o.on.state(on ? 'answering' : 'ready')
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

  /** Pressed: from here until it is let go, everything heard belongs to one turn. */
  beginTurn(): void {
    if (this.stopped || this.talking) return
    if (!this.ready) {
      this.waiting = true
      return
    }
    this.talking = true
    this.waiting = false
    // Speaking over the answer cuts it off, the way it would with a person.
    this.speaker.stop()
    this.ws?.send(turnStart())
    this.mic.setMuted(false)
    this.o.on.state('talking')
  }

  /** Let go: the turn is over and the model may answer. */
  endTurn(): void {
    this.waiting = false
    if (!this.talking) return
    this.talking = false
    this.mic.setMuted(true)
    this.ws?.send(turnEnd())
    if (!this.stopped) this.o.on.state('ready')
  }

  private async onMessage(ev: MessageEvent): Promise<void> {
    const raw = typeof ev.data === 'string' ? ev.data : await (ev.data as Blob).text()
    for (const event of parseServerMessage(raw)) {
      switch (event.kind) {
        case 'ready':
          this.ready = true
          this.o.on.state('ready')
          for (const text of this.queued.splice(0)) this.say(text)
          // Pressed while it was still connecting: open the turn now rather than lose it.
          if (this.waiting) this.beginTurn()
          break
        case 'audio':
          this.speaker.play(base64ToPcm16(event.data))
          break
        case 'heard':
          this.o.on.heard(event.text)
          break
        case 'interrupted':
          this.speaker.stop()
          break
        case 'tools':
          void this.answerTools(event.calls)
          break
        case 'goAway':
          this.fail('The conversation reached its limit. Press to talk again.')
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

  /** Something written instead of spoken: a question typed, or a passage to read out. */
  say(text: string): void {
    if (this.stopped) return
    if (!this.ready) {
      this.queued.push(text)
      return
    }
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(textTurn(text))
  }

  private fail(detail: string): void {
    if (this.stopped) return
    this.o.on.state('error', detail)
    this.stop(true)
  }

  stop(keepState = false): void {
    this.stopped = true
    this.talking = false
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
