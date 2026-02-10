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

describe('assert/strict module', () => {
  it('resolves assert/strict alias', async () => {
    const vfs = new VirtualFileSystem()
    vfs.writeFile('/index', "module.exports = require('assert/strict')")

    const loader = createLoader(vfs)
    const mod = await loader.load('/index')
    expect((mod.exports as { ok?: unknown }).ok).toBeTypeOf('function')
  })

  it('resolves node:assert/strict alias', async () => {
    const vfs = new VirtualFileSystem()
    vfs.writeFile('/index', "module.exports = require('node:assert/strict')")

    const loader = createLoader(vfs)
    const mod = await loader.load('/index')
    expect((mod.exports as { ok?: unknown }).ok).toBeTypeOf('function')
  })
})
