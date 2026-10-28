import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { EventMap, EventName, InvokeMap, SendMap } from '@shared/ipc'

type Invoke = <K extends keyof InvokeMap>(channel: K, ...args: Parameters<InvokeMap[K]>) => Promise<ReturnType<InvokeMap[K]>>
type Send = <K extends keyof SendMap>(channel: K, ...args: Parameters<SendMap[K]>) => void
type On = <K extends EventName>(channel: K, cb: EventMap[K]) => () => void

const invoke: Invoke = (channel, ...args) => ipcRenderer.invoke(channel, ...args)
const send: Send = (channel, ...args) => ipcRenderer.send(channel, ...args)
const on: On = (channel, cb) => {
  const handler = (_e: Electron.IpcRendererEvent, ...args: unknown[]): void => (cb as any)(...args)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.off(channel, handler)
}

const api = {
  platform: process.platform,
  osVersion: process.getSystemVersion(),
  version: process.env['STEP_VERSION'] ?? '0.0.0',
  /** This build sends error reports when the person agrees (see main/errorReports.ts). */
  reportsErrors: process.argv.includes('--step-error-reports'),
  invoke,
  send,
  on,
  /** Absolute path of a File dropped into the window. */
  pathForFile: (file: File): string => webUtils.getPathForFile(file)
}

export type StepApi = typeof api

contextBridge.exposeInMainWorld('step', api)
