import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { folderArgs, onlyFolders } from './openFolders'

let root: string
let sub: string
let file: string

beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'step-folders-'))
  sub = path.join(root, 'project')
  file = path.join(root, 'notes.txt')
  fs.mkdirSync(sub)
  fs.writeFileSync(file, 'x')
})

afterAll(() => {
  fs.rmSync(root, { recursive: true, force: true })
})

describe('folderArgs', () => {
  it('keeps existing folders and drops flags, links, files and nonsense', () => {
    const argv = ['app.exe', '--remote-debugging-port=0', 'step://focus/1', sub, file, path.join(root, 'missing'), '']
    expect(folderArgs(argv, root, [])).toEqual([sub])
  })

  it('ignores the app itself and repeats', () => {
    expect(folderArgs(['app.exe', root, sub, sub], root, [root])).toEqual([sub])
  })

  it('resolves relative folders against the working directory it was launched from', () => {
    expect(folderArgs(['app.exe', 'project'], root, [])).toEqual([sub])
  })
})

describe('onlyFolders', () => {
  it('filters a plain list the same way', () => {
    expect(onlyFolders([file, sub], root)).toEqual([sub])
  })
})
