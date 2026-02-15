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

describe('stream/web module', () => {
  it('re-exports Web Streams globals when available', () => {
    const vfs = new VirtualFileSystem()
    const polyfill = createBunRuntime(vfs, {}, () => {}, () => {})
    const core = createCoreModules(vfs, polyfill)

    const streamWeb = core['stream/web'] as {
      ReadableStream?: unknown
      WritableStream?: unknown
      TransformStream?: unknown
      TextEncoderStream?: unknown
      TextDecoderStream?: unknown
      CompressionStream?: unknown
      DecompressionStream?: unknown
    }

    if (globalThis.ReadableStream) {
      expect(streamWeb.ReadableStream).toBe(globalThis.ReadableStream)
    } else {
      expect(streamWeb.ReadableStream).toBeUndefined()
    }

    if (globalThis.WritableStream) {
      expect(streamWeb.WritableStream).toBe(globalThis.WritableStream)
    } else {
      expect(streamWeb.WritableStream).toBeUndefined()
    }

    if (globalThis.TransformStream) {
      expect(streamWeb.TransformStream).toBe(globalThis.TransformStream)
    } else {
      expect(streamWeb.TransformStream).toBeUndefined()
    }

    if ('TextEncoderStream' in globalThis) {
      expect(streamWeb.TextEncoderStream).toBe((globalThis as typeof globalThis & { TextEncoderStream?: unknown }).TextEncoderStream)
    } else {
      expect(streamWeb.TextEncoderStream).toBeUndefined()
    }
  })

  it('resolves node:stream/web alias', async () => {
    const vfs = new VirtualFileSystem()
    vfs.writeFile('/index', "module.exports = require('node:stream/web')")

    const loader = createLoader(vfs)
    const mod = await loader.load('/index')
    expect((mod.exports as { ReadableStream?: unknown }).ReadableStream).toBe(globalThis.ReadableStream)
  })
})
