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

export interface VoiceApp {
  sessions(): VoiceSession[]
  /** The visible screen of a session, as text. */
  screen(id: string): string
  /** Puts text on the session's input line, without submitting it. */
  type(id: string, text: string): void
  /** Submits whatever is on the input line. */
  enter(id: string): void
  focus(id: string): void
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
  did?: { kind: 'wrote' | 'sent' | 'read' | 'focused'; session: string; text?: string }
}

/** Runs one call from the model and gives back what it should hear, plus what the app did. */
export function runTool(app: VoiceApp, name: string, args: Record<string, unknown>): ToolOutcome {
  const sessions = app.sessions()
  if (name === 'list_sessions') {
    return {
      output: sessions.length
        ? sessions.map((s) => ({ id: s.id, title: s.title, agent: s.agent, folder: s.folder, status: s.status, in_front: s.active }))
        : 'No sessions are open.'
    }
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
- Find out what is going on yourself. Call list_sessions and read_screen before asking them to repeat something you could have looked at.
- When they describe work to be done, call write_prompt with the whole thing written out: what to do, what done looks like, which files or folders, and what must not be touched. Then say in one short sentence which session you wrote it to. Do not read the prompt back to them.
- The prompt is left on the input line for them to read and send. Never call send_prompt unless they ask you to send it in so many words.
- Never write a prompt that tells an agent to delete files, reset or force-push, unless they say exactly that.
- If they are only asking you a question, just answer it. Not everything is a prompt.`
