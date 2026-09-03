import fs from 'node:fs'
import path from 'node:path'
import { EventEmitter } from 'node:events'
import { randomBytes } from 'node:crypto'
import type { Note, NoteSource } from '@shared/types'

const MAX_TEXT = 4000
const MAX_NOTES = 1000

/**
 * Notes the user and their agents keep. One list for everyone, kept on disk so it survives
 * the window, the host and the agents that wrote it. Emits `change(notes, added?)`.
 */
export class NoteStore extends EventEmitter {
  private notes: Note[] = []

  constructor(private readonly file: string) {
    super()
  }

  load(): void {
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8'))
      this.notes = Array.isArray(raw) ? raw.filter(isNote) : []
    } catch {
      this.notes = []
    }
  }

  /** Newest first. */
  list(): Note[] {
    return this.notes.slice()
  }

  get(id: string): Note | undefined {
    return this.notes.find((n) => n.id === id)
  }

  add(text: string, source: NoteSource): Note {
    const now = Date.now()
    const note: Note = { id: newId(), text: clean(text), createdAt: now, updatedAt: now, done: false, source }
    this.notes.unshift(note)
    if (this.notes.length > MAX_NOTES) this.notes.length = MAX_NOTES
    this.commit(note)
    return note
  }

  update(id: string, patch: { text?: string; done?: boolean }): Note | null {
    const note = this.get(id)
    if (!note) return null
    if (typeof patch.text === 'string') note.text = clean(patch.text)
    if (typeof patch.done === 'boolean') note.done = patch.done
    note.updatedAt = Date.now()
    this.commit()
    return note
  }

  remove(id: string): boolean {
    const before = this.notes.length
    this.notes = this.notes.filter((n) => n.id !== id)
    if (this.notes.length === before) return false
    this.commit()
    return true
  }

  private commit(added?: Note): void {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true })
      fs.writeFileSync(this.file, JSON.stringify(this.notes, null, 2))
    } catch {
      /* the list still lives in memory; the next change tries again */
    }
    this.emit('change', this.list(), added)
  }
}

function clean(text: string): string {
  return text.replace(/\r\n/g, '\n').trim().slice(0, MAX_TEXT)
}

function newId(): string {
  return randomBytes(4).toString('hex')
}

function isNote(v: unknown): v is Note {
  const n = v as Note
  return !!n && typeof n.id === 'string' && typeof n.text === 'string' && typeof n.createdAt === 'number' && !!n.source
}
