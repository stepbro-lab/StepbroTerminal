import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { knownKeys, translate } from './i18n'
import { SHORTCUTS, SHORTCUT_GROUPS, validateChord } from './keybindings'

function keysInCode(): Map<string, string> {
  const root = path.resolve(__dirname, '..')
  const keys = new Map<string, string>()
  const walk = (dir: string): void => {
    for (const name of fs.readdirSync(dir)) {
      const p = path.join(dir, name)
      if (fs.statSync(p).isDirectory()) walk(p)
      else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) && name !== 'i18n.ts') {
        const src = fs.readFileSync(p, 'utf8')
        for (const call of src.matchAll(/\bt\(((?:[^()]|\([^()]*\))*)\)/g)) {
          for (const lit of call[1].matchAll(/(===|!==)?\s*'((?:[^'\\]|\\.)*)'/g)) {
            if (lit[1]) continue
            const key = lit[2].replace(/\\'/g, "'")
            if (/[A-Za-z]{2}/.test(key)) keys.set(key, path.relative(root, p))
          }
        }
      }
    }
  }
  walk(path.join(root, 'renderer', 'src'))
  walk(path.join(root, 'main'))
  return keys
}

function bareProseInJsx(): string[] {
  const root = path.resolve(__dirname, '..', 'renderer', 'src')
  const found: string[] = []
  const walk = (dir: string): void => {
    for (const name of fs.readdirSync(dir)) {
      const p = path.join(dir, name)
      if (fs.statSync(p).isDirectory()) walk(p)
      else if (name.endsWith('.tsx')) {
        const lines = fs.readFileSync(p, 'utf8').split('\n')
        lines.forEach((line, i) => {
          const s = line.trim()
          if (s.startsWith('//') || s.startsWith('*') || s.startsWith('/*') || s.startsWith('{/*') || s.startsWith('import ')) return
          if (/^[A-Z][a-z]+(?: [a-z][a-z',.]*){2,}[.!?]?$/.test(s) || /^<\w[^>]*>[A-Z][a-z]+(?: [a-z][a-z',.]*){2,}/.test(s)) found.push(`${path.relative(root, p)}:${i + 1}  ${s.slice(0, 60)}`)
        })
      }
    }
  }
  walk(root)
  return found
}

describe('translations', () => {
  it('has no prose written straight into the markup', () => {
    expect(bareProseInJsx()).toEqual([])
  })

  it('substitutes placeholders and falls back to English', () => {
    expect(translate('es', 'New shell')).toBe('Nueva shell')
    expect(translate('es', '{n} working', { n: 3 })).toBe('3 trabajando')
    expect(translate('en', '{n} working', { n: 3 })).toBe('3 working')
    expect(translate('es', 'Some brand new string')).toBe('Some brand new string')
  })

  it('has Spanish for every string the app shows', () => {
    const es = knownKeys('es')
    const missing: string[] = []
    for (const [key, file] of keysInCode()) if (!es.has(key)) missing.push(`${key}  (${file})`)
    for (const s of SHORTCUTS) if (!es.has(s.label)) missing.push(`${s.label}  (shortcut label)`)
    for (const g of SHORTCUT_GROUPS) if (!es.has(g)) missing.push(`${g}  (shortcut group)`)
    for (const chord of ['T', 'Mod+V']) for (const mac of [false, true]) {
      const problem = validateChord(chord, mac)
      if (problem && !es.has(problem)) missing.push(`${problem}  (validateChord)`)
    }
    expect(missing).toEqual([])
  })
})
