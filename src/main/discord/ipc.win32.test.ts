import { describe, expect, it, vi } from 'vitest'

vi.mock('node:path', async () => {
  const real = await vi.importActual<typeof import('node:path')>('node:path')
  return { ...real.win32, default: real.win32 }
})

const { socketPaths } = await import('./ipc')

describe('Discord socket paths worked out on a Windows machine', () => {
  it('stay POSIX for macOS and Linux', () => {
    const p = socketPaths('linux', { XDG_RUNTIME_DIR: '/run/user/1000' })
    expect(p[0]).toBe('/run/user/1000/discord-ipc-0')
    expect(p).toContain('/run/user/1000/snap.discord/discord-ipc-0')
  })
})
