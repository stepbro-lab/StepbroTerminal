import { describe, expect, it, vi } from 'vitest'

// Windows paths, whatever this runs on: drives, backslashes, and a working folder on another drive
// than the agent's, as on the CI's Windows machines (the job on D:, the temp folder on C:).
vi.mock('node:path', async () => {
  const real = await vi.importActual<typeof import('node:path')>('node:path')
  return { ...real.win32, default: real.win32 }
})

const { resolveFolder } = await import('./workspaceTools')

const home = 'C:\\Users\\kevin'
const app = 'C:\\Users\\kevin\\code\\app'

describe('folders an agent names, on Windows', () => {
  it('spells them out in full, with backslashes and no trailing one', () => {
    expect(resolveFolder('~/code/app', 'D:\\work', home)).toBe(app)
    expect(resolveFolder('~\\code\\app\\', 'D:\\work', home)).toBe(app)
    expect(resolveFolder('~', 'D:\\work', home)).toBe(home)
    expect(resolveFolder('..\\api', app, home)).toBe('C:\\Users\\kevin\\code\\api')
    expect(resolveFolder('../api', app, home)).toBe('C:\\Users\\kevin\\code\\api')
    expect(resolveFolder('C:/Users/kevin/code/app/', 'D:\\work', home)).toBe(app)
  })

  it('takes "/" as the root of the drive the agent is on, and keeps a root whole', () => {
    expect(resolveFolder('/', app, home)).toBe('C:\\')
    expect(resolveFolder('\\', 'D:\\work\\site', home)).toBe('D:\\')
    expect(resolveFolder('D:\\', app, home)).toBe('D:\\')
    expect(resolveFolder('d:/projects', app, home)).toBe('d:\\projects')
  })
})
