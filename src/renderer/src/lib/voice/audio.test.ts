import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Speaker, base64ToPcm16, floatsToPcm16, pcm16ToBase64, pcm16ToFloats, resample } from './audio'
import { OUTPUT_RATE } from './protocol'

describe('samples back and forth', () => {
  it('turns floats into 16-bit samples and back without drifting', () => {
    const floats = new Float32Array([0, 0.5, -0.5, 1, -1])
    const back = pcm16ToFloats(floatsToPcm16(floats))
    for (let i = 0; i < floats.length; i++) expect(back[i]).toBeCloseTo(floats[i], 4)
  })

  it('clips what is past full scale instead of wrapping it round to the other end', () => {
    // Wrapping is what makes a loud voice crackle: the loudest sample must stay the loudest.
    const pcm = floatsToPcm16(new Float32Array([2, -2]))
    expect(pcm[0]).toBe(32767)
    expect(pcm[1]).toBe(-32768)
  })
})

describe('resample', () => {
  it('gives back the same samples when the rate already matches', () => {
    const input = new Float32Array([0.1, 0.2])
    expect(resample(input, 16000, 16000)).toBe(input)
  })

  it('takes three of every one at 48 kHz down to 16', () => {
    const input = new Float32Array(48)
    expect(resample(input, 48000, 16000).length).toBe(16)
  })

  it('reads between samples rather than dropping them', () => {
    // A ramp stays a ramp: halving the rate should land on the values in between.
    const ramp = Float32Array.from({ length: 8 }, (_, i) => i / 8)
    const half = resample(ramp, 32000, 16000)
    expect(half.length).toBe(4)
    expect(half[1]).toBeCloseTo(0.25, 5)
  })

  it('has nothing to say about nothing', () => {
    expect(resample(new Float32Array(0), 48000, 16000).length).toBe(0)
  })
})

describe('base64', () => {
  it('carries samples over the wire and back unchanged', () => {
    const pcm = new Int16Array([0, 1, -1, 32767, -32768, 1234])
    expect(Array.from(base64ToPcm16(pcm16ToBase64(pcm)))).toEqual(Array.from(pcm))
  })

  it('handles more audio than an argument list can hold', () => {
    // A second of speech is tens of thousands of samples; spreading them into a call blows up.
    const pcm = new Int16Array(40000).fill(999)
    const back = base64ToPcm16(pcm16ToBase64(pcm))
    expect(back.length).toBe(40000)
    expect(back[39999]).toBe(999)
  })

  it('drops a trailing half sample rather than reading past the end', () => {
    const odd = btoa('abc')
    expect(base64ToPcm16(odd).length).toBe(1)
  })
})

describe('Speaker', () => {
  /** Every slice booked to play, and when; the clock only moves when a test moves it. */
  let started: Array<{ at: number; duration: number; end: () => void }>
  let clock: { currentTime: number }

  beforeEach(() => {
    started = []
    clock = { currentTime: 0 }
    class Source {
      buffer: { duration: number } | null = null
      onended: (() => void) | null = null
      connect(): void {}
      stop(): void {}
      start(at: number): void {
        started.push({ at, duration: this.buffer!.duration, end: () => this.onended?.() })
      }
    }
    class Context {
      destination = {}
      get currentTime(): number {
        return clock.currentTime
      }
      resume = async (): Promise<void> => {}
      close = async (): Promise<void> => {}
      createBuffer = (_channels: number, length: number, rate: number) => ({ duration: length / rate, getChannelData: () => new Float32Array(length) })
      createBufferSource = () => new Source()
      createAnalyser = () => ({ fftSize: 0, connect: () => {}, getFloatTimeDomainData: () => {} })
    }
    vi.stubGlobal('AudioContext', Context)
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  /** A slice of the model's voice this many seconds long. */
  const slice = (seconds: number) => new Int16Array(Math.round(seconds * OUTPUT_RATE))

  it('gathers the start of an answer before playing it, so a slow stream does not stutter', () => {
    const speaker = new Speaker()
    speaker.play(slice(0.2))
    speaker.play(slice(0.2))
    expect(started).toHaveLength(0)
    speaker.play(slice(0.2))
    expect(started.map((s) => s.at)).toEqual([expect.closeTo(0.02, 5), expect.closeTo(0.22, 5), expect.closeTo(0.42, 5)])
  })

  it('books what arrives while it speaks straight after what is already booked', () => {
    const speaker = new Speaker()
    for (let i = 0; i < 3; i++) speaker.play(slice(0.2))
    clock.currentTime = 0.1
    speaker.play(slice(0.2))
    expect(started[3].at).toBeCloseTo(0.62, 5)
  })

  it('plays a short answer as soon as the answer is over', () => {
    const speaker = new Speaker()
    speaker.play(slice(0.2))
    speaker.flush()
    expect(started).toHaveLength(1)
  })

  it('never keeps a slice waiting for long', () => {
    const speaker = new Speaker()
    speaker.play(slice(0.2))
    vi.advanceTimersByTime(1400)
    expect(started).toHaveLength(0)
    vi.advanceTimersByTime(200)
    expect(started).toHaveLength(1)
  })

  it('gathers again when the voice runs out halfway, and says when it is speaking', () => {
    const speaker = new Speaker()
    const speaking: boolean[] = []
    speaker.onSpeaking = (on) => speaking.push(on)
    for (let i = 0; i < 3; i++) speaker.play(slice(0.2))
    clock.currentTime = 0.7
    for (const s of started) s.end()
    expect(speaking).toEqual([true, false])
    speaker.play(slice(0.2))
    expect(started).toHaveLength(3)
    speaker.play(slice(0.2))
    speaker.play(slice(0.2))
    expect(started).toHaveLength(6)
    expect(started[3].at).toBeCloseTo(0.72, 5)
    expect(speaking).toEqual([true, false, true])
  })

  it('drops what it was gathering when cut off', () => {
    const speaker = new Speaker()
    speaker.play(slice(0.2))
    speaker.stop()
    speaker.flush()
    vi.advanceTimersByTime(2000)
    expect(started).toHaveLength(0)
  })
})
