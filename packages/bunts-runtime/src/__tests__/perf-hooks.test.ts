import { describe, it, expect } from 'vitest'
import { VirtualFileSystem } from '../../../virtual-fs/src/index'
import { createPolyfill } from '../polyfill'
import { createCoreModules } from '../core-modules'
import { ModuleLoader } from '../module-loader'
import { Transpiler } from '../transpiler'

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

describe('perf_hooks module', () => {
  it('performance.now/timeOrigin works', () => {
    const vfs = new VirtualFileSystem()
    const polyfill = createPolyfill(vfs, {}, () => {}, () => {})
    const core = createCoreModules(vfs, polyfill)

    const perfHooks = core.perf_hooks as { performance: { now: () => number; timeOrigin: number } }
    expect(typeof perfHooks.performance.now()).toBe('number')
    expect(typeof perfHooks.performance.timeOrigin).toBe('number')
  })

  it('resolves node:perf_hooks alias', async () => {
    const vfs = new VirtualFileSystem()
    vfs.writeFile('/index', "module.exports = require('node:perf_hooks')")

    const loader = createLoader(vfs)
    const mod = await loader.load('/index')
    expect((mod.exports as { performance?: unknown }).performance).toBeDefined()
  })
})
