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

describe('stream module', () => {
  it('Readable emits data and end', () => {
    const vfs = new VirtualFileSystem()
    const polyfill = createBunRuntime(vfs, {}, () => {}, () => {})
    const core = createCoreModules(vfs, polyfill)

    const stream = core.stream as { Readable: new () => { on: (e: string, cb: (data?: unknown) => void) => void; push: (d: unknown) => void } }
    const readable = new stream.Readable()
    const chunks: unknown[] = []

    readable.on('data', (chunk) => chunks.push(chunk))
    readable.on('end', () => chunks.push('end'))

    readable.push('hello')
    readable.push(null)

    expect(chunks).toEqual(['hello', 'end'])
  })

  it('Writable emits finish', () => {
    const vfs = new VirtualFileSystem()
    const polyfill = createBunRuntime(vfs, {}, () => {}, () => {})
    const core = createCoreModules(vfs, polyfill)

    const stream = core.stream as { Writable: new (opts?: { write?: (c: unknown) => void }) => { on: (e: string, cb: () => void) => void; write: (d: unknown) => boolean; end: () => void } }
    const chunks: unknown[] = []
    const writable = new stream.Writable({ write: (chunk) => chunks.push(chunk) })

    let finished = false
    writable.on('finish', () => {
      finished = true
    })

    writable.write('a')
    writable.end()

    expect(chunks).toEqual(['a'])
    expect(finished).toBe(true)
  })

  it('Transform transforms data', () => {
    const vfs = new VirtualFileSystem()
    const polyfill = createBunRuntime(vfs, {}, () => {}, () => {})
    const core = createCoreModules(vfs, polyfill)

    const stream = core.stream as { Transform: new (opts?: { transform?: (c: unknown) => unknown }) => { on: (e: string, cb: (d?: unknown) => void) => void; write: (d: unknown) => boolean; end: () => void } }
    const transform = new stream.Transform({ transform: (chunk) => String(chunk).toUpperCase() })
    const out: unknown[] = []

    transform.on('data', (chunk) => out.push(chunk))
    transform.on('end', () => out.push('end'))

    transform.write('hi')
    transform.end()

    expect(out).toEqual(['HI', 'end'])
  })

  it('pipeline chains streams', async () => {
    const vfs = new VirtualFileSystem()
    const polyfill = createBunRuntime(vfs, {}, () => {}, () => {})
    const core = createCoreModules(vfs, polyfill)

    const stream = core.stream as {
      Readable: new () => { on: (e: string, cb: (d?: unknown) => void) => void; push: (d: unknown) => void }
      Writable: new (opts?: { write?: (c: unknown) => void }) => { on: (e: string, cb: () => void) => void; end: () => void }
      Transform: new (opts?: { transform?: (c: unknown) => unknown }) => { on: (e: string, cb: (d?: unknown) => void) => void; write: (d: unknown) => boolean; end: () => void }
      pipeline: (...streams: Array<unknown>) => Promise<void>
    }

    const readable = new stream.Readable()
    const transform = new stream.Transform({ transform: (chunk) => String(chunk).toUpperCase() })
    const output: unknown[] = []
    const writable = new stream.Writable({ write: (chunk) => output.push(chunk) })

    const done = stream.pipeline(readable, transform, writable)
    readable.push('ok')
    readable.push(null)

    await expect(done).resolves.toBeUndefined()
    expect(output).toEqual(['OK'])
  })

  it('pipe respects backpressure and resumes', async () => {
    const vfs = new VirtualFileSystem()
    const polyfill = createBunRuntime(vfs, {}, () => {}, () => {})
    const core = createCoreModules(vfs, polyfill)

    const stream = core.stream as {
      Readable: new () => { push: (d: unknown) => void; pipe: (dest: unknown) => unknown }
      Writable: new (opts?: { write?: (c: unknown, _e?: string, cb?: (err?: Error | null) => void) => void; highWaterMark?: number }) => {
        on: (e: string, cb: () => void) => void
        write: (d: unknown) => boolean
      }
    }

    const readable = new stream.Readable()
    const output: unknown[] = []
    const writable = new stream.Writable({
      highWaterMark: 1,
      write: (chunk, _encoding, cb) => {
        output.push(chunk)
        cb?.()
      },
    })

    let drained = false
    writable.on('drain', () => {
      drained = true
    })

    readable.pipe(writable)
    readable.push('a')
    readable.push('b')

    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(output).toEqual(['a', 'b'])
    expect(drained).toBe(true)
  })

  it('resolves node:stream alias', async () => {
    const vfs = new VirtualFileSystem()
    vfs.writeFile('/index', "module.exports = require('node:stream')")

    const loader = createLoader(vfs)
    const mod = await loader.load('/index')
    expect((mod.exports as { Readable?: unknown }).Readable).toBeTypeOf('function')
  })
})
