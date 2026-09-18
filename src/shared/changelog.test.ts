import { describe, expect, it } from 'vitest'
import { CHANGELOG, compareVersions, unseenChanges, type ChangelogEntry } from './changelog'
import { es } from './i18n.es'

describe('compareVersions', () => {
  it('compares each number as a number', () => {
    expect(compareVersions('0.1.0-beta.21', '0.1.0-beta.9')).toBe(1)
    expect(compareVersions('0.2.0', '0.10.0')).toBe(-1)
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0)
  })

  it('puts a pre-release before the release it leads to', () => {
    expect(compareVersions('0.1.0-beta.21', '0.1.0')).toBe(-1)
    expect(compareVersions('0.1.0', '0.1.0-beta.21')).toBe(1)
    expect(compareVersions('0.1.0-alpha.3', '0.1.0-beta.1')).toBe(-1)
  })
})

describe('unseenChanges', () => {
  const log: ChangelogEntry[] = ['0.1.0-beta.23', '0.1.0-beta.22', '0.1.0-beta.21'].map((version) => ({ version, date: '2026-09-17', headline: version, changes: [] }))
  const versions = (entries: ChangelogEntry[]): string[] => entries.map((e) => e.version)

  it('gives everything after the version last seen, up to the one running', () => {
    expect(versions(unseenChanges(log, '0.1.0-beta.21', '0.1.0-beta.23'))).toEqual(['0.1.0-beta.23', '0.1.0-beta.22'])
    expect(versions(unseenChanges(log, '0.1.0-beta.21', '0.1.0-beta.22'))).toEqual(['0.1.0-beta.22'])
  })

  it('gives nothing once the running version has been seen', () => {
    expect(unseenChanges(log, '0.1.0-beta.23', '0.1.0-beta.23')).toEqual([])
  })

  it('gives only the running version to someone who never saw the page', () => {
    expect(versions(unseenChanges(log, undefined, '0.1.0-beta.22'))).toEqual(['0.1.0-beta.22'])
    expect(unseenChanges(log, undefined, '0.1.0-beta.20')).toEqual([])
  })
})

describe('CHANGELOG', () => {
  it('runs newest first with one entry per version', () => {
    for (let i = 1; i < CHANGELOG.length; i++) expect(compareVersions(CHANGELOG[i - 1].version, CHANGELOG[i].version)).toBe(1)
  })

  it('has every line in Spanish too', () => {
    for (const entry of CHANGELOG) {
      expect(es[entry.headline], entry.headline).toBeDefined()
      for (const change of entry.changes) expect(es[change.text], change.text).toBeDefined()
    }
  })
})
