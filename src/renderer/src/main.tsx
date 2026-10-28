import React from 'react'
import { createRoot } from 'react-dom/client'
import { init as startErrorReports } from '@sentry/electron/renderer'
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

/**
 * The window's errors go to the app, which cleans them and sends them only if the person agreed
 * (main/errorReports.ts). Only the parts that say what failed and where: no clicks, console output
 * or page addresses.
 */
const WINDOW_PARTS = new Set(['EventFilters', 'FunctionToString', 'BrowserApiErrors', 'GlobalHandlers', 'LinkedErrors', 'Dedupe', 'ScopeToMain'])
if (window.step.reportsErrors) startErrorReports({ integrations: (defaults) => defaults.filter((i) => WINDOW_PARTS.has(i.name)) })

if (import.meta.env.DEV) {
  // Handy for poking at state from DevTools while developing.
  ;(window as any).__step = { useUi, useData, usePrefs, useUpdates, useNotes, useHandoff, registry, actions }
}

/** The whole tree remounts when the language changes, so every string is read again. */
function Root() {
  const language = usePrefs((s) => s.prefs?.language) ?? 'en'
  return <App key={language} />
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
)
