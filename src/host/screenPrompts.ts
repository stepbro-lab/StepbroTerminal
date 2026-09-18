/**
 * Agents without hooks (Codex, Gemini, anything custom) only show their permission
 * questions on screen. These are the lines they print while waiting for a yes or no.
 */
const WAITING: RegExp[] = [
  // Codex
  /would you like to (run|apply|proceed)/i,
  /press enter to confirm or esc to cancel/i,
  /allow command\?/i,
  // Gemini CLI
  /allow execution/i,
  /do you want to proceed\?/i,
  /yes, allow (once|always)/i,
  /apply this change\?/i,
  // Anything else that ends a line asking for a yes or no
  /\((y\/n|yes\/no)\)\s*:?\s*$/i,
  /\[(y\/n|Y\/n|y\/N)\]\s*:?\s*$/
]

/** Whether the visible screen holds a question the user has to answer. */
export function waitingForApproval(screenLines: string[]): boolean {
  return screenLines.some((line) => WAITING.some((re) => re.test(line)))
}

/**
 * The line an agent shows for as long as a turn is running, for agents whose screen keeps
 * drawing while they wait: Codex twinkles the prompt and turns a spinner in its title, so its
 * output never goes quiet, and only "Working (12s • esc to interrupt)" tells work from waiting.
 */
const BUSY: Record<string, RegExp> = {
  codex: /to interrupt\)/i
}

/** The busy line to look for on this agent's screen, when it has one. */
export function busyMarkerFor(agent: string | undefined): RegExp | undefined {
  return agent ? BUSY[agent] : undefined
}

/** Whether the visible screen shows the agent in the middle of a turn. */
export function busyOnScreen(agent: string | undefined, screenLines: string[]): boolean {
  const marker = busyMarkerFor(agent)
  return !!marker && screenLines.some((line) => marker.test(line))
}
