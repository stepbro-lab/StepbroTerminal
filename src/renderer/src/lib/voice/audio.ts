import { INPUT_RATE, OUTPUT_RATE } from './protocol'

/**
 * The sound of the conversation: the microphone on its way out, the model's voice on its way in.
 *
 * The microphone gives whatever rate the device likes, in floats; the model wants 16 kHz signed
 * 16-bit samples. It answers at 24 kHz, which has to be played back seamlessly, piece by piece,
 * and dropped the instant the person speaks over it. The conversions are pure functions so they
 * can be checked without a sound card.
 */

/** Floats in [-1, 1] to signed 16-bit samples, with anything past the ends clipped rather than wrapped. */
export function floatsToPcm16(input: Float32Array): Int16Array {
  const out = new Int16Array(input.length)
  for (let i = 0; i < input.length; i++) {
    const v = Math.max(-1, Math.min(1, input[i]))
    out[i] = Math.round(v < 0 ? v * 0x8000 : v * 0x7fff)
  }
  return out
}

export function pcm16ToFloats(input: Int16Array): Float32Array {
  const out = new Float32Array(input.length)
  for (let i = 0; i < input.length; i++) out[i] = input[i] / (input[i] < 0 ? 0x8000 : 0x7fff)
  return out
}

/**
 * Down to the rate the model listens at, by reading between samples. Good enough for speech, and
 * cheap enough to run on every block of audio the microphone produces.
 */
export function resample(input: Float32Array, from: number, to: number): Float32Array {
  if (from === to || input.length === 0) return input
  const ratio = from / to
  const out = new Float32Array(Math.max(1, Math.floor(input.length / ratio)))
  for (let i = 0; i < out.length; i++) {
    const at = i * ratio
    const low = Math.floor(at)
    const high = Math.min(low + 1, input.length - 1)
    const t = at - low
    out[i] = input[low] * (1 - t) + input[high] * t
  }
  return out
}

export function pcm16ToBase64(pcm: Int16Array): string {
  const bytes = new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength)
  let s = ''
  // In chunks, because a whole second of audio at once overflows the argument list.
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

export function base64ToPcm16(b64: string): Int16Array {
  const s = atob(b64)
  const bytes = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i)
  // An odd byte count would be half a sample; drop it rather than read past the end.
  return new Int16Array(bytes.buffer, 0, Math.floor(bytes.length / 2))
}

/** How loud a block is, 0 to 1: what the bubble pulses to. */
export function loudness(input: Float32Array): number {
  if (!input.length) return 0
  let sum = 0
  for (let i = 0; i < input.length; i++) sum += input[i] * input[i]
  // Speech sits well below full scale, so the root mean square is lifted into a usable range.
  return Math.min(1, Math.sqrt(sum / input.length) * 4)
}

/**
 * The worklet that hands blocks of microphone audio back to the page. It runs on the audio
 * thread, where nothing else may block it, and is given to the browser as text: bundlers have no
 * say over a blob, so this works the same in development and in a packaged app.
 */
const CAPTURE_WORKLET = `
class Capture extends AudioWorkletProcessor {
  process(inputs) {
    const ch = inputs[0] && inputs[0][0]
    if (ch && ch.length) this.port.postMessage(new Float32Array(ch))
    return true
  }
}
registerProcessor('step-capture', Capture)
`

export interface MicOptions {
  onBlock: (pcm: Int16Array, level: number) => void
}

/** The microphone, opened and converted; close it to hang up and free the device light. */
export class Mic {
  private ctx: AudioContext | null = null
  private stream: MediaStream | null = null
  private node: AudioWorkletNode | null = null
  private url = ''
  private muted = false

  async open(o: MicOptions): Promise<void> {
    // Echo cancellation is what keeps the model from hearing itself through the speakers.
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true }
    })
    const ctx = new AudioContext()
    this.ctx = ctx
    const blob = new Blob([CAPTURE_WORKLET], { type: 'application/javascript' })
    this.url = URL.createObjectURL(blob)
    await ctx.audioWorklet.addModule(this.url)
    const node = new AudioWorkletNode(ctx, 'step-capture')
    this.node = node
    node.port.onmessage = (e: MessageEvent<Float32Array>) => {
      if (this.muted) return
      const block = e.data
      o.onBlock(floatsToPcm16(resample(block, ctx.sampleRate, INPUT_RATE)), loudness(block))
    }
    ctx.createMediaStreamSource(this.stream).connect(node)
    // Connected to nothing audible: the worklet only reports, it must not be heard.
    node.connect(ctx.destination)
    node.port.start()
  }

  /** Stops sending without dropping the device, so speaking again is instant. */
  setMuted(muted: boolean): void {
    this.muted = muted
  }

  close(): void {
    this.node?.port.close()
    this.node?.disconnect()
    this.stream?.getTracks().forEach((t) => t.stop())
    void this.ctx?.close()
    if (this.url) URL.revokeObjectURL(this.url)
    this.node = null
    this.stream = null
    this.ctx = null
    this.url = ''
  }
}

/**
 * The model's voice. Slices arrive faster than they play, so each is booked to start where the
 * one before it ends; a barge-in throws away everything not yet heard.
 */
export class Speaker {
  private ctx: AudioContext | null = null
  private playing: AudioBufferSourceNode[] = []
  private nextAt = 0
  /** Set while sound is actually coming out, so the bubble can show it. */
  onSpeaking: (speaking: boolean) => void = () => {}

  private context(): AudioContext {
    if (!this.ctx) this.ctx = new AudioContext({ sampleRate: OUTPUT_RATE })
    return this.ctx
  }

  play(pcm: Int16Array): void {
    if (!pcm.length) return
    const ctx = this.context()
    void ctx.resume()
    const buffer = ctx.createBuffer(1, pcm.length, OUTPUT_RATE)
    // Written into the channel rather than copied in: the samples come from a view over bytes,
    // and set() takes that where copyToChannel wants a buffer of its own.
    buffer.getChannelData(0).set(pcm16ToFloats(pcm))
    const src = ctx.createBufferSource()
    src.buffer = buffer
    src.connect(ctx.destination)
    // A slice that arrives late starts now; one that arrives early waits its turn.
    const start = Math.max(ctx.currentTime, this.nextAt)
    src.start(start)
    this.nextAt = start + buffer.duration
    this.playing.push(src)
    if (this.playing.length === 1) this.onSpeaking(true)
    src.onended = () => {
      this.playing = this.playing.filter((p) => p !== src)
      if (!this.playing.length) this.onSpeaking(false)
    }
  }

  /** Cuts the voice off mid-word: what a person talking over it expects. */
  stop(): void {
    for (const src of this.playing) {
      try {
        src.onended = null
        src.stop()
      } catch {
        /* already finished */
      }
    }
    this.playing = []
    this.nextAt = 0
    this.onSpeaking(false)
  }

  close(): void {
    this.stop()
    void this.ctx?.close()
    this.ctx = null
  }
}
