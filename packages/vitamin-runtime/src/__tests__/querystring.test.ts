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

describe('querystring module', () => {
  it('parse/stringify works', () => {
    const vfs = new VirtualFileSystem()
    const polyfill = createBunRuntime(vfs, {}, () => {}, () => {})
    const core = createCoreModules(vfs, polyfill)

    const qs = core.querystring as { parse: (s: string) => Record<string, string>; stringify: (o: Record<string, unknown>) => string }
    expect(qs.parse('a=1&b=2')).toEqual({ a: '1', b: '2' })
    const out = qs.stringify({ a: '1', b: '2' })
    expect(out.includes('a=1')).toBe(true)
    expect(out.includes('b=2')).toBe(true)
  })

  it('resolves node:querystring alias', async () => {
    const vfs = new VirtualFileSystem()
    vfs.writeFile('/index', "module.exports = require('node:querystring')")

    const loader = createLoader(vfs)
    const mod = await loader.load('/index')
    expect((mod.exports as { parse?: unknown }).parse).toBeTypeOf('function')
  })
})
