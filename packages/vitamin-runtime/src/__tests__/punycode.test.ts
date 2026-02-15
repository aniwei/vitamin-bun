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

describe('punycode module', () => {
  it('toASCII/toUnicode returns strings', () => {
    const vfs = new VirtualFileSystem()
    const polyfill = createBunRuntime(vfs, {}, () => {}, () => {})
    const core = createCoreModules(vfs, polyfill)

    const punycode = core.punycode as { toASCII: (d: string) => string; toUnicode: (d: string) => string }
    expect(typeof punycode.toASCII('例子.测试')).toBe('string')
    expect(typeof punycode.toUnicode('xn--fsqu00a.xn--0zwm56d')).toBe('string')
  })

  it('resolves node:punycode alias', async () => {
    const vfs = new VirtualFileSystem()
    vfs.writeFile('/index', "module.exports = require('node:punycode')")

    const loader = createLoader(vfs)
    const mod = await loader.load('/index')
    expect((mod.exports as { toASCII?: unknown }).toASCII).toBeTypeOf('function')
  })
})
