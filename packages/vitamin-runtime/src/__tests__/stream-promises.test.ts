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

describe('stream/promises module', () => {
  it('pipeline resolves', async () => {
    const vfs = new VirtualFileSystem()
    const polyfill = createBunRuntime(vfs, {}, () => {}, () => {})
    const core = createCoreModules(vfs, polyfill)

    const stream = core.stream as {
      Readable: new () => { on: (e: string, cb: (d?: unknown) => void) => void; push: (d: unknown) => void }
      Writable: new (opts?: { write?: (c: unknown) => void }) => { on: (e: string, cb: () => void) => void; end: () => void }
      Transform: new (opts?: { transform?: (c: unknown) => unknown }) => { on: (e: string, cb: (d?: unknown) => void) => void; write: (d: unknown) => boolean; end: () => void }
    }
    const streamPromises = core['stream/promises'] as { pipeline: (...streams: Array<unknown>) => Promise<void> }

    const readable = new stream.Readable()
    const transform = new stream.Transform({ transform: (chunk) => String(chunk).toUpperCase() })
    const output: unknown[] = []
    const writable = new stream.Writable({ write: (chunk) => output.push(chunk) })

    const done = streamPromises.pipeline(readable, transform, writable)
    readable.push('ok')
    readable.push(null)

    await expect(done).resolves.toBeUndefined()
    expect(output).toEqual(['OK'])
  })

  it('finished resolves', async () => {
    const vfs = new VirtualFileSystem()
    const polyfill = createBunRuntime(vfs, {}, () => {}, () => {})
    const core = createCoreModules(vfs, polyfill)

    const stream = core.stream as { Writable: new () => { end: () => void } }
    const streamPromises = core['stream/promises'] as { finished: (input: unknown) => Promise<void> }

    const writable = new stream.Writable()
    const done = streamPromises.finished(writable)
    writable.end()
    await expect(done).resolves.toBeUndefined()
  })

  it('resolves node:stream/promises alias', async () => {
    const vfs = new VirtualFileSystem()
    vfs.writeFile('/index', "module.exports = require('node:stream/promises')")

    const loader = createLoader(vfs)
    const mod = await loader.load('/index')
    expect((mod.exports as { pipeline?: unknown }).pipeline).toBeTypeOf('function')
  })
})
