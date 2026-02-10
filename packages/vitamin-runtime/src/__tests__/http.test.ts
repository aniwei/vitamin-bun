import { describe, it, expect, vi, afterEach } from 'vitest'
import { VirtualFileSystem } from '../../../virtual-fs/src/index'
import { createBunRuntime } from '../vitamin-runtime'
import { createCoreModules } from '../core-modules/index'
import { ModuleLoader } from '../module-loader'
import { Transpiler } from '../transpiler'

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
})

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

describe('http/https modules', () => {
  it('http.get triggers response callback', async () => {
    globalThis.fetch = vi.fn(async () => new Response('ok', { status: 200, headers: { 'x-test': '1' } }))

    const vfs = new VirtualFileSystem()
    const polyfill = createBunRuntime(vfs, {}, () => {}, () => {})
    const core = createCoreModules(vfs, polyfill)

    const http = core.http as { get: (url: string, cb: (res: { statusCode: number; text: () => Promise<string> }) => void) => void }

    await new Promise<void>((resolve) => {
      http.get('https://example.com', async (res) => {
        expect(res.statusCode).toBe(200)
        const text = await res.text()
        expect(text).toBe('ok')
        resolve()
      })
    })
  })

  it('resolves node:http and node:https alias', async () => {
    const vfs = new VirtualFileSystem()
    vfs.writeFile('/index', "module.exports = { http: require('node:http'), https: require('node:https') }")

    const loader = createLoader(vfs)
    const mod = await loader.load('/index')
    const out = mod.exports as { http: { get?: unknown }; https: { get?: unknown } }
    expect(out.http.get).toBeTypeOf('function')
    expect(out.https.get).toBeTypeOf('function')
  })
})
