import { describe, it, expect } from 'vitest'
import { VirtualFileSystem } from '../../../virtual-fs/src/index'
import { createBunRuntime } from '../vitamin-runtime'
import { PluginManager, type RuntimePlugin } from '../runtime-plugins'

describe('PluginManager', () => {
  it('orders plugins by priority and name', async () => {
    const vfs = new VirtualFileSystem()
    const manager = new PluginManager(vfs, {}, { trace: false })
    const runtime = createBunRuntime(vfs, {}, () => {}, () => {}, {}, manager)
    manager.setRuntime(runtime)

    const calls: string[] = []
    const a: RuntimePlugin = {
      name: 'alpha',
      priority: 10,
      onModuleResolve: () => {
        calls.push('alpha')
      },
    }
    const b: RuntimePlugin = {
      name: 'beta',
      priority: 100,
      onModuleResolve: () => {
        calls.push('beta')
      },
    }

    manager.register(a)
    manager.register(b)
    await manager.init()

    await manager.runModuleResolve('x')
    expect(calls).toEqual(['beta', 'alpha'])
  })

  it('isolates plugin errors and continues', async () => {
    const vfs = new VirtualFileSystem()
    const manager = new PluginManager(vfs, {}, { trace: false })
    const runtime = createBunRuntime(vfs, {}, () => {}, () => {}, {}, manager)
    manager.setRuntime(runtime)

    manager.register({
      name: 'bad',
      onModuleRequest: () => {
        throw new Error('boom')
      },
    })
    manager.register({
      name: 'good',
      onModuleRequest: () => ({ exports: { ok: true } }),
    })

    const result = await manager.runModuleLoad('native:test')
    expect(result?.exports).toEqual({ ok: true })
  })

  it('invokes lifecycle hooks on init/dispose', async () => {
    const vfs = new VirtualFileSystem()
    const manager = new PluginManager(vfs, {}, { trace: false })
    const runtime = createBunRuntime(vfs, {}, () => {}, () => {}, {}, manager)
    manager.setRuntime(runtime)

    const calls: string[] = []
    manager.register({
      name: 'life',
      onRuntimeInit: () => {
        calls.push('init')
      },
      onRuntimeDispose: () => {
        calls.push('dispose')
      },
    })

    await manager.init()
    await manager.dispose()

    expect(calls).toEqual(['init', 'dispose'])
  })
})
