/**
 * What changed in each release, newest first, the way the app tells people after an update. The
 * text is English like every other string, with its Spanish in i18n.es.ts; a release adds its entry
 * here before it is cut.
 */

export type ChangeKind = 'new' | 'improved' | 'fixed'

export interface ChangelogEntry {
  version: string
  /** The day it shipped, YYYY-MM-DD. */
  date: string
  /** One line on what the release is about. */
  headline: string
  changes: Array<{ kind: ChangeKind; text: string }>
  /** Topito says hello at the top of this one: the release that brought him. */
  topito?: boolean
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '0.1.0-beta.22',
    date: '2026-09-20',
    headline: 'A calmer window: no shadow behind the text, and nothing over the menu.',
    changes: [
      { kind: 'fixed', text: 'Text and icons over a translucent window no longer carry a shadow around them.' },
      { kind: 'fixed', text: 'Right-clicking a selection no longer leaves the Read aloud button on top of the menu.' },
      { kind: 'fixed', text: 'An agent that draws a full screen, like OpenCode, comes back on its own screen after the app updates, instead of its frames piling up one over another.' },
      { kind: 'fixed', text: 'The Restart and Close buttons on a session that ended can be pressed again, instead of the click going through to the terminal.' },
      { kind: 'fixed', text: 'Clicking the buttons an agent draws, like the ones OpenCode asks with, works: a click reaches the program, and dragging still selects text.' }
    ]
  },
  {
    version: '0.1.0-beta.21',
    date: '2026-09-19',
    headline: 'Meet Topito, talk to your terminal from any app, and see your desktop through the window.',
    topito: true,
    changes: [
      { kind: 'new', text: 'Topito, a little mole who acts out what your agents are doing, pops out when one needs you and passes on what they want to tell you. Turn him on in Settings, under Appearance.' },
      { kind: 'new', text: 'Talk from any app: the voice key answers while another program is in front, and asking it to open an agent in a folder with a message types the message and sends it.' },
      { kind: 'new', text: 'A translucent window, with the opacity of the frame and of the terminal each set in Appearance.' },
      { kind: 'new', text: 'This page, after every update, with what changed.' },
      { kind: 'new', text: 'While you talk to the voice agent, a soft light rises from the bottom of the terminal and follows the voice.' },
      { kind: 'improved', text: 'The window controls wait in a bar along the top edge, and the settings button there only shows while the sidebar is folded.' },
      { kind: 'improved', text: 'The session rail moves with springs, and the sidebar is restyled for the translucent frame.' },
      { kind: 'improved', text: 'The terminal’s corners follow the window’s, and text stays readable over a translucent window.' },
      { kind: 'improved', text: 'With no session open, Topito looks around for one, and the folder’s full path waits in a tooltip.' },
      { kind: 'fixed', text: 'Codex no longer shows as working for as long as it is open, and its title no longer changes with every turn of its spinner.' },
      { kind: 'fixed', text: 'In Codex on Windows, Shift+Enter starts a new line and Alt+Up and Alt+Down reach it.' },
      { kind: 'fixed', text: 'Dimmed and italic text, like the box Codex opens with, no longer sits on dark patches over a translucent window.' },
      { kind: 'fixed', text: 'A preview opened in one session only shows beside that session, and stays loaded while you look at another.' },
      { kind: 'fixed', text: 'Text selected in OpenCode stays selected when the mouse moves, so Ctrl+C and Ctrl+Shift+C copy it.' },
      { kind: 'fixed', text: 'Text drawn with WebGL no longer blinks while a terminal resizes.' },
      { kind: 'fixed', text: 'The activity dot shows while idle without having to hover over it.' },
      { kind: 'fixed', text: 'The voice agent no longer drops the conversation with "Precondition check failed".' },
      { kind: 'fixed', text: 'The voice agent’s answers no longer come out choppy and cut into pieces.' },
      { kind: 'fixed', text: 'On a light translucent window, names and buttons no longer have an outline around them.' }
    ]
  }
]

/**
 * Orders versions like 0.1.0, 0.1.0-beta.9 and 0.1.0-beta.21: numbers compare as numbers, and a
 * pre-release comes before the release it leads up to.
 */
export function compareVersions(a: string, b: string): number {
  const split = (v: string): [number[], Array<string | number>] => {
    const [core, pre] = v.trim().replace(/^v/, '').split('-', 2)
    const nums = core.split('.').map((n) => Number(n) || 0)
    const tags = pre === undefined ? [] : pre.split('.').map((p) => (/^\d+$/.test(p) ? Number(p) : p))
    return [nums, tags]
  }
  const [an, at] = split(a)
  const [bn, bt] = split(b)
  for (let i = 0; i < Math.max(an.length, bn.length); i++) {
    const d = (an[i] ?? 0) - (bn[i] ?? 0)
    if (d) return Math.sign(d)
  }
  if (!at.length || !bt.length) return at.length === bt.length ? 0 : at.length ? -1 : 1
  for (let i = 0; i < Math.max(at.length, bt.length); i++) {
    const x = at[i]
    const y = bt[i]
    if (x === undefined) return -1
    if (y === undefined) return 1
    if (x === y) continue
    if (typeof x === 'number' && typeof y === 'number') return Math.sign(x - y)
    if (typeof x === 'number') return -1
    if (typeof y === 'number') return 1
    return x < y ? -1 : 1
  }
  return 0
}

/**
 * The entries someone has not been shown: those after the version they last saw, up to the one
 * running. Someone who has never seen any (they updated from before this page existed) gets the
 * running version's alone rather than the whole history.
 */
export function unseenChanges(changelog: ChangelogEntry[], seen: string | undefined, current: string): ChangelogEntry[] {
  const upToCurrent = changelog.filter((e) => compareVersions(e.version, current) <= 0)
  if (seen === undefined) return upToCurrent.filter((e) => compareVersions(e.version, current) === 0)
  return upToCurrent.filter((e) => compareVersions(e.version, seen) > 0)
}
