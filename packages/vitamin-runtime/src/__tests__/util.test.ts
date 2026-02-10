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

describe('util module', () => {
  it('format works', () => {
    const vfs = new VirtualFileSystem()
    const polyfill = createBunRuntime(vfs, {}, () => {}, () => {})
    const core = createCoreModules(vfs, polyfill)

    const util = core.util as { format: (...args: unknown[]) => string }
    expect(util.format('hello %s', 'world')).toBe('hello world')
  })

  it('inspect works', () => {
    const vfs = new VirtualFileSystem()
    const polyfill = createBunRuntime(vfs, {}, () => {}, () => {})
    const core = createCoreModules(vfs, polyfill)

    const util = core.util as { inspect: (value: unknown) => string }
    expect(util.inspect({ a: 1 })).toContain('a: 1')
  })

  it('types works', () => {
    const vfs = new VirtualFileSystem()
    const polyfill = createBunRuntime(vfs, {}, () => {}, () => {})
    const core = createCoreModules(vfs, polyfill)

    const util = core.util as { types: { isDate: (v: unknown) => boolean } }
    expect(util.types.isDate(new Date())).toBe(true)
  })

  it('resolves node:util alias', async () => {
    const vfs = new VirtualFileSystem()
    vfs.writeFile('/index', "module.exports = require('node:util')")

    const loader = createLoader(vfs)
    const mod = await loader.load('/index')
    expect((mod.exports as { format?: unknown }).format).toBeTypeOf('function')
  })
})
