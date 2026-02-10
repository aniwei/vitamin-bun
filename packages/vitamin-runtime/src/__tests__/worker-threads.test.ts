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

describe('worker_threads module', () => {
  it('exposes Worker and environment flags', () => {
    const vfs = new VirtualFileSystem()
    const polyfill = createBunRuntime(vfs, {}, () => {}, () => {})
    const core = createCoreModules(vfs, polyfill)

    const workerThreads = core.worker_threads as {
      isMainThread: boolean
      threadId: number
      parentPort: unknown
      workerData: unknown
      Worker: new () => unknown
      MessageChannel?: typeof MessageChannel
      MessagePort?: typeof MessagePort
    }

    expect(workerThreads.isMainThread).toBe(true)
    expect(workerThreads.threadId).toBe(0)
    expect(workerThreads.parentPort).toBeNull()
    expect(workerThreads.workerData).toBeNull()
    expect(workerThreads.Worker).toBeTypeOf('function')
    expect(workerThreads.MessageChannel === undefined || typeof workerThreads.MessageChannel).toBeTruthy()
    expect(workerThreads.MessagePort === undefined || typeof workerThreads.MessagePort).toBeTruthy()

    if (typeof (globalThis as { Worker?: unknown }).Worker === 'undefined') {
      expect(() => new workerThreads.Worker()).toThrow(/WebWorker support/i)
    }
  })

  it('resolves node:worker_threads alias', async () => {
    const vfs = new VirtualFileSystem()
    vfs.writeFile('/index', "module.exports = require('node:worker_threads')")

    const loader = createLoader(vfs)
    const mod = await loader.load('/index')
    expect((mod.exports as { Worker?: unknown }).Worker).toBeTypeOf('function')
  })

  it('supports MessageChannel messaging in main thread', async () => {
    const vfs = new VirtualFileSystem()
    const polyfill = createBunRuntime(vfs, {}, () => {}, () => {})
    const core = createCoreModules(vfs, polyfill)
    const workerThreads = core.worker_threads as {
      MessageChannel?: typeof MessageChannel
    }

    if (!workerThreads.MessageChannel) return
    const channel = new workerThreads.MessageChannel()
    const received: unknown[] = []
    await new Promise<void>((resolve) => {
      channel.port1.onmessage = (event) => {
        received.push(event.data)
        resolve()
      }
      channel.port2.postMessage({ ok: true })
    })
    expect(received.length).toBe(1)
    expect(received[0]).toEqual({ ok: true })
  })
})
