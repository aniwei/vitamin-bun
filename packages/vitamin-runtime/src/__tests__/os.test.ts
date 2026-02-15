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

describe('os module', () => {
  it('platform/arch/homedir/tmpdir/EOL works', () => {
    const vfs = new VirtualFileSystem()
    const polyfill = createBunRuntime(vfs, {}, () => {}, () => {})
    const core = createCoreModules(vfs, polyfill)

    const os = core.os as {
      platform: () => string
      arch: () => string
      homedir: () => string
      tmpdir: () => string
      EOL: string
    }

    expect(os.platform()).toBe('browser')
    expect(os.arch()).toBe('wasm')
    expect(os.homedir()).toBe('/')
    expect(os.tmpdir()).toBe('/tmp')
    expect(os.EOL).toBe('\n')
  })

  it('resolves node:os alias', async () => {
    const vfs = new VirtualFileSystem()
    vfs.writeFile('/index', "module.exports = require('node:os')")

    const loader = createLoader(vfs)
    const mod = await loader.load('/index')
    expect((mod.exports as { platform?: unknown }).platform).toBeTypeOf('function')
  })
})
