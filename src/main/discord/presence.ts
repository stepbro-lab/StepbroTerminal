import type { LogoId, Session } from '@shared/types'
import { t } from '../i18n'
import { connectDiscord, type DiscordLink } from './ipc'

/** The "stepbro terminal" application on Discord's developer portal; its name is what profiles show. */
export const DISCORD_APP_ID = '1565029231925264516'
const DOWNLOAD_URL = 'https://github.com/kevin9038440334/StepbroTerminal-releases'
/** Discord takes five activity updates every 20 seconds from an app; one every 5 s stays under that. */
const MIN_GAP_MS = 5000
/** How often to look for Discord again while it is closed. */
const RETRY_MS = 30_000

/**
 * What a profile shows while stepbro terminal is open: which agents are running and how many are at
 * work, never a folder, a session's name or anything written in it. The picture is the logo the
 * person chose in Settings, uploaded to the application as "dock-light" and "dock-dark".
 */
export function activityFor(sessions: Session[], agentName: (s: Session) => string | null, startedAt: number, logo: LogoId = 'light'): Record<string, unknown> {
  const live = sessions.filter((s) => s.alive && !s.archived)
  const agents: string[] = []
  let working = 0
  for (const s of live) {
    const name = agentName(s)
    if (!name) continue
    if (!agents.includes(name)) agents.push(name)
    if (s.status === 'working') working++
  }
  const details =
    agents.length === 0
      ? t('In the terminal')
      : agents.length === 1
        ? t('Coding with {agent}', { agent: agents[0] })
        : agents.length === 2
          ? t('Coding with {agent} and {other}', { agent: agents[0], other: agents[1] })
          : t('Coding with {n} agents', { n: agents.length })
  const state =
    working === 1
      ? t('1 agent working')
      : working > 1
        ? t('{n} agents working', { n: working })
        : live.length === 1
          ? t('1 session open')
          : live.length > 1
            ? t('{n} sessions open', { n: live.length })
            : undefined
  return {
    details,
    ...(state ? { state } : {}),
    timestamps: { start: startedAt },
    assets: { large_image: logo === 'dark' ? 'dock-dark' : 'dock-light', large_text: 'stepbro terminal' },
    buttons: [{ label: t('Get stepbro terminal'), url: DOWNLOAD_URL }]
  }
}

export interface PresenceDeps {
  enabled: () => boolean
  sessions: () => Session[]
  logo?: () => LogoId | undefined
  agentName: (s: Session) => string | null
  log: (...parts: unknown[]) => void
  clientId?: string
  connect?: (clientId: string) => Promise<DiscordLink>
}

/**
 * Keeps the Discord profile of whoever runs stepbro terminal saying so, while Discord is open and
 * Settings allow it. Discord being closed is normal: it is looked for again every so often, and the
 * activity is sent once it is there. Updates only go out when the words change, no faster than
 * Discord takes them.
 */
export class DiscordPresence {
  private link: DiscordLink | null = null
  private connecting = false
  private sent = ''
  private sentAt = 0
  private timer: ReturnType<typeof setTimeout> | null = null
  private retry: ReturnType<typeof setTimeout> | null = null
  private readonly startedAt = Date.now()
  private readonly clientId: string
  private stopped = false

  constructor(private readonly deps: PresenceDeps) {
    this.clientId = deps.clientId ?? DISCORD_APP_ID
  }

  /** Called whenever the sessions, the language or the setting may have changed. */
  update(): void {
    if (this.stopped) return
    if (!this.clientId || !this.deps.enabled()) {
      this.disconnect()
      return
    }
    if (!this.link) {
      void this.open()
      return
    }
    const activity = JSON.stringify(this.activity())
    if (activity === this.sent || this.timer) return
    const wait = Math.max(0, this.sentAt + MIN_GAP_MS - Date.now())
    this.timer = setTimeout(() => {
      this.timer = null
      this.send()
    }, wait)
  }

  /** On quit: the profile stops saying so at once. */
  stop(): void {
    this.stopped = true
    if (this.retry) clearTimeout(this.retry)
    this.retry = null
    this.disconnect()
  }

  private activity(): Record<string, unknown> {
    return activityFor(this.deps.sessions(), this.deps.agentName, this.startedAt, this.deps.logo?.())
  }

  private send(): void {
    if (!this.link) return
    const activity = this.activity()
    const json = JSON.stringify(activity)
    if (json === this.sent) return
    this.link.setActivity(activity)
    this.sent = json
    this.sentAt = Date.now()
  }

  private async open(): Promise<void> {
    if (this.connecting || this.retry) return
    this.connecting = true
    try {
      const link = await (this.deps.connect ?? connectDiscord)(this.clientId)
      if (this.stopped || !this.deps.enabled()) {
        link.close()
        return
      }
      this.link = link
      this.sent = ''
      link.onClose((reason) => {
        if (this.link !== link) return
        this.deps.log('discord presence: link closed,', reason)
        this.link = null
        this.later()
      })
      link.onError((message) => this.deps.log('discord presence: Discord turned the activity down,', message))
      this.deps.log('discord presence: connected')
      this.send()
    } catch {
      this.later()
    } finally {
      this.connecting = false
    }
  }

  private later(): void {
    if (this.stopped || this.retry) return
    this.retry = setTimeout(() => {
      this.retry = null
      this.update()
    }, RETRY_MS)
  }

  private disconnect(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    const link = this.link
    this.link = null
    this.sent = ''
    link?.close()
  }
}
