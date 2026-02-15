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

describe('perf_hooks module', () => {
  it('performance.now/timeOrigin works', () => {
    const vfs = new VirtualFileSystem()
    const polyfill = createBunRuntime(vfs, {}, () => {}, () => {})
    const core = createCoreModules(vfs, polyfill)

    const perfHooks = core.perf_hooks as { performance: { now: () => number; timeOrigin: number } }
    expect(typeof perfHooks.performance.now()).toBe('number')
    expect(typeof perfHooks.performance.timeOrigin).toBe('number')
  })

  it('records mark/measure entries', () => {
    const vfs = new VirtualFileSystem()
    const polyfill = createBunRuntime(vfs, {}, () => {}, () => {})
    const core = createCoreModules(vfs, polyfill)

    const perfHooks = core.perf_hooks as {
      performance: {
        mark: (name: string) => void
        measure: (name: string, start?: string, end?: string) => void
        getEntriesByType: (type: string) => Array<{ name: string; entryType: string }>
      }
    }

    perfHooks.performance.mark('start')
    perfHooks.performance.measure('work', 'start')

    const measures = perfHooks.performance.getEntriesByType('measure')
    expect(measures.some((entry) => entry.name === 'work')).toBe(true)
  })

  it('PerformanceObserver receives measures', async () => {
    const vfs = new VirtualFileSystem()
    const polyfill = createBunRuntime(vfs, {}, () => {}, () => {})
    const core = createCoreModules(vfs, polyfill)

    const perfHooks = core.perf_hooks as {
      performance: { measure: (name: string) => void }
      PerformanceObserver: new (cb: (list: { getEntries: () => Array<{ name: string }> }) => void) => {
        observe: (opts: { entryTypes: string[] }) => void
      }
    }

    const seen: string[] = []
    const observer = new perfHooks.PerformanceObserver((list) => {
      for (const entry of list.getEntries()) seen.push(entry.name)
    })
    observer.observe({ entryTypes: ['measure'] })

    perfHooks.performance.measure('observe-me')
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(seen).toContain('observe-me')
  })

  it('timerify emits function entries', () => {
    const vfs = new VirtualFileSystem()
    const polyfill = createBunRuntime(vfs, {}, () => {}, () => {})
    const core = createCoreModules(vfs, polyfill)

    const perfHooks = core.perf_hooks as {
      timerify: <T extends (...args: unknown[]) => unknown>(fn: T) => T
      performance: { getEntriesByType: (type: string) => Array<{ name: string }> }
    }

    const wrapped = perfHooks.timerify(() => 123)
    wrapped()

    const entries = perfHooks.performance.getEntriesByType('function')
    expect(entries.length).toBeGreaterThan(0)
  })

  it('resolves node:perf_hooks alias', async () => {
    const vfs = new VirtualFileSystem()
    vfs.writeFile('/index', "module.exports = require('node:perf_hooks')")

    const loader = createLoader(vfs)
    const mod = await loader.load('/index')
    expect((mod.exports as { performance?: unknown }).performance).toBeDefined()
  })
})
