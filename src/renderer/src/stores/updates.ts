import { create } from 'zustand'
import type { UpdateState } from '@shared/types'

interface UpdatesStore {
  state: UpdateState
  set: (state: UpdateState) => void
  check: () => Promise<void>
  /** Restart into the downloaded version, start the download, or open the releases page. */
  install: () => Promise<void>
}

export const useUpdates = create<UpdatesStore>((set) => ({
  state: { kind: 'idle' },
  set: (state) => set({ state }),
  check: async () => set({ state: await window.step.invoke('updates:check') }),
  install: () => window.step.invoke('updates:install')
}))
