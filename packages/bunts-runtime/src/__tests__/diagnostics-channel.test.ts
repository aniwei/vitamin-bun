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

describe('diagnostics_channel module', () => {
  it('channel supports subscribe/unsubscribe', () => {
    const vfs = new VirtualFileSystem()
    const polyfill = createPolyfill(vfs, {}, () => {}, () => {})
    const core = createCoreModules(vfs, polyfill)

    const diagnostics = core.diagnostics_channel as {
      channel: (name: string) => { subscribe: (fn: (msg: unknown) => void) => void; unsubscribe: (fn: (msg: unknown) => void) => void; publish: (msg: unknown) => void }
    }

    const channel = diagnostics.channel('test')
    const received: unknown[] = []
    const fn = (msg: unknown) => received.push(msg)

    channel.subscribe(fn)
    channel.publish('ok')
    channel.unsubscribe(fn)
    channel.publish('skip')

    expect(received).toEqual(['ok'])
  })

  it('resolves node:diagnostics_channel alias', async () => {
    const vfs = new VirtualFileSystem()
    vfs.writeFile('/index.js', "module.exports = require('node:diagnostics_channel')")

    const loader = createLoader(vfs)
    const mod = await loader.load('/index.js')
    expect((mod.exports as { channel?: unknown }).channel).toBeTypeOf('function')
  })
})
