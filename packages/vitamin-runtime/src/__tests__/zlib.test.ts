import { describe, it, expect } from 'vitest'
import { VirtualFileSystem } from '../../../virtual-fs/src/index'
import { createBunRuntime } from '../vitamin-runtime'
import { createCoreModules } from '../internal-modules/index'
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

describe('zlib module', () => {
  it('exposes sync methods and throws unsupported errors', () => {
    const vfs = new VirtualFileSystem()
    const polyfill = createBunRuntime(vfs, {}, () => {}, () => {})
    const core = createCoreModules(vfs, polyfill)

    const zlib = core.zlib as {
      deflateSync: () => void
      inflateSync: () => void
      gzipSync: () => void
      gunzipSync: () => void
      brotliCompressSync: () => void
      brotliDecompressSync: () => void
      constants: Record<string, unknown>
    }

    expect(zlib.constants).toBeTypeOf('object')
    expect(() => zlib.gzipSync()).toThrow(/zlib\.gzipSync is not supported/i)
  })

  it('resolves node:zlib alias', async () => {
    const vfs = new VirtualFileSystem()
    vfs.writeFile('/index', "module.exports = require('node:zlib')")

    const loader = createLoader(vfs)
    const mod = await loader.load('/index')
    expect((mod.exports as { gzipSync?: unknown }).gzipSync).toBeTypeOf('function')
  })
})
