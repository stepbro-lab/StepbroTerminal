import { describe, expect, it } from 'vitest'
import { readable, readRequest, READ_LIMIT } from './readable'

describe('readable', () => {
  it('takes the hashes off a heading and leaves the heading', () => {
    expect(readable('## Verificación:')).toBe('Verificación:')
    expect(readable('# Uno\n### Tres')).toBe('Uno\nTres')
  })

  it('unwraps emphasis instead of spelling the asterisks out', () => {
    expect(readable('**npm run test** salió bien')).toBe('npm run test salió bien')
    expect(readable('_a_ y __b__ y ~~c~~')).toBe('a y b y c')
  })

  it('reads a command without its backticks, and drops the fence around a block', () => {
    expect(readable('corre `npm run dev` ahora')).toBe('corre npm run dev ahora')
    expect(readable('```bash\nnpm run dev\n```')).toBe('npm run dev')
  })

  it('reads the words of a link, not the address', () => {
    expect(readable('mira [la documentación](https://example.com/a/b)')).toBe('mira la documentación')
  })

  it('reads a list as lines, without the bullets or the numbers', () => {
    expect(readable('- uno\n- dos\n1. tres\n2) cuatro')).toBe('uno\ndos\ntres\ncuatro')
    expect(readable('- [ ] pendiente\n- [x] hecho')).toBe('pendiente\nhecho')
  })

  it('drops what an agent draws rather than writes', () => {
    // Boxes, bars and the braille a spinner is made of say nothing out loud.
    expect(readable('╭────────────╮\n│ OpenAI Codex │\n╰────────────╯')).toBe('OpenAI Codex')
    expect(readable('⠁⠂⠄ pensando ⠈⠐')).toBe('pensando')
    expect(readable('---')).toBe('')
  })

  it('leaves a blockquote as what was said in it', () => {
    expect(readable('> lo que dijo\n> en dos líneas')).toBe('lo que dijo\nen dos líneas')
  })

  it('keeps one blank line as a pause and throws the rest away', () => {
    expect(readable('uno\n\n\n\ndos')).toBe('uno\n\ndos')
  })

  it('squeezes the spaces a terminal pads its lines with', () => {
    expect(readable('   hola     mundo   ')).toBe('hola mundo')
  })

  it('changes nothing about ordinary prose, accents and all', () => {
    const prose = 'Ya están la infraestructura y las slots demo. ¿Arrancamos con esos tres?'
    expect(readable(prose)).toBe(prose)
  })

  it('stops at a length nobody would sit through, and stops between words', () => {
    const long = readable('palabra '.repeat(2000))
    expect(long.length).toBeLessThanOrEqual(READ_LIMIT)
    expect(long.endsWith('palabra')).toBe(true)
  })

  it('has nothing to say about nothing', () => {
    expect(readable('   \n\n  ')).toBe('')
  })
})

describe('readRequest', () => {
  it('asks for the words as they are, not an answer to them', () => {
    const asked = readRequest('hola', 'normal')
    expect(asked).toMatch(/do not summarize it/)
    expect(asked).toMatch(/do not answer it/)
    expect(asked.endsWith('hola')).toBe(true)
  })

  it('asks for the pace that was chosen', () => {
    expect(readRequest('x', 'slow')).toMatch(/slowly/)
    expect(readRequest('x', 'fast')).toMatch(/briskly/)
    expect(readRequest('x')).toMatch(/normal, even pace/)
  })

  it('leaves the language of the passage alone', () => {
    expect(readRequest('x')).toMatch(/read it in that language/i)
  })
})
