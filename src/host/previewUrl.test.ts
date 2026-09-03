import { describe, expect, it } from 'vitest'
import { isOwnEndpoint, previewUrlIn } from './previewUrl'

describe('previewUrlIn', () => {
  it('finds a dev server and normalizes the wildcard hosts', () => {
    expect(previewUrlIn('  ➜  Local:   http://localhost:5173/\n')).toBe('http://localhost:5173/')
    expect(previewUrlIn('Serving HTTP on 0.0.0.0 port 8000 (http://0.0.0.0:8000/) ...')).toBe('http://localhost:8000/')
    expect(previewUrlIn('http://[::]:8765/.')).toBe('http://localhost:8765/')
    expect(previewUrlIn('nothing here')).toBeNull()
  })

  it("ignores the host's own hook and MCP endpoints, however they are written", () => {
    expect(previewUrlIn('url: http://127.0.0.1:59786/mcp/4f2dc721b9da8a4efe86a6b6263dea3b/$STEP_SESSION_ID')).toBeNull()
    expect(previewUrlIn('POST http://127.0.0.1:59786/hooks/4f2dc721b9da8a4efe86a6b6263dea3b/abc')).toBeNull()
    expect(previewUrlIn('curl http://127.0.0.1:59786/anything', 59786)).toBeNull()
    expect(previewUrlIn('http://localhost:3000/', 59786)).toBe('http://localhost:3000/')
  })
})

describe('isOwnEndpoint', () => {
  it('matches by path token or by port', () => {
    expect(isOwnEndpoint('http://127.0.0.1:1/mcp/0123456789abcdef/s1')).toBe(true)
    expect(isOwnEndpoint('http://127.0.0.1:4444/x', 4444)).toBe(true)
    expect(isOwnEndpoint('http://localhost:5173/', 4444)).toBe(false)
  })
})
