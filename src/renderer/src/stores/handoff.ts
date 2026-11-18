import { create } from 'zustand'
import type { Handoff } from '@shared/types'

interface HandoffStore {
  pending: Handoff | null
  arrive: (h: Handoff) => void
  landed: () => void
}

export const useHandoff = create<HandoffStore>((set) => ({
  pending: null,
  arrive: (pending) => set({ pending }),
  landed: () => set({ pending: null })
}))
