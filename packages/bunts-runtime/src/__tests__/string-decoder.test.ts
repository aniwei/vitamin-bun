import { describe, it, expect } from 'vitest'
import { VirtualFileSystem } from '../../../virtual-fs/src/index.js'
import { createPolyfill } from '../polyfill.js'
import { createCoreModules } from '../core-modules.js'
import { ModuleLoader } from '../module-loader.js'
import { Transpiler } from '../transpiler.js'

function createLoader(vfs: VirtualFileSystem) {
  const polyfill = createPolyfill(vfs, {}, () => {}, () => {})
  const coreModules = createCoreModules(vfs, polyfill)

  return new ModuleLoader({
    vfs,
    transpiler: new Transpiler(),
    runtime: { Bun: polyfill.Bun, process: polyfill.process, console: polyfill.console },
    coreModules,
  })
}

describe('string_decoder module', () => {
  it('StringDecoder write/end works', () => {
    const vfs = new VirtualFileSystem()
    const polyfill = createPolyfill(vfs, {}, () => {}, () => {})
    const core = createCoreModules(vfs, polyfill)

    const mod = core.string_decoder as { StringDecoder: new (enc?: string) => { write: (b: Uint8Array) => string; end: (b?: Uint8Array) => string } }
    const decoder = new mod.StringDecoder('utf-8')
    const chunk = decoder.write(new TextEncoder().encode('hello'))
    const end = decoder.end()
    expect(chunk).toBe('hello')
    expect(end).toBe('')
  })

  it('resolves node:string_decoder alias', async () => {
    const vfs = new VirtualFileSystem()
    vfs.writeFile('/index.js', "module.exports = require('node:string_decoder')")

    const loader = createLoader(vfs)
    const mod = await loader.load('/index.js')
    expect((mod.exports as { StringDecoder?: unknown }).StringDecoder).toBeTypeOf('function')
  })
})
