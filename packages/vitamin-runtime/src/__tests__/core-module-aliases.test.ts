import { describe, it, expect } from 'vitest'
import { VirtualFileSystem } from '../../../virtual-fs/src/index'
import { ModuleLoader } from '../module-loader'
import { Transpiler } from '../transpiler'
import { createBunRuntime } from '../vitamin-runtime'
import { createCoreModules } from '../core-modules/index'

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

describe('Core module aliases', () => {
  it('resolves node:fs', async () => {
    const vfs = new VirtualFileSystem()
    vfs.writeFile('/index', "module.exports = require('node:fs')")

    const loader = createLoader(vfs)
    const mod = await loader.load('/index')
    expect((mod.exports as { readFileSync?: unknown }).readFileSync).toBeTypeOf('function')
  })

  it('resolves fs/promises', async () => {
    const vfs = new VirtualFileSystem()
    vfs.writeFile('/data.txt', 'hello')
    vfs.writeFile('/index', `
      const fsp = require('fs/promises')
      module.exports = fsp
    `)

    const loader = createLoader(vfs)
    const mod = await loader.load('/index')
    const fsp = mod.exports as { readFile?: (path: string, enc?: string) => Promise<string | Uint8Array> }
    const text = await fsp.readFile?.('/data.txt', 'utf-8')
    expect(text).toBe('hello')
  })

  it('resolves path/posix and path/win32', async () => {
    const vfs = new VirtualFileSystem()
    vfs.writeFile('/index', `
      const posix = require('path/posix')
      const win32 = require('path/win32')
      module.exports = { posix, win32 }
    `)

    const loader = createLoader(vfs)
    const mod = await loader.load('/index')
    const out = mod.exports as { posix: { join: (...parts: string[]) => string }; win32: { join: (...parts: string[]) => string } }

    expect(out.posix.join('/a', 'b')).toBe('/a/b')
    expect(out.win32.join('/a', 'b')).toBe('/a/b')
  })
})
