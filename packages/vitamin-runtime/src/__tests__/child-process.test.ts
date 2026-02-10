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

describe('child_process core module', () => {
  it('exec returns error callback payload', async () => {
    const vfs = new VirtualFileSystem()
    vfs.writeFile(
      '/index',
      "const cp = require('child_process'); cp.exec('echo hi', (err, out, errOut) => { globalThis.__result = { err, out, errOut }; });",
    )

    const loader = createLoader(vfs)
    await loader.load('/index')

    const result = (globalThis as { __result?: { err?: { code?: string; errno?: string }; out?: string; errOut?: string } }).__result
    expect(result?.err?.code).toBe('ERR_CHILD_PROCESS_UNSUPPORTED')
    expect(result?.err?.errno).toBe('ENOSYS')
    expect(result?.out).toBe('')
    expect(result?.errOut).toContain('child_process is not supported')
  })

  it('spawn emits error event', async () => {
    const vfs = new VirtualFileSystem()
    vfs.writeFile(
      '/index',
      "const cp = require('child_process'); const child = cp.spawn('echo'); child.on('error', (err) => { globalThis.__err = err; });",
    )

    const loader = createLoader(vfs)
    await loader.load('/index')

    await new Promise((resolve) => queueMicrotask(resolve))

    const error = (globalThis as { __err?: { code?: string; errno?: string } }).__err
    expect(error?.code).toBe('ERR_CHILD_PROCESS_UNSUPPORTED')
    expect(error?.errno).toBe('ENOSYS')
  })
})
