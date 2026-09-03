import { contextBridge } from 'electron'

contextBridge.exposeInMainWorld('step', { version: '0.1.0' })
