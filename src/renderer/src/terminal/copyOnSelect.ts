import { pressOutcome } from './mousePress'

export interface Press {
  button: number
  ctrlKey: boolean
  shiftKey: boolean
  detail: number
  clientX: number
  clientY: number
}

export function pressOf(ev: MouseEvent): Press {
  return { button: ev.button, ctrlKey: ev.ctrlKey, shiftKey: ev.shiftKey, detail: ev.detail, clientX: ev.clientX, clientY: ev.clientY }
}

export function choseText(press: Press, to: { clientX: number; clientY: number }, platform: string): boolean {
  if (press.button !== 0) return false
  if (platform === 'darwin' && press.ctrlKey) return false
  return press.detail >= 2 || press.shiftKey || pressOutcome(press, to) === 'drag'
}

export function textToCopy(selection: string): string | null {
  return selection.trim() ? selection : null
}
