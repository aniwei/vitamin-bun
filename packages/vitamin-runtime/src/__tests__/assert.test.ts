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

describe('assert module', () => {
  it('ok/strictEqual/notStrictEqual works', () => {
    const vfs = new VirtualFileSystem()
    const polyfill = createBunRuntime(vfs, {}, () => {}, () => {})
    const core = createCoreModules(vfs, polyfill)

    const assert = core.assert as {
      ok: (value: unknown) => void
      strictEqual: (actual: unknown, expected: unknown) => void
      notStrictEqual: (actual: unknown, expected: unknown) => void
    }

    expect(() => assert.ok(true)).not.toThrow()
    expect(() => assert.strictEqual(1, 1)).not.toThrow()
    expect(() => assert.notStrictEqual(1, 2)).not.toThrow()
  })

  it('throws matches errors', () => {
    const vfs = new VirtualFileSystem()
    const polyfill = createBunRuntime(vfs, {}, () => {}, () => {})
    const core = createCoreModules(vfs, polyfill)

    const assert = core.assert as { throws: (fn: () => void, error?: RegExp) => void }
    expect(() => assert.throws(() => {
      throw new Error('boom')
    }, /boom/)).not.toThrow()
  })

  it('rejects matches errors', async () => {
    const vfs = new VirtualFileSystem()
    const polyfill = createBunRuntime(vfs, {}, () => {}, () => {})
    const core = createCoreModules(vfs, polyfill)

    const assert = core.assert as { rejects: (promise: Promise<unknown>, error?: RegExp) => Promise<void> }
    await expect(assert.rejects(Promise.reject(new Error('nope')), /nope/)).resolves.toBeUndefined()
  })

  it('resolves node:assert alias', async () => {
    const vfs = new VirtualFileSystem()
    vfs.writeFile('/index', "module.exports = require('node:assert')")

    const loader = createLoader(vfs)
    const mod = await loader.load('/index')
    expect((mod.exports as { ok?: unknown }).ok).toBeTypeOf('function')
  })
})
