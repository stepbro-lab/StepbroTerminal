import { describe, expect, it } from 'vitest'
import { keepBreadcrumb, scrubEvent, scrubText, type Person } from './errorScrub'

const mac: Person = { home: '/Users/kevinkevin', user: 'kevinkevin', host: 'MacBook-Air-de-Kevin' }
const win: Person = { home: 'C:\\Users\\Ana Lopez', user: 'Ana Lopez', host: 'DESKTOP-ANA' }

describe('an error report leaving the machine', () => {
  it('keeps only the file name of a path in the home folder', () => {
    expect(scrubText("ENOENT: no such file or directory, open '/Users/kevinkevin/Desktop/SecretProject/src/a.ts'", mac)).toBe(
      "ENOENT: no such file or directory, open '~/…/a.ts'"
    )
    expect(scrubText('at /Users/kevinkevin/work/x.js:12:5', mac)).toBe('at ~/…/x.js:12:5')
    expect(scrubText('cwd is /Users/kevinkevin', mac)).toBe('cwd is ~')
  })

  it('does the same with Windows paths, either slash, and in file URLs', () => {
    expect(scrubText('open C:\\Users\\Ana Lopez\\Documents\\Cliente\\plan.md failed', win)).toBe('open ~/…/plan.md failed')
    expect(scrubText('file:///C:/Users/Ana%20Lopez/app/x.js', win)).toBe('file:///~/…/x.js')
  })

  it("names neither the person nor their computer", () => {
    expect(scrubText('spawn failed for kevinkevin on MacBook-Air-de-Kevin', mac)).toBe('spawn failed for user on host')
    expect(scrubText('the user kevinkevin2 is someone else', mac)).toBe('the user kevinkevin2 is someone else')
  })

  it("leaves the app's own files alone", () => {
    expect(scrubText('at app:///out/main/index.js:40:3', mac)).toBe('at app:///out/main/index.js:40:3')
  })

  it('cleans every string in a report and drops what names the machine', () => {
    const event = {
      server_name: 'MacBook-Air-de-Kevin',
      user: { ip_address: '1.2.3.4' },
      request: { url: 'file:///x' },
      contexts: { device: { name: 'MacBook-Air-de-Kevin', arch: 'arm64' }, os: { name: 'macOS' } },
      exception: { values: [{ type: 'Error', value: 'bad /Users/kevinkevin/p/q.ts', stacktrace: { frames: [{ filename: '/Users/kevinkevin/p/q.ts', lineno: 3 }] } }] },
      breadcrumbs: [{ category: 'electron', message: 'app.ready' }]
    }
    const out = scrubEvent(event, mac) as any
    expect(out.server_name).toBeUndefined()
    expect(out.user).toBeUndefined()
    expect(out.request).toBeUndefined()
    expect(out.contexts.device).toEqual({ arch: 'arm64' })
    expect(out.exception.values[0].value).toBe('bad ~/…/q.ts')
    expect(out.exception.values[0].stacktrace.frames[0]).toEqual({ filename: '~/…/q.ts', lineno: 3 })
    expect(JSON.stringify(out)).not.toMatch(/kevinkevin|MacBook/)
  })

  it("keeps only the app's own lifecycle breadcrumbs, without their data", () => {
    expect(keepBreadcrumb({ category: 'console', message: '[step] mapped claude' }, mac)).toBeNull()
    expect(keepBreadcrumb({ category: 'ui.click', message: 'button' }, mac)).toBeNull()
    expect(keepBreadcrumb({ category: 'electron', message: 'app.ready', data: { url: 'https://x' } }, mac)).toEqual({
      category: 'electron',
      message: 'app.ready',
      data: undefined
    })
  })
})
