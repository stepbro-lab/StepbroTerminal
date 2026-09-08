import { describe, expect, it } from 'vitest'
import type { Project } from '@shared/types'
import { inOrder } from './projects'

const p = (path: string): Project => ({ path, name: path.split(/[\\/]/).pop() ?? path, sources: ['added'] })

describe('inOrder', () => {
  it('puts folders in the order the person chose', () => {
    const list = [p('C:\\a'), p('C:\\b'), p('C:\\c')]
    expect(inOrder(list, ['C:\\c', 'C:\\a']).map((x) => x.path)).toEqual(['C:\\c', 'C:\\a', 'C:\\b'])
  })

  it('keeps folders nobody moved after the ordered ones, as they were', () => {
    const list = [p('C:\\x'), p('C:\\y'), p('C:\\z'), p('C:\\w')]
    expect(inOrder(list, ['C:\\z']).map((x) => x.path)).toEqual(['C:\\z', 'C:\\x', 'C:\\y', 'C:\\w'])
    expect(inOrder(list, []).map((x) => x.path)).toEqual(['C:\\x', 'C:\\y', 'C:\\z', 'C:\\w'])
  })

  it('matches a path spelled the same way anywhere', () => {
    const list = [p('/home/me/one'), p('/home/me/two')]
    expect(inOrder(list, ['/home/me/two']).map((x) => x.name)).toEqual(['two', 'one'])
  })

  // Windows paths are the same folder whatever their case or slashes; other systems tell them apart.
  it.runIf(process.platform === 'win32')('matches a Windows path whatever its case or slashes', () => {
    const list = [p('C:\\Users\\me\\one'), p('C:\\Users\\me\\two')]
    expect(inOrder(list, ['c:/users/me/two']).map((x) => x.name)).toEqual(['two', 'one'])
  })
})
