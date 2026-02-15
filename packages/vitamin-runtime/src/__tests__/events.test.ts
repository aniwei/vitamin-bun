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

describe('Events module', () => {
  it('on/emit works', async () => {
    const vfs = new VirtualFileSystem()
    const loader = createLoader(vfs)

    vfs.writeFile('/index', `
      const { EventEmitter } = require('events')
      const ee = new EventEmitter()
      let count = 0
      ee.on('data', () => count += 1)
      ee.emit('data')
      ee.emit('data')
      module.exports = count
    `)

    const mod = await loader.load('/index')
    expect(mod.exports).toBe(2)
  })

  it('once only fires once', async () => {
    const vfs = new VirtualFileSystem()
    const loader = createLoader(vfs)

    vfs.writeFile('/index', `
      const { EventEmitter } = require('events')
      const ee = new EventEmitter()
      let count = 0
      ee.once('data', () => count += 1)
      ee.emit('data')
      ee.emit('data')
      module.exports = count
    `)

    const mod = await loader.load('/index')
    expect(mod.exports).toBe(1)
  })

  it('node:events alias works', async () => {
    const vfs = new VirtualFileSystem()
    const loader = createLoader(vfs)

    vfs.writeFile('/index', `
      const events = require('node:events')
      module.exports = typeof events.EventEmitter === 'function'
    `)

    const mod = await loader.load('/index')
    expect(mod.exports).toBe(true)
  })
})
