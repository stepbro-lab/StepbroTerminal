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

/** How loud the sound through an analyser is right now, 0 to 1: its RMS, scaled so speech fills the range. */
function rms(analyser: AnalyserNode, samples: Float32Array<ArrayBuffer>): number {
  analyser.getFloatTimeDomainData(samples)
  let sum = 0
  for (const v of samples) sum += v * v
  return Math.min(1, Math.sqrt(sum / samples.length) * 4)
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

/**
 * The microphones this machine has. Their names only arrive once the person has allowed the
 * microphone at least once; before that the browser hands back blank labels, and a numbered
 * stand-in is the best that can be said about them.
 */
export async function listMics(): Promise<Array<{ id: string; label: string }>> {
  if (!navigator.mediaDevices?.enumerateDevices) return []
  const devices = await navigator.mediaDevices.enumerateDevices()
  return devices
    .filter((d) => d.kind === 'audioinput' && d.deviceId !== 'default' && d.deviceId !== 'communications')
    .map((d, i) => ({ id: d.deviceId, label: d.label || `Microphone ${i + 1}` }))
}

export interface MicOptions {
  onBlock: (pcm: Int16Array) => void
  /** The microphone to listen through; the system default when left out. */
  deviceId?: string
}

/** The microphone, opened and converted; close it to hang up and free the device light. */
export class Mic {
  private ctx: AudioContext | null = null
  private stream: MediaStream | null = null
  private node: AudioWorkletNode | null = null
  /** Listens alongside the worklet, so how loud the person is can be read without touching what is sent. */
  private analyser: AnalyserNode | null = null
  private samples: Float32Array<ArrayBuffer> | null = null
  private url = ''
  private muted = true

  async open(o: MicOptions): Promise<void> {
    // Echo cancellation is what keeps the model from hearing itself through the speakers.
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        // Named rather than demanded: a microphone that has been unplugged should not stop the
        // conversation, it should fall back to whatever the machine is using now.
        ...(o.deviceId ? { deviceId: { ideal: o.deviceId } } : {})
      }
    })
    const ctx = new AudioContext()
    this.ctx = ctx
    const blob = new Blob([CAPTURE_WORKLET], { type: 'application/javascript' })
    this.url = URL.createObjectURL(blob)
    await ctx.audioWorklet.addModule(this.url)
    const node = new AudioWorkletNode(ctx, 'step-capture')
    this.node = node
    node.port.onmessage = (e: MessageEvent<Float32Array>) => {
      // Muted between turns, so nothing is measured, converted or sent while nobody is talking.
      if (this.muted) return
      o.onBlock(floatsToPcm16(resample(e.data, ctx.sampleRate, INPUT_RATE)))
    }
    const source = ctx.createMediaStreamSource(this.stream)
    source.connect(node)
    // Connected to nothing audible: the worklet only reports, it must not be heard.
    node.connect(ctx.destination)
    node.port.start()
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 1024
    source.connect(analyser)
    this.analyser = analyser
    this.samples = new Float32Array(analyser.fftSize)
  }

  /** How loud the person is right now, 0 to 1, while the microphone is open: what the glow follows as they talk. */
  level(): number {
    return this.analyser && this.samples ? rms(this.analyser, this.samples) : 0
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
    this.analyser = null
    this.samples = null
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
  /** Everything played goes through it on its way out, so how loud the voice is can be read. */
  private analyser: AnalyserNode | null = null
  private samples: Float32Array<ArrayBuffer> | null = null
  private playing: AudioBufferSourceNode[] = []
  private nextAt = 0
  /** Set while sound is actually coming out, so the bubble can show it. */
  onSpeaking: (speaking: boolean) => void = () => {}

  private context(): AudioContext {
    if (!this.ctx) {
      const ctx = new AudioContext({ sampleRate: OUTPUT_RATE })
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 1024
      analyser.connect(ctx.destination)
      this.ctx = ctx
      this.analyser = analyser
      this.samples = new Float32Array(analyser.fftSize)
    }
    return this.ctx
  }

  /** How loud the voice is right now, 0 to 1. */
  level(): number {
    return this.analyser && this.samples && this.playing.length ? rms(this.analyser, this.samples) : 0
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
    src.connect(this.analyser ?? ctx.destination)
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
    this.analyser = null
    this.samples = null
  }
}
