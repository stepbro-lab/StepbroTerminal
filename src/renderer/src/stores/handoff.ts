import { create } from 'zustand'
import type { Handoff } from '@shared/types'

interface HandoffStore {
  /** Text one agent just sent to another session, until its flight has played. */
  pending: Handoff | null
  arrive: (h: Handoff) => void
  landed: () => void
}

export const useHandoff = create<HandoffStore>((set) => ({
  pending: null,
  arrive: (pending) => set({ pending }),
  landed: () => set({ pending: null })
}))
