const WAITING: RegExp[] = [
  /would you like to (run|apply|proceed)/i,
  /press enter to confirm or esc to cancel/i,
  /allow command\?/i,
  /allow execution/i,
  /do you want to proceed\?/i,
  /yes, allow (once|always)/i,
  /apply this change\?/i,
  /\((y\/n|yes\/no)\)\s*:?\s*$/i,
  /\[(y\/n|Y\/n|y\/N)\]\s*:?\s*$/
]

export function waitingForApproval(screenLines: string[]): boolean {
  return screenLines.some((line) => WAITING.some((re) => re.test(line)))
}

const BUSY: Record<string, RegExp> = {
  codex: /to interrupt\)/i
}

export function busyMarkerFor(agent: string | undefined): RegExp | undefined {
  return agent ? BUSY[agent] : undefined
}

export function busyOnScreen(agent: string | undefined, screenLines: string[]): boolean {
  const marker = busyMarkerFor(agent)
  return !!marker && screenLines.some((line) => marker.test(line))
}
