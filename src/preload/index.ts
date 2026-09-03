import { contextBridge, ipcRenderer } from 'electron'
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
  version: process.env['STEP_VERSION'] ?? '0.0.0',
  invoke,
  send,
  on
}

export type StepApi = typeof api

contextBridge.exposeInMainWorld('step', api)
