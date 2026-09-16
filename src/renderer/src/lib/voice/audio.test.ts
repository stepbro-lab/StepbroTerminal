import { describe, expect, it } from 'vitest'
import { base64ToPcm16, floatsToPcm16, loudness, pcm16ToBase64, pcm16ToFloats, resample } from './audio'

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

describe('loudness', () => {
  it('is nothing for silence and rises with the voice', () => {
    expect(loudness(new Float32Array(64))).toBe(0)
    const quiet = loudness(new Float32Array(64).fill(0.02))
    const loud = loudness(new Float32Array(64).fill(0.3))
    expect(quiet).toBeLessThan(loud)
    expect(loud).toBeLessThanOrEqual(1)
  })

  it('never goes past one, however loud it gets', () => {
    expect(loudness(new Float32Array(64).fill(1))).toBe(1)
  })
})
