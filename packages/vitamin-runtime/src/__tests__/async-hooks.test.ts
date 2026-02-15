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

  it('tracks async resource lifecycle', () => {
    const vfs = new VirtualFileSystem()
    const polyfill = createBunRuntime(vfs, {}, () => {}, () => {})
    const core = createCoreModules(vfs, polyfill)
    const asyncHooks = core.async_hooks as {
      createHook: (callbacks: {
        init?: (...args: unknown[]) => void
        before?: (...args: unknown[]) => void
        after?: (...args: unknown[]) => void
        destroy?: (...args: unknown[]) => void
      }) => { enable: () => unknown; disable: () => unknown }
      AsyncResource: new (type?: string) => {
        runInAsyncScope: <T>(fn: () => T) => T
        emitDestroy: () => void
        asyncId: number
      }
    }

    const events: string[] = []
    const hook = asyncHooks.createHook({
      init: (id, type) => events.push(`init:${String(type)}:${String(id)}`),
      before: (id) => events.push(`before:${String(id)}`),
      after: (id) => events.push(`after:${String(id)}`),
      destroy: (id) => events.push(`destroy:${String(id)}`),
    })
    hook.enable()

    const resource = new asyncHooks.AsyncResource('TEST')
    resource.runInAsyncScope(() => {
      events.push('run')
    })
    resource.emitDestroy()

    expect(events[0]).toContain('init:TEST')
    expect(events).toContain('before:' + String(resource.asyncId))
    expect(events).toContain('after:' + String(resource.asyncId))
    expect(events).toContain('destroy:' + String(resource.asyncId))
  })

  it('propagates AsyncLocalStorage across microtasks', async () => {
    const vfs = new VirtualFileSystem()
    const polyfill = createBunRuntime(vfs, {}, () => {}, () => {})
    const core = createCoreModules(vfs, polyfill)
    const asyncHooks = core.async_hooks as {
      AsyncLocalStorage: new <T>() => {
        run: <R>(store: T, cb: () => R) => R
        getStore: () => T | undefined
      }
    }

    const storage = new asyncHooks.AsyncLocalStorage<{ value: number }>()
    let observed = 0

    await storage.run({ value: 42 }, async () => {
      await Promise.resolve().then(() => {
        observed = storage.getStore()?.value ?? 0
      })
    })

    expect(observed).toBe(42)
  })

  it('resolves node:async_hooks alias', async () => {
    const vfs = new VirtualFileSystem()
    vfs.writeFile('/index', "module.exports = require('node:async_hooks')")

    const loader = createLoader(vfs)
    const mod = await loader.load('/index')
    expect((mod.exports as { createHook?: unknown }).createHook).toBeTypeOf('function')
  })
})
