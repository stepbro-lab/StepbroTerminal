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
    version: '0.1.0-beta.28',
    date: '2026-10-01',
    headline: 'Agents keep their screen whole while you resize, and look like what they are doing.',
    changes: [
      { kind: 'fixed', text: 'On Ubuntu 23.10 and later, 24.04 included, the .deb starts again with Chromium\'s sandbox on: it installs into /opt/stepbro-terminal, without the space that kept the sandbox from starting the app, brings the AppArmor profile those releases ask for, and its icon shows in the launcher.' },
      { kind: 'fixed', text: 'Dragging the edge of the preview, of a split or of the sidebar, or resizing the window, no longer leaves an agent\'s screen in pieces: the terminals keep their columns while the edge moves, however long you drag, and the agent redraws once, when you let go.' },
      { kind: 'fixed', text: 'An agent that has just opened, or come back after an update, no longer shows as working until you write to it: once it is on screen and waiting, its row stops spinning.' },
      { kind: 'fixed', text: 'Opening a menu in Claude Code yourself, such as /model or /config, no longer has stepbro and Topito say it needs you. A permission it asks for, or a question, still does.' }
    ]
  },
  {
    version: '0.1.0-beta.27',
    date: '2026-10-01',
    headline: 'Settings that read at a glance, with Topito up front.',
    changes: [
      { kind: 'improved', text: 'Settings put the options of each section together on one surface, the way System Settings does, with shorter explanations. Appearance opens with Topito, easy to find and to wake up, and gathers mode, app color and language under Theme.' }
    ]
  },
  {
    version: '0.1.0-beta.26',
    date: '2026-10-01',
    headline: 'Your agents a click away in every folder, text copied as you select it, and agents that set up your workspaces.',
    changes: [
      { kind: 'new', text: 'Point at the "+" of a folder and it opens out into a button for each agent you have installed and one for a shell, each starting in that folder with one click. The "+" itself opens the full menu: a shell, every agent, resuming a Claude Code conversation, splitting.' },
      { kind: 'new', text: 'Text you select in a terminal goes straight to the clipboard, ready to paste: drag over it, double-click a word or triple-click a line. A plain click and the right button leave the clipboard as it was. Settings, under Terminal, can turn it off.' },
      { kind: 'new', text: 'Agents can look after your workspaces: ask any agent in stepbro to list, create, change, delete or open one, and Settings shows the change at once. Folders and programs are checked first, so a workspace never points at a folder that is not there or an agent that is not installed.' },
      { kind: 'new', text: 'With the sidebar folded away, bring the pointer to the left edge of the window and it opens in its place for a look, making room for itself instead of covering the terminal; it folds away again once the pointer leaves it, on a click elsewhere or on Escape. The sidebar shortcut keeps it open, and Settings, under Appearance, can turn it off.' },
      { kind: 'improved', text: 'The buttons at the foot of the sidebar are drawn with more care: one weight for both icons, a fine rim on the translucent window, their shortcut in the tooltip and a ring when the keyboard reaches them.' }
    ]
  },
  {
    version: '0.1.0-beta.25',
    date: '2026-10-01',
    headline: 'Claude picks up where it was, splitting from any terminal, every archived session in one place, and a preview agents work faster.',
    changes: [
      { kind: 'new', text: 'A page for archived sessions in Settings: every session you put away, from every folder, newest first, with a search, a Restore button that brings it back where it left off, and a way to delete one or all of them.' },
      { kind: 'fixed', text: 'Resuming a Claude Code session after closing and opening the app picks up the conversation it was in, instead of opening an empty Claude that needed a /resume: stepbro follows the conversation Claude is writing, a /resume inside Claude included, and one that had lost track resumes the conversation last written in its folder.' },
      { kind: 'improved', text: 'Split right and Split down are in the right-click menu of every terminal, a lone one included, with their shortcuts beside them; so are the shortcuts for Find and Redraw.' },
      { kind: 'improved', text: 'Agents work the preview faster and understand it in fewer steps: the page comes back as an outline in reading order, with its text and a short ref (e12) for every link, button and field, and a click or typing returns the page as it is afterwards, so the agent sees what happened without looking again.' },
      { kind: 'improved', text: 'The agent\'s cursor in the preview moves quicker and still smoothly: clicks take about half the time, scrolling waits only as long as the page moves, and typing is faster.' },
      { kind: 'new', text: 'The preview (and the changes panel) can be made wider or narrower: drag the edge between it and the terminals. The width is kept.' },
      { kind: 'fixed', text: '"Claude Code is using this page" goes away once the agent stops using the browser, a few seconds after its last move on the page or as soon as its turn ends, instead of staying for the whole turn.' }
    ]
  },
  {
    version: '0.1.0-beta.24',
    date: '2026-09-28',
    headline: 'A calmer window with a bell for your agents, Codex that resumes its conversation, and on Windows the app stays in the tray.',
    changes: [
      { kind: 'fixed', text: 'Restarting a Codex session picks its conversation back up, the way Claude Code does, instead of starting a new one: stepbro notes which conversation Codex wrote as each turn ends. A session that was never sent a prompt starts fresh, and two sessions never share one conversation.' },
      { kind: 'fixed', text: 'stepbro opened from one of its own terminals no longer greets you with "recursion limit exceeded" from zsh, and your own .zshrc loads in it again.' },
      { kind: 'improved', text: 'A new folder icon in the sidebar: soft back, solid front, and a front that leans forward when the project is open. No more dark line across it.' },
      { kind: 'improved', text: 'The dot at the top right is a bell now: a spinner while agents work, a blue dot on it when something finished that you have not seen, amber when a session needs you. Clicking it lists what needs you, what is working and what finished.' },
      { kind: 'improved', text: 'The Notes button only shows once there is a note. The shortcut still opens them, and the first note brings the button out.' },
      { kind: 'improved', text: 'The voice agent is gone: the talk button and keys, reading aloud, the glow and the Voice page in Settings. A Gemini key saved for it is deleted from this machine.' },
      { kind: 'improved', text: 'Cleaner chrome: no project name and branch in the middle of the top bar, and no branch beside the project in the sidebar.' },
      { kind: 'fixed', text: 'A pane split from a shell opens in the folder that shell is in now, not the project\'s: after a cd into a subfolder, the new pane starts there too, and stays under the same project. Every shell says where it is at each prompt, PowerShell with oh-my-posh included.' },
      { kind: 'new', text: 'On Windows, closing the window no longer quits the app: it stays in the tray and keeps telling you when a session finishes or needs you. Open it again from the tray icon, and quit it from there; in Settings, under Advanced, closing can quit it as before.' }
    ]
  },
  {
    version: '0.1.0-beta.23',
    date: '2026-09-26',
    headline: 'Sessions name themselves after what you ask, show their branch, and come back without an invalid session id.',
    changes: [
      { kind: 'fixed', text: 'An agent opened straight from its button, like Clyra, no longer lays its screen out in slivers, a word broken over several rows: what it asks the terminal as it starts is answered.' },
      { kind: 'new', text: 'The branch a project has checked out shows beside its name in the sidebar and in the middle of the top bar, and follows a switch within seconds; a worktree and a detached checkout have marks of their own.' },
      { kind: 'improved', text: 'Sessions name themselves after their first prompt: not a slash command, not a menu answer, not the command that started the agent, and a new conversation (/clear, /new, /resume) names them again. A name you give one stays.' },
      { kind: 'fixed', text: 'Restarting a Claude Code session no longer fails with "No conversation found with session ID" or "Session ID is already in use": it picks the conversation back up when Claude saved one, and starts a new one when no prompt was ever sent.' },
      { kind: 'fixed', text: 'A Codex session keeps its name while Codex waits on you, instead of turning into ". ] Action Required"; a session that already had, and one named after the command that launched its agent, are named again by their next prompt.' },
      { kind: 'fixed', text: 'A terminal opened while the window was behind another is drawn from the start, instead of staying blank until the window is clicked.' },
      { kind: 'fixed', text: 'A key typed right after Escape is no longer lost from the prompt a session remembers.' },
      { kind: 'improved', text: 'The Mac installer opens on a window of its own, with the app on one side, Applications on the other and an arrow between them.' }
    ]
  },
  {
    version: '0.1.0-beta.22',
    date: '2026-09-22',
    headline: 'Agents come back whole after an update, their buttons answer a click, and the app rests while you look elsewhere.',
    changes: [
      { kind: 'new', text: 'The bar at the top edge can be kept open: in Settings, under Appearance, it can be told not to tuck itself away.' },
      { kind: 'improved', text: 'Much less energy while an agent works and the window is behind another or minimised: nothing is drawn where nobody can see it, and the spinners slow down or stop.' },
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
