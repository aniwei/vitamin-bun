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

describe('scheduler module', () => {
  it('now/yield works', async () => {
    const vfs = new VirtualFileSystem()
    const polyfill = createPolyfill(vfs, {}, () => {}, () => {})
    const core = createCoreModules(vfs, polyfill)

    const scheduler = core.scheduler as { now: () => number; yield: () => Promise<void> }
    expect(typeof scheduler.now()).toBe('number')
    await expect(scheduler.yield()).resolves.toBeUndefined()
  })

  it('resolves node:scheduler alias', async () => {
    const vfs = new VirtualFileSystem()
    vfs.writeFile('/index.js', "module.exports = require('node:scheduler')")

    const loader = createLoader(vfs)
    const mod = await loader.load('/index.js')
    expect((mod.exports as { now?: unknown }).now).toBeTypeOf('function')
  })
})
