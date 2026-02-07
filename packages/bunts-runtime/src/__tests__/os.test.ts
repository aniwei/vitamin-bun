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

describe('os module', () => {
  it('platform/arch/homedir/tmpdir/EOL works', () => {
    const vfs = new VirtualFileSystem()
    const polyfill = createPolyfill(vfs, {}, () => {}, () => {})
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
    vfs.writeFile('/index.js', "module.exports = require('node:os')")

    const loader = createLoader(vfs)
    const mod = await loader.load('/index.js')
    expect((mod.exports as { platform?: unknown }).platform).toBeTypeOf('function')
  })
})
