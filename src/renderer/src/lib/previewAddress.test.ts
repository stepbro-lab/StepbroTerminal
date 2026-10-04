import { describe, expect, it } from 'vitest'
import { addressFrom } from './previewAddress'

describe('an address typed into the preview', () => {
  it('opens a dev server over http, written the short way', () => {
    expect(addressFrom('localhost:3000/admin')).toBe('http://localhost:3000/admin')
    expect(addressFrom('localhost')).toBe('http://localhost/')
    expect(addressFrom('127.0.0.1:5173')).toBe('http://127.0.0.1:5173/')
    expect(addressFrom(':8080')).toBe('http://localhost:8080/')
    expect(addressFrom('192.168.1.20:3000/p/abc')).toBe('http://192.168.1.20:3000/p/abc')
  })

  it('opens a site over https, and takes a full address as it is', () => {
    expect(addressFrom('example.com')).toBe('https://example.com/')
    expect(addressFrom('docs.github.com/en/actions')).toBe('https://docs.github.com/en/actions')
    expect(addressFrom('  http://localhost:3000/p/GhY9ph0NF7  ')).toBe('http://localhost:3000/p/GhY9ph0NF7')
    expect(addressFrom('https://example.com/a?b=1#c')).toBe('https://example.com/a?b=1#c')
  })

  it('opens nothing that is not a web page', () => {
    expect(addressFrom('file:///etc/passwd')).toBeNull()
    expect(addressFrom('javascript:alert(1)')).toBeNull()
    expect(addressFrom('ftp://example.com')).toBeNull()
    expect(addressFrom('hola que tal')).toBeNull()
    expect(addressFrom('notes')).toBeNull()
    expect(addressFrom('')).toBeNull()
  })
})
