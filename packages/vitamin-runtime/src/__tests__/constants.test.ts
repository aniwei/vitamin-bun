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

describe('constants module', () => {
  it('constants object exists', () => {
    const vfs = new VirtualFileSystem()
    const polyfill = createBunRuntime(vfs, {}, () => {}, () => {})
    const core = createCoreModules(vfs, polyfill)

    const constants = core.constants as { S_IFREG: number; S_IFDIR: number }
    expect(constants.S_IFREG).toBeTypeOf('number')
    expect(constants.S_IFDIR).toBeTypeOf('number')
  })

  it('resolves node:constants alias', async () => {
    const vfs = new VirtualFileSystem()
    vfs.writeFile('/index', "module.exports = require('node:constants')")

    const loader = createLoader(vfs)
    const mod = await loader.load('/index')
    expect((mod.exports as { S_IFREG?: unknown }).S_IFREG).toBeTypeOf('number')
  })
})
