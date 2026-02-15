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

describe('Timers and nextTick', () => {
  it('setTimeout resolves from timers/promises', async () => {
    const vfs = new VirtualFileSystem()
    const loader = createLoader(vfs)

    vfs.writeFile('/index', `
      const { setTimeout } = require('timers/promises')
      module.exports = setTimeout(10, 'ok')
    `)

    const mod = await loader.load('/index')
    const result = await (mod.exports as unknown as Promise<unknown>)
    expect(result).toBe('ok')
  })

  it('setImmediate executes callback', async () => {
    const vfs = new VirtualFileSystem()
    const loader = createLoader(vfs)

    vfs.writeFile('/index', `
      const timers = require('timers')
      let ran = false
      module.exports = new Promise((resolve) => {
        timers.setImmediate(() => {
          ran = true
          resolve(ran)
        })
      })
    `)

    const mod = await loader.load('/index')
    const result = await (mod.exports as unknown as Promise<unknown>)
    expect(result).toBe(true)
  })

  it('setInterval ticks until cleared', async () => {
    const vfs = new VirtualFileSystem()
    const loader = createLoader(vfs)

    vfs.writeFile('/index', `
      const timers = require('timers')
      let count = 0
      module.exports = new Promise((resolve) => {
        const id = timers.setInterval(() => {
          count += 1
          if (count === 2) {
            timers.clearInterval(id)
            resolve(count)
          }
        }, 1)
      })
    `)

    const mod = await loader.load('/index')
    const result = await (mod.exports as unknown as Promise<unknown>)
    expect(result).toBe(2)
  })

  it('node:timers alias works', async () => {
    const vfs = new VirtualFileSystem()
    const loader = createLoader(vfs)

    vfs.writeFile('/index', `
      const timers = require('node:timers')
      module.exports = typeof timers.setTimeout === 'function'
    `)

    const mod = await loader.load('/index')
    expect(mod.exports).toBe(true)
  })

  it('process.nextTick runs before Promise microtask', async () => {
    const vfs = new VirtualFileSystem()
    const polyfill = createBunRuntime(vfs, {}, () => {}, () => {})

    const order: string[] = []
    polyfill.process.nextTick(() => order.push('tick'))
    Promise.resolve().then(() => order.push('promise'))

    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(order[0]).toBe('tick')
  })
})
