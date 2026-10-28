import type { EventMap, EventName, InvokeMap, SendMap } from '@shared/ipc'

declare global {
  interface Window {
    step: {
      platform: NodeJS.Platform
      osVersion: string
      version: string
      /** This build sends error reports when the person agrees. */
      reportsErrors: boolean
      invoke: <K extends keyof InvokeMap>(channel: K, ...args: Parameters<InvokeMap[K]>) => Promise<ReturnType<InvokeMap[K]>>
      send: <K extends keyof SendMap>(channel: K, ...args: Parameters<SendMap[K]>) => void
      on: <K extends EventName>(channel: K, cb: EventMap[K]) => () => void
      pathForFile: (file: File) => string
    }
  }
}

export {}
