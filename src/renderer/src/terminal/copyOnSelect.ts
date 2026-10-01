import { pressOutcome } from './mousePress'

/** What the terminal keeps of the press that started a gesture. */
export interface Press {
  button: number
  ctrlKey: boolean
  shiftKey: boolean
  /** 1 for a single click, 2 for a double, 3 for a triple. */
  detail: number
  clientX: number
  clientY: number
}

export function pressOf(ev: MouseEvent): Press {
  return { button: ev.button, ctrlKey: ev.ctrlKey, shiftKey: ev.shiftKey, detail: ev.detail, clientX: ev.clientX, clientY: ev.clientY }
}

/**
 * Whether a press, let go at `to`, was someone choosing text: a drag, a double or triple click, or
 * a Shift-click that stretches the selection. A plain click is not: it clears the selection, or in
 * a program that owns the mouse goes to the program and leaves the selection there, and copying
 * that again would put back something the clipboard has since moved on from. Nor is the button
 * that opens the menu, or a Control-click on a Mac, which is the same thing: the word they select
 * on the way would replace what is about to be pasted from that menu.
 */
export function choseText(press: Press, to: { clientX: number; clientY: number }, platform: string): boolean {
  if (press.button !== 0) return false
  if (platform === 'darwin' && press.ctrlKey) return false
  return press.detail >= 2 || press.shiftKey || pressOutcome(press, to) === 'drag'
}

/** What goes on the clipboard: the selection, unless it is only blank. */
export function textToCopy(selection: string): string | null {
  return selection.trim() ? selection : null
}
