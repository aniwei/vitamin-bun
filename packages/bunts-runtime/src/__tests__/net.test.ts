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

describe('net/tls modules', () => {
  it('connect returns socket stub', () => {
    const vfs = new VirtualFileSystem()
    const polyfill = createPolyfill(vfs, {}, () => {}, () => {})
    const core = createCoreModules(vfs, polyfill)

    const net = core.net as { connect: () => { on: () => void; write: () => void; end: () => void } }
    const socket = net.connect()
    expect(typeof socket.on).toBe('function')
    expect(typeof socket.write).toBe('function')
    expect(typeof socket.end).toBe('function')
  })

  it('resolves node:net and node:tls alias', async () => {
    const vfs = new VirtualFileSystem()
    vfs.writeFile('/index', "module.exports = { net: require('node:net'), tls: require('node:tls') }")

    const loader = createLoader(vfs)
    const mod = await loader.load('/index')
    const out = mod.exports as { net: { connect?: unknown }; tls: { connect?: unknown } }
    expect(out.net.connect).toBeTypeOf('function')
    expect(out.tls.connect).toBeTypeOf('function')
  })
})
