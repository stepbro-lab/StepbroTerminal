import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles/global.css'
import { useUi } from './stores/ui'
import { useData } from './stores/data'
import { usePrefs } from './stores/prefs'
import { registry } from './terminal/TerminalRegistry'
import { useUpdates } from '@/stores/updates'

if (import.meta.env.DEV) {
  // Handy for poking at state from DevTools while developing.
  ;(window as any).__step = { useUi, useData, usePrefs, useUpdates, registry }
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
