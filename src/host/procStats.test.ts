import { describe, expect, it } from 'vitest'
import { CpuMeter, parseCpuTime, parsePs, parseWindows, subtree, type ProcInfo } from './procStats'

describe('process rows', () => {
  it('reads what PowerShell prints: bytes and 100 ns ticks', () => {
    const map = parseWindows('1234 100 52428800 150000000\r\n\r\n77 1234 1048576 0\r\n')
    expect(map.get(1234)).toEqual({ pid: 1234, ppid: 100, rss: 52428800, cpu: 15 })
    expect(map.get(77)?.rss).toBe(1048576)
  })

  it('reads ps rows in kilobytes and clock time', () => {
    const map = parsePs('  501     1  20480  0:01.50\n  502   501   1024 01:02:03\n')
    expect(map.get(501)).toEqual({ pid: 501, ppid: 1, rss: 20480 * 1024, cpu: 1.5 })
    expect(map.get(502)?.cpu).toBe(3723)
  })

  it('understands every way ps writes time', () => {
    expect(parseCpuTime('0:00.05')).toBeCloseTo(0.05)
    expect(parseCpuTime('12:34')).toBe(754)
    expect(parseCpuTime('1:02:03')).toBe(3723)
    expect(parseCpuTime('2-01:00:00')).toBe(2 * 86400 + 3600)
    expect(parseCpuTime('junk')).toBe(0)
  })
})

describe('subtree', () => {
  const procs = new Map<number, ProcInfo>(
    [
      { pid: 1, ppid: 0, rss: 1, cpu: 0 },
      { pid: 10, ppid: 1, rss: 10, cpu: 0 },
      { pid: 11, ppid: 10, rss: 11, cpu: 0 },
      { pid: 12, ppid: 11, rss: 12, cpu: 0 },
      { pid: 20, ppid: 1, rss: 20, cpu: 0 },
      { pid: 30, ppid: 30, rss: 30, cpu: 0 }
    ].map((p) => [p.pid, p])
  )

  it('collects a process and everything under it, and nothing beside it', () => {
    expect(subtree(procs, 10).map((p) => p.pid).sort()).toEqual([10, 11, 12])
    expect(subtree(procs, 20).map((p) => p.pid)).toEqual([20])
    expect(subtree(procs, 999)).toEqual([])
  })

  it('does not loop on a process that is its own parent', () => {
    expect(subtree(procs, 30).map((p) => p.pid)).toEqual([30])
  })
})

describe('CpuMeter', () => {
  it('reports nothing the first time and the share of one core after that', () => {
    const m = new CpuMeter()
    expect(m.rate({ pid: 1, ppid: 0, rss: 0, cpu: 10 }, 1000)).toBe(0)
    expect(m.rate({ pid: 1, ppid: 0, rss: 0, cpu: 10.5 }, 2000)).toBeCloseTo(50)
    expect(m.rate({ pid: 1, ppid: 0, rss: 0, cpu: 12.5 }, 3000)).toBeCloseTo(200)
  })

  it('starts over for a pid it was told to forget, and never goes negative', () => {
    const m = new CpuMeter()
    m.rate({ pid: 5, ppid: 0, rss: 0, cpu: 100 }, 1000)
    m.keepOnly(new Set([6]))
    expect(m.rate({ pid: 5, ppid: 0, rss: 0, cpu: 0.5 }, 2000)).toBe(0)
    expect(m.rate({ pid: 5, ppid: 0, rss: 0, cpu: 0.2 }, 3000)).toBe(0)
  })
})
