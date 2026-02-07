import { describe, it, expect } from 'vitest'
import { VirtualFileSystem } from '../../../virtual-fs/src/index'
import { createBunRuntime } from '../bun-runtime'
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

describe('async_hooks module', () => {
  it('createHook returns enable/disable', () => {
    const vfs = new VirtualFileSystem()
    const polyfill = createBunRuntime(vfs, {}, () => {}, () => {})
    const core = createCoreModules(vfs, polyfill)

    const asyncHooks = core.async_hooks as { createHook: () => { enable: () => unknown; disable: () => unknown } }
    const hook = asyncHooks.createHook()
    expect(typeof hook.enable).toBe('function')
    expect(typeof hook.disable).toBe('function')
  })

  it('resolves node:async_hooks alias', async () => {
    const vfs = new VirtualFileSystem()
    vfs.writeFile('/index', "module.exports = require('node:async_hooks')")

    const loader = createLoader(vfs)
    const mod = await loader.load('/index')
    expect((mod.exports as { createHook?: unknown }).createHook).toBeTypeOf('function')
  })
})
