import { describe, it, expect } from 'vitest'
import { Transpiler } from '../transpiler'

describe('Transpiler', () => {
  it('transpiles TypeScript to CommonJS', () => {
    const transpiler = new Transpiler()
    const source = 'export const answer: number = 42'
    const result = transpiler.compile(source, 'ts', '/index.ts')

    expect(result.code).toContain('exports.answer')
  })

  it('handles JSON loader', () => {
    const transpiler = new Transpiler()
    const result = transpiler.compile('{"ok":true}', 'json', '/data.json')
    expect(result.code).toContain('module.exports')
  })
})
