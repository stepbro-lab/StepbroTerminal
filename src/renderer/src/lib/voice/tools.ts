import type { FunctionDeclaration } from './protocol'

/**
 * What the voice can do inside the terminal. Everything it knows about the app arrives through
 * VoiceApp, and everything it does goes back out the same way, so the whole set can be exercised
 * without a window, a socket or a microphone.
 *
 * The one rule the shape enforces: writing a prompt and sending it are two different tools. The
 * voice may write into a session whenever it likes, and the words sit there for the person to
 * read; only a plain request to send them presses Enter.
 */

export interface VoiceSession {
  id: string
  title: string
  /** The agent running in it, or 'shell'. */
  agent: string
  folder: string
  status: string
  active: boolean
}

export interface VoiceFolder {
  path: string
  name: string
}

export interface VoiceAgent {
  id: string
  name: string
}

export interface VoiceApp {
  sessions(): VoiceSession[]
  /** The folders in the sidebar, and the agents installed on this machine. */
  folders(): VoiceFolder[]
  agents(): VoiceAgent[]
  /** The visible screen of a session, as text. */
  screen(id: string): string
  /** Puts text on the session's input line, without submitting it. */
  type(id: string, text: string): void
  /** Submits whatever is on the input line. */
  enter(id: string): void
  focus(id: string): void
  /** Opens a terminal in a folder, running a shell or an agent. */
  open(folderPath: string, presetId: string): Promise<string | null>
  /** Opens a shell beside the pane in front. */
  split(dir: 'row' | 'column'): Promise<void>
}

export const VOICE_FUNCTIONS: FunctionDeclaration[] = [
  {
    name: 'list_sessions',
    description: 'The terminals open right now: which agent runs in each, in which folder, and what it is doing. Call this before asking the person which session they mean.',
    parameters: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'read_screen',
    description: 'What is on the screen of a session right now, as text. Use it to see an error or what an agent just answered, instead of asking the person to read it out.',
    parameters: {
      type: 'object',
      properties: { session: { type: 'string', description: 'Session id, title or agent name. The one in front when left out.' } },
      required: []
    }
  },
  {
    name: 'write_prompt',
    description:
      'Writes a prompt on the input line of a session and leaves it there for the person to read and send. This is the main thing you do: turn what they said into a clear, complete prompt for a coding agent. It is not sent.',
    parameters: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'The prompt, written out in full: what to do, what done looks like, which files, and what not to touch.' },
        session: { type: 'string', description: 'Session id, title or agent name. The one in front when left out.' }
      },
      required: ['text']
    }
  },
  {
    name: 'send_prompt',
    description: 'Presses Enter on a session, sending what is written there. Only ever call this when the person asks for it in so many words.',
    parameters: {
      type: 'object',
      properties: { session: { type: 'string', description: 'Session id, title or agent name. The one in front when left out.' } },
      required: []
    }
  },
  {
    name: 'focus_session',
    description: 'Brings a session to the front, so the person can see it.',
    parameters: {
      type: 'object',
      properties: { session: { type: 'string', description: 'Session id, title or agent name.' } },
      required: ['session']
    }
  },
  {
    name: 'list_folders',
    description: 'The folders in the sidebar and the agents installed on this machine. Call this before opening a terminal, so you use names that exist.',
    parameters: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'open_session',
    description:
      'Opens a terminal in a folder and brings it to the front: a plain shell, or one of the installed agents. Use it when the person asks for a new terminal, or wants to work on something in another folder.',
    parameters: {
      type: 'object',
      properties: {
        folder: { type: 'string', description: 'Folder name or path. The folder of the session in front when left out.' },
        agent: { type: 'string', description: 'What runs in it: shell, or an agent name such as claude or codex. A shell when left out.' }
      },
      required: []
    }
  },
  {
    name: 'split_pane',
    description: 'Opens a shell beside the pane in front, so two terminals sit side by side or one above the other.',
    parameters: {
      type: 'object',
      properties: { direction: { type: 'string', description: 'right or down. right when left out.' } },
      required: []
    }
  }
]

/**
 * Which session a spoken reference means: the one named outright, else one whose title or agent
 * the person said part of, else whichever is in front. Matching is loose because this arrives
 * from speech, where nobody says an id.
 */
export function resolveSession(sessions: VoiceSession[], ref?: unknown): VoiceSession | null {
  const active = sessions.find((s) => s.active) ?? sessions[0] ?? null
  const text = typeof ref === 'string' ? ref.trim().toLowerCase() : ''
  if (!text) return active
  const byId = sessions.find((s) => s.id.toLowerCase() === text)
  if (byId) return byId
  const byTitle = sessions.find((s) => s.title.toLowerCase() === text)
  if (byTitle) return byTitle
  const byAgent = sessions.find((s) => s.agent.toLowerCase() === text)
  if (byAgent) return byAgent
  const loose = sessions.find((s) => s.title.toLowerCase().includes(text) || s.folder.toLowerCase().includes(text) || text.includes(s.agent.toLowerCase()))
  return loose ?? active
}

/** The folder a spoken reference means: matched by name or path, else the one to fall back on. */
export function resolveFolder(folders: VoiceFolder[], ref: unknown, fallback?: string): VoiceFolder | null {
  const text = typeof ref === 'string' ? ref.trim().toLowerCase() : ''
  const back = folders.find((f) => f.path === fallback) ?? folders[0] ?? null
  if (!text) return back
  const exact = folders.find((f) => f.name.toLowerCase() === text || f.path.toLowerCase() === text)
  if (exact) return exact
  const loose = folders.find((f) => f.name.toLowerCase().includes(text) || text.includes(f.name.toLowerCase()) || f.path.toLowerCase().includes(text))
  return loose ?? back
}

