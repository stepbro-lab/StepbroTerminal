import { create } from 'zustand'
import type { TopitoClipName } from '@/lib/topito/sprite'

export interface TopitoCorner {
  key: number
  clip: TopitoClipName
  text: string
  from?: string
  sessionId?: string
}

export interface TopitoLine {
  text: string
  sessionId?: string
}

export interface TopitoStore {
  ambient: TopitoClipName
  moment: { key: number; clip: TopitoClipName } | null
  queue: TopitoClipName[]
  corner: TopitoCorner | null
  bubble: { key: number; lines: TopitoLine[] } | null
  elsewhere: number
  setAmbient: (clip: TopitoClipName) => void
  play: (clip: TopitoClipName) => void
  finish: () => void
  showCorner: (corner: Omit<TopitoCorner, 'key'>, ms: number) => void
  hideCorner: () => void
  showBubble: (lines: TopitoLine[], ms: number) => void
  hideBubble: () => void
  enter: () => void
  leave: () => void
}

const QUEUE_MAX = 2

let keys = 0
let cornerTimer = 0
let bubbleTimer = 0

export const useTopito = create<TopitoStore>((set, get) => ({
  ambient: 'sleep',
  moment: null,
  queue: [],
  corner: null,
  bubble: null,
  elsewhere: 0,

  setAmbient: (ambient) => {
    if (get().ambient !== ambient) set({ ambient })
  },

  play: (clip) => {
    const { moment, queue } = get()
    if (!moment) set({ moment: { key: ++keys, clip } })
    else if (queue.length < QUEUE_MAX && queue[queue.length - 1] !== clip && moment.clip !== clip) set({ queue: [...queue, clip] })
  },

  finish: () => {
    const [next, ...rest] = get().queue
    set({ moment: next ? { key: ++keys, clip: next } : null, queue: rest })
  },

  showCorner: (corner, ms) => {
    window.clearTimeout(cornerTimer)
    set({ corner: { ...corner, key: ++keys } })
    cornerTimer = window.setTimeout(() => set({ corner: null }), ms)
  },

  hideCorner: () => {
    window.clearTimeout(cornerTimer)
    set({ corner: null })
  },

  showBubble: (lines, ms) => {
    window.clearTimeout(bubbleTimer)
    set({ bubble: { key: ++keys, lines } })
    bubbleTimer = window.setTimeout(() => set({ bubble: null }), ms)
  },

  hideBubble: () => {
    window.clearTimeout(bubbleTimer)
    set({ bubble: null })
  },

  enter: () => set({ elsewhere: get().elsewhere + 1 }),
  leave: () => set({ elsewhere: Math.max(0, get().elsewhere - 1) })
}))
