import { describe, expect, it } from 'vitest'
import { choseText, textToCopy, type Press } from './copyOnSelect'

const at = { clientX: 100, clientY: 100 }
const press = (p: Partial<Press> = {}): Press => ({ button: 0, ctrlKey: false, shiftKey: false, detail: 1, ...at, ...p })
const moved = { clientX: 160, clientY: 112 }

describe('copying what is selected', () => {
  it('copies after a drag, a double or triple click and a Shift-click', () => {
    expect(choseText(press(), moved, 'darwin')).toBe(true)
    expect(choseText(press({ detail: 2 }), at, 'darwin')).toBe(true)
    expect(choseText(press({ detail: 3 }), at, 'win32')).toBe(true)
    expect(choseText(press({ shiftKey: true }), at, 'linux')).toBe(true)
  })

  it('leaves the clipboard alone on a plain click, however much the hand shakes', () => {
    expect(choseText(press(), at, 'darwin')).toBe(false)
    expect(choseText(press(), { clientX: 102, clientY: 98 }, 'win32')).toBe(false)
  })

  it('leaves it alone for the menu: the right button, and Control-click on a Mac', () => {
    expect(choseText(press({ button: 2 }), moved, 'darwin')).toBe(false)
    expect(choseText(press({ button: 2, detail: 2 }), at, 'win32')).toBe(false)
    expect(choseText(press({ button: 1 }), moved, 'linux')).toBe(false)
    expect(choseText(press({ ctrlKey: true }), at, 'darwin')).toBe(false)
    expect(choseText(press({ ctrlKey: true }), moved, 'darwin')).toBe(false)
    expect(choseText(press({ ctrlKey: true }), moved, 'win32')).toBe(true)
  })

  it('copies the selection as it is, but not when it is only blank', () => {
    expect(textToCopy('  npm run dev  ')).toBe('  npm run dev  ')
    expect(textToCopy('line one\nline two')).toBe('line one\nline two')
    expect(textToCopy('   ')).toBeNull()
    expect(textToCopy('\n\n')).toBeNull()
    expect(textToCopy('')).toBeNull()
  })
})
