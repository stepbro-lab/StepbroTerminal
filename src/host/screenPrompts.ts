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
