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

describe('scheduler module', () => {
  it('now/yield works', async () => {
    const vfs = new VirtualFileSystem()
    const polyfill = createBunRuntime(vfs, {}, () => {}, () => {})
    const core = createCoreModules(vfs, polyfill)

    const scheduler = core.scheduler as { now: () => number; yield: () => Promise<void> }
    expect(typeof scheduler.now()).toBe('number')
    await expect(scheduler.yield()).resolves.toBeUndefined()
  })

  it('resolves node:scheduler alias', async () => {
    const vfs = new VirtualFileSystem()
    vfs.writeFile('/index', "module.exports = require('node:scheduler')")

    const loader = createLoader(vfs)
    const mod = await loader.load('/index')
    expect((mod.exports as { now?: unknown }).now).toBeTypeOf('function')
  })
})
