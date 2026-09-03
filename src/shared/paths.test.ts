import { describe, expect, it } from 'vitest'
import { encodeClaudeProjectDir, hostSocketPath, normalizeProjectPath, projectName, sameProject, stepDir } from './paths'

describe('paths', () => {
  it('moves the host directory and pipe with STEP_HOME', () => {
    process.env['STEP_HOME'] = '/tmp/step dev'
    try {
      expect(stepDir()).toBe('/tmp/step dev')
      expect(hostSocketPath('win32', 'kevin')).toBe('\\\\.\\pipe\\step-host-kevin-step_dev')
    } finally {
      delete process.env['STEP_HOME']
    }
  })

  it('encodes claude project dirs like Claude Code does', () => {
    expect(encodeClaudeProjectDir('C:\\Users\\x\\proj')).toBe('C--Users-x-proj')
    expect(encodeClaudeProjectDir('/Users/x/proj')).toBe('-Users-x-proj')
  })

  it('normalizes windows paths', () => {
    expect(normalizeProjectPath('c:/Users/x/proj/', 'win32')).toBe('C:\\Users\\x\\proj')
    expect(normalizeProjectPath('C:\\Users\\x\\proj\\', 'win32')).toBe('C:\\Users\\x\\proj')
  })

  it('normalizes posix paths', () => {
    expect(normalizeProjectPath('/Users/x/proj/', 'darwin')).toBe('/Users/x/proj')
    expect(normalizeProjectPath('/', 'linux')).toBe('/')
  })

  it('compares projects case-insensitively on windows only', () => {
    expect(sameProject('C:\\A\\B', 'c:/a/b', 'win32')).toBe(true)
    expect(sameProject('/a/B', '/a/b', 'linux')).toBe(false)
  })

  it('builds socket paths per platform', () => {
    expect(hostSocketPath('win32', 'kevin')).toBe('\\\\.\\pipe\\step-host-kevin')
    expect(hostSocketPath('darwin', 'kevin').endsWith('host.sock')).toBe(true)
  })

  it('extracts project names', () => {
    expect(projectName('C:\\Users\\x\\My Proj')).toBe('My Proj')
    expect(projectName('/home/x/app/')).toBe('app')
  })
})
