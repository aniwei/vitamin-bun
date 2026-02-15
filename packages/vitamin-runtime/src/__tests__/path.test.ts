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

describe('path module', () => {
  it('parse and format works', () => {
    const vfs = new VirtualFileSystem()
    const polyfill = createBunRuntime(vfs, {}, () => {}, () => {})
    const core = createCoreModules(vfs, polyfill)

    const path = core.path as { parse: (p: string) => { base: string }; format: (o: { dir: string; base: string }) => string }
    const parsed = path.parse('/a/b.txt')
    expect(parsed.base).toBe('b.txt')
    expect(path.format({ dir: '/a', base: 'b.txt' })).toBe('/a/b.txt')
  })

  it('resolves node:path alias', async () => {
    const vfs = new VirtualFileSystem()
    vfs.writeFile('/index', "module.exports = require('node:path')")

    const loader = createLoader(vfs)
    const mod = await loader.load('/index')
    expect((mod.exports as { parse?: unknown }).parse).toBeTypeOf('function')
  })
})
