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

describe('fs extra', () => {
  it('stat/mkdir/rm works', () => {
    const vfs = new VirtualFileSystem()
    const polyfill = createBunRuntime(vfs, {}, () => {}, () => {})
    const core = createCoreModules(vfs, polyfill)

    const fs = core.fs as {
      writeFileSync: (path: string, data: string) => void
      statSync: (path: string) => { isFile: () => boolean }
      mkdirSync: (path: string, options?: { recursive?: boolean }) => void
      rmSync: (path: string, options?: { recursive?: boolean }) => void
    }

    fs.mkdirSync('/dir', { recursive: true })
    fs.writeFileSync('/dir/data.txt', 'ok')
    expect(fs.statSync('/dir/data.txt').isFile()).toBe(true)
    fs.rmSync('/dir', { recursive: true })
    expect(vfs.exists('/dir')).toBe(false)
  })

  it('fs/promises stat/mkdir/rm works', async () => {
    const vfs = new VirtualFileSystem()
    const polyfill = createBunRuntime(vfs, {}, () => {}, () => {})
    const core = createCoreModules(vfs, polyfill)

    const fsp = core['fs/promises'] as {
      mkdir: (path: string, options?: { recursive?: boolean }) => Promise<void>
      stat: (path: string) => Promise<{ isFile: () => boolean }>
      rm: (path: string, options?: { recursive?: boolean }) => Promise<void>
    }

    await fsp.mkdir('/dir', { recursive: true })
    vfs.writeFile('/dir/data.txt', 'ok')
    const stats = await fsp.stat('/dir/data.txt')
    expect(stats.isFile()).toBe(true)
    await fsp.rm('/dir', { recursive: true })
    expect(vfs.exists('/dir')).toBe(false)
  })

  it('resolves node:fs and node:fs/promises alias', async () => {
    const vfs = new VirtualFileSystem()
    vfs.writeFile('/index', "module.exports = { fs: require('node:fs'), fsp: require('node:fs/promises') }")

    const loader = createLoader(vfs)
    const mod = await loader.load('/index')
    const out = mod.exports as { fs: { statSync?: unknown }; fsp: { stat?: unknown } }
    expect(out.fs.statSync).toBeTypeOf('function')
    expect(out.fsp.stat).toBeTypeOf('function')
  })
})
