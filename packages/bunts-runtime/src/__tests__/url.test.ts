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

describe('url module', () => {
  it('pathToFileURL and fileURLToPath works', () => {
    const vfs = new VirtualFileSystem()
    const polyfill = createPolyfill(vfs, {}, () => {}, () => {})
    const core = createCoreModules(vfs, polyfill)

    const url = core.url as { pathToFileURL: (path: string) => URL; fileURLToPath: (u: string | URL) => string }
    const fileUrl = url.pathToFileURL('/data.txt')
    expect(fileUrl.href.startsWith('file://')).toBe(true)
    expect(url.fileURLToPath(fileUrl)).toBe('/data.txt')
  })

  it('resolves node:url alias', async () => {
    const vfs = new VirtualFileSystem()
    vfs.writeFile('/index.js', "module.exports = require('node:url')")

    const loader = createLoader(vfs)
    const mod = await loader.load('/index.js')
    expect((mod.exports as { pathToFileURL?: unknown }).pathToFileURL).toBeTypeOf('function')
  })
})
