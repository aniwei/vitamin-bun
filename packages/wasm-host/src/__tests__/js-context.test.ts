import { describe, it, expect, beforeEach } from 'vitest'
import { BrowserJSContext } from '../js-context.js'

describe('BrowserJSContext', () => {
  let ctx: BrowserJSContext

  beforeEach(() => {
    ctx = new BrowserJSContext()
  })

  it('evaluates code and returns a handle', () => {
    const handle = ctx.eval('1 + 2')
    expect(ctx.typeOf(handle)).toBe('number')
  })

  it('creates an object and sets / gets properties', () => {
    const obj = ctx.createObject()
    const val = ctx.eval('"hello"')
    ctx.setProperty(obj, 'greeting', val)
    const got = ctx.getProperty(obj, 'greeting')
    expect(ctx.typeOf(got)).toBe('string')
  })

  it('calls a function handle', () => {
    const fn = ctx.eval('(function(a, b) { return a + b })')
    const a = ctx.eval('10')
    const b = ctx.eval('20')
    const result = ctx.call(fn, [a, b])
    expect(ctx.typeOf(result)).toBe('number')
  })

  it('releases handles', () => {
    const handle = ctx.eval('42')
    ctx.release(handle)
    expect(() => ctx.typeOf(handle)).toThrow('Invalid JS handle')
  })

  it('handle 0 is always undefined', () => {
    expect(ctx.typeOf(0)).toBe('undefined')
    // Releasing handle 0 should be a no-op.
    ctx.release(0)
    expect(ctx.typeOf(0)).toBe('undefined')
  })

  it('throws when calling a non-function', () => {
    const obj = ctx.createObject()
    expect(() => ctx.call(obj, [])).toThrow('not a function')
  })
})
