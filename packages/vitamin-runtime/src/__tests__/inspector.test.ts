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

describe('inspector module', () => {
  it('url returns null', () => {
    const vfs = new VirtualFileSystem()
    const polyfill = createBunRuntime(vfs, {}, () => {}, () => {})
    const core = createCoreModules(vfs, polyfill)

    const inspector = core.inspector as { url: () => null }
    expect(inspector.url()).toBeNull()
  })

  it('resolves node:inspector alias', async () => {
    const vfs = new VirtualFileSystem()
    vfs.writeFile('/index', "module.exports = require('node:inspector')")

    const loader = createLoader(vfs)
    const mod = await loader.load('/index')
    expect((mod.exports as { url?: unknown }).url).toBeTypeOf('function')
  })
})
