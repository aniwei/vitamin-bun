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

describe('buffer module', () => {
  it('Buffer.alloc fills bytes', () => {
    const vfs = new VirtualFileSystem()
    const polyfill = createPolyfill(vfs, {}, () => {}, () => {})
    const core = createCoreModules(vfs, polyfill)

    const buffer = core.buffer as { Buffer: { alloc: (size: number, fill?: number) => Uint8Array } }
    const out = buffer.Buffer.alloc(2, 1)
    expect(Array.from(out)).toEqual([1, 1])
  })

  it('Buffer.concat combines', () => {
    const vfs = new VirtualFileSystem()
    const polyfill = createPolyfill(vfs, {}, () => {}, () => {})
    const core = createCoreModules(vfs, polyfill)

    const buffer = core.buffer as { Buffer: { from: (data: string) => Uint8Array; concat: (list: Uint8Array[]) => Uint8Array } }
    const out = buffer.Buffer.concat([buffer.Buffer.from('a'), buffer.Buffer.from('b')])
    expect(new TextDecoder().decode(out)).toBe('ab')
  })

  it('resolves node:buffer alias', async () => {
    const vfs = new VirtualFileSystem()
    vfs.writeFile('/index.js', "module.exports = require('node:buffer')")

    const loader = createLoader(vfs)
    const mod = await loader.load('/index.js')
    expect((mod.exports as { Buffer?: unknown }).Buffer).toBeTypeOf('function')
  })
})
