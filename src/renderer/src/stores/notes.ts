import { create } from 'zustand'
import type { Note } from '@shared/types'

interface NotesStore {
  notes: Note[]
  open: boolean
  /** The note an agent just saved, until its flight to the Notes button has played. */
  arrived: Note | null
  receive: (notes: Note[], added?: Note) => void
  setOpen: (open: boolean) => void
  toggle: () => void
  add: (text: string) => void
  update: (id: string, patch: { text?: string; done?: boolean }) => void
  remove: (id: string) => void
  landed: () => void
}

export const useNotes = create<NotesStore>((set, get) => ({
  notes: [],
  open: false,
  arrived: null,
  receive: (notes, added) => set({ notes, arrived: added && added.source.kind === 'agent' ? added : get().arrived }),
  setOpen: (open) => set({ open }),
  toggle: () => set((s) => ({ open: !s.open })),
  add: (text) => window.step.send('notes:add', text),
  update: (id, patch) => window.step.send('notes:update', id, patch),
  remove: (id) => window.step.send('notes:delete', id),
  landed: () => set({ arrived: null })
}))

export const openCount = (notes: Note[]): number => notes.filter((n) => !n.done).length

/** Open notes first, newest first; done ones trail behind. */
export function sortNotes(notes: Note[]): Note[] {
  return notes.slice().sort((a, b) => Number(a.done) - Number(b.done) || b.createdAt - a.createdAt)
}
