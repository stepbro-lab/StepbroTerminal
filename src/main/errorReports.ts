import os from 'node:os'
import { app } from 'electron'
import * as Sentry from '@sentry/electron/main'
import { keepBreadcrumb, scrubEvent, type Person } from './errorScrub'

/** The stepbro terminal project on Sentry, where reports go. Empty, nothing is ever set up. */
export const SENTRY_DSN = ''

/**
 * The SDK's parts that only say what failed and where, by name. Anything else it brings, now or in
 * a later version, stays off: memory dumps, screenshots, local variables, console output and the
 * addresses the app talks to could all carry what the person was doing.
 */
const MAIN_PARTS = new Set([
  'ElectronBreadcrumbs',
  'ElectronContext',
  'ChildProcess',
  'OnUncaughtException',
  'PreloadInjection',
  'AdditionalContext',
  'GpuContext',
  'MainProcessSession',
  'EventFilters',
  'FunctionToString',
  'LinkedErrors',
  'OnUnhandledRejection',
  'ContextLines',
  'Context',
  'NormalizePaths'
])

let started = false

/** Whether reports can be sent at all from this build; the window learns it at launch. */
export function reportsErrors(): boolean {
  return started
}

/**
 * Starts error reporting, before the app is ready as the SDK needs. Nothing leaves the machine
 * unless `allowed()` says the person agreed, checked at the moment of sending, so turning it off in
 * Settings stops it at once; what is sent is cleaned first (errorScrub.ts). Builds run from source
 * report nothing, unless STEP_SENTRY_DSN points them somewhere to try it.
 */
export function startErrorReports(allowed: () => boolean): void {
  const dsn = process.env['STEP_SENTRY_DSN'] || (app.isPackaged ? SENTRY_DSN : '')
  if (!dsn) return
  const person: Person = { home: os.homedir(), user: os.userInfo().username, host: os.hostname() }
  Sentry.init({
    dsn,
    release: `stepbro-terminal@${app.getVersion()}`,
    environment: app.isPackaged ? 'production' : 'development',
    // Everything the SDK would collect about the person or their requests on its own, off.
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      graphQL: { document: false, variables: false },
      genAI: { inputs: false, outputs: false },
      databaseQueryData: false,
      queues: false,
      stackFrameVariables: false
    },
    integrations: (defaults) => defaults.filter((i) => MAIN_PARTS.has(i.name)),
    beforeSend: (event) => scrubEvent(event, person),
    beforeBreadcrumb: (b) => keepBreadcrumb(b, person),
    // Online only: a report kept on disk for later would go out even after the person said no.
    transport: (options): ReturnType<typeof Sentry.makeElectronTransport> => {
      const inner = Sentry.makeElectronTransport(options)
      return {
        send: (envelope) => (allowed() ? inner.send(envelope) : Promise.resolve({})),
        flush: (timeout) => inner.flush(timeout)
      }
    }
  })
  started = true
}

/** An error the session host caught and lived through, which the app would otherwise never hear of. */
export function reportHostFault(fault: { message: string; stack?: string }): void {
  if (!started) return
  const error = new Error(fault.message)
  error.name = 'HostError'
  if (fault.stack) error.stack = fault.stack
  Sentry.captureException(error, { tags: { process: 'host' } })
}

/** The session host would not start: nothing works without it. */
export function reportHostStartFailure(error: unknown): void {
  if (!started) return
  Sentry.captureException(error, { tags: { process: 'host', stage: 'start' } })
}
