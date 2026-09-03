import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles/global.css'
import { useUi } from './stores/ui'
import { useData } from './stores/data'
import { usePrefs } from './stores/prefs'
import { registry } from './terminal/TerminalRegistry'
import { useUpdates } from '@/stores/updates'
import { useNotes } from '@/stores/notes'
import * as actions from '@/lib/actions'
import { useHandoff } from '@/stores/handoff'

if (import.meta.env.DEV) {
  // Handy for poking at state from DevTools while developing.
  ;(window as any).__step = { useUi, useData, usePrefs, useUpdates, useNotes, useHandoff, registry, actions }
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