/** Which agent was asked for, by id or by name; a plain shell when nothing matches. */
export function resolveAgent(agents: VoiceAgent[], ref: unknown): VoiceAgent | null {
  const text = typeof ref === 'string' ? ref.trim().toLowerCase() : ''
  const shell = agents.find((a) => a.id === 'shell') ?? null
  if (!text) return shell
  const exact = agents.find((a) => a.id.toLowerCase() === text || a.name.toLowerCase() === text)
  if (exact) return exact
  const loose = agents.find((a) => text.includes(a.id.toLowerCase()) || a.name.toLowerCase().includes(text))
  return loose ?? shell
}

/**
 * A prompt is one line typed at a prompt, so anything that would submit it early, or drive the
 * program instead of feeding it, comes out: carriage returns, newlines and the rest of the
 * control range. Without this, a prompt with a line break in it sends half of itself.
 */
export function oneLine(text: string): string {
  return text
    .replace(/\p{Cc}+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export interface ToolOutcome {
  output: unknown
  /** What the bubble shows the person happened, in their language, or nothing worth showing. */
  did?: { kind: 'wrote' | 'sent' | 'read' | 'focused' | 'opened' | 'split'; session: string; text?: string }
}

/** Runs one call from the model and gives back what it should hear, plus what the app did. */
export async function runTool(app: VoiceApp, name: string, args: Record<string, unknown>): Promise<ToolOutcome> {
  const sessions = app.sessions()
  if (name === 'list_sessions') {
    return {
      output: sessions.length
        ? sessions.map((s) => ({ id: s.id, title: s.title, agent: s.agent, folder: s.folder, status: s.status, in_front: s.active }))
        : 'No sessions are open.'
    }
  }
  if (name === 'list_folders') {
    return { output: { folders: app.folders().map((f) => f.name), agents: app.agents().map((a) => a.name) } }
  }
  if (name === 'open_session') {
    const here = sessions.find((s) => s.active)
    const folders = app.folders()
    const folder = resolveFolder(folders, args.folder, folders.find((f) => f.name === here?.folder)?.path)
    if (!folder) return { output: 'There are no folders in the sidebar yet. Ask the person to add one.' }
    const agent = resolveAgent(app.agents(), args.agent)
    const id = await app.open(folder.path, agent?.id ?? 'shell')
    if (!id) return { output: `${agent?.name ?? 'The shell'} would not start in ${folder.name}.` }
    const what = `${agent?.name ?? 'Shell'} in ${folder.name}`
    return { output: `Open: ${what}. It is in front now.`, did: { kind: 'opened', session: what } }
  }
  if (name === 'split_pane') {
    const down = String(args.direction ?? '').toLowerCase().startsWith('d')
    await app.split(down ? 'column' : 'row')
    return { output: down ? 'A shell opened below.' : 'A shell opened to the right.', did: { kind: 'split', session: down ? 'down' : 'right' } }
  }

  const target = resolveSession(sessions, args.session)
  if (!target) return { output: 'No sessions are open, so there is nowhere to write. Ask the person to open one.' }

  switch (name) {
    case 'read_screen': {
      const screen = app.screen(target.id).trim()
      return {
        output: { session: target.title, agent: target.agent, screen: screen || 'The screen is empty.' },
        did: { kind: 'read', session: target.title }
      }
    }
    case 'write_prompt': {
      const text = oneLine(String(args.text ?? ''))
      if (!text) return { output: 'There was no prompt to write.' }
      app.focus(target.id)
      app.type(target.id, text)
      return {
        output: `Written on ${target.title}, waiting for the person to send it.`,
        did: { kind: 'wrote', session: target.title, text }
      }
    }
    case 'send_prompt': {
      app.enter(target.id)
      return { output: `Sent to ${target.title}.`, did: { kind: 'sent', session: target.title } }
    }
    case 'focus_session': {
      app.focus(target.id)
      return { output: `${target.title} is in front now.`, did: { kind: 'focused', session: target.title } }
    }
    default:
      return { output: `There is no tool called ${name}.` }
  }
}

/**
 * How the voice should behave. Short answers, because this is speech; the work is turning talk
 * into a prompt worth sending; and nothing is ever sent on its own.
 */
export const VOICE_INSTRUCTIONS = `You are the voice of stepbro terminal, where several coding agents work side by side, each in its own folder.

Your job is to turn what the person says into a prompt worth sending to one of those agents. They think out loud, in half sentences, and you write what they meant.

How to behave:
- Speak the language they speak, and keep it short. Two sentences, rarely more. This is speech, not a document.
- They hold a key while they talk, so a silence is them thinking, not them finishing. Wait. Filler like "eh", "este", "o sea", "a ver" is thinking out loud: leave it out of the prompt rather than writing it down.
- Write their language properly: in Spanish that means the accents and the ñ, and the opening ¿ and ¡. A prompt full of misspellings reads as careless to whoever gets it.
- Take what they meant, not what they said. Half sentences, corrections and "no espera, mejor..." all end up as one clear instruction.
- Find out what is going on yourself. Call list_sessions, list_folders and read_screen before asking them to repeat something you could have looked at.
- You can open terminals for them: open_session starts a shell or an agent in any folder, and split_pane puts one beside what is already there. Do it when they ask for a terminal, and say in a few words what you opened.
- When they describe work to be done, call write_prompt with the whole thing written out: what to do, what done looks like, which files or folders, and what must not be touched. Then say in one short sentence which session you wrote it to. Do not read the prompt back to them.
- The prompt is left on the input line for them to read and send. Never call send_prompt unless they ask you to send it in so many words.
- Never write a prompt that tells an agent to delete files, reset or force-push, unless they say exactly that.
- If they are only asking you a question, just answer it. Not everything is a prompt.`
