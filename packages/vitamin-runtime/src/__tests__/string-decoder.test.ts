import { describe, it, expect } from 'vitest'
import { VirtualFileSystem } from '../../../virtual-fs/src/index'
import { createBunRuntime } from '../vitamin-runtime'
import { createCoreModules } from '../core-modules/index'
import { ModuleLoader } from '../module-loader'
import { Transpiler } from '../transpiler'

function createLoader(vfs: VirtualFileSystem) {
  const polyfill = createBunRuntime(vfs, {}, () => {}, () => {})
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
    const polyfill = createBunRuntime(vfs, {}, () => {}, () => {})
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
    vfs.writeFile('/index', "module.exports = require('node:string_decoder')")

    const loader = createLoader(vfs)
    const mod = await loader.load('/index')
    expect((mod.exports as { StringDecoder?: unknown }).StringDecoder).toBeTypeOf('function')
  })
})
