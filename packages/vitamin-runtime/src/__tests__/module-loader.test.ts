import { describe, it, expect } from 'vitest'
import { VirtualFileSystem } from '../../../virtual-fs/src/index'
import { ModuleLoader } from '../module-loader'
import { Transpiler } from '../transpiler'

function createRuntime() {
  return {
    Bun: {},
    process: { env: {}, argv: [], cwd: () => '/' },
    console,
  }
}

describe('ModuleLoader', () => {
  it('loads and executes a module with dependencies', async () => {
    const vfs = new VirtualFileSystem()
    vfs.writeFile('/dep.ts', 'export const value: number = 41 + 1')
    vfs.writeFile('/index.ts', `import { value } from './dep'; export const result = value;`)

    const loader = new ModuleLoader({
      vfs,
      transpiler: new Transpiler(),
      runtime: createRuntime(),
    })

    const mod = await loader.load('/index.ts')
    expect((mod.exports as { result?: number }).result).toBe(42)
  })

  it('resolves index files', async () => {
    const vfs = new VirtualFileSystem()
    vfs.mkdirp('/pkg')
    vfs.writeFile('/pkg/index.ts', 'export const ok = true')

    const loader = new ModuleLoader({
      vfs,
      transpiler: new Transpiler(),
      runtime: createRuntime(),
    })

    const mod = await loader.load('/pkg')
    expect((mod.exports as { ok?: boolean }).ok).toBe(true)
  })

  it('invokes onModuleRequest hook for custom modules', async () => {
    const vfs = new VirtualFileSystem()
    vfs.writeFile('/index.ts', `const native = require('native:demo'); export const value = native.value;`)

    const loader = new ModuleLoader({
      vfs,
      transpiler: new Transpiler(),
      runtime: createRuntime(),
      hooks: {
        onModuleRequest: (id) => {
          if (id === 'native:demo') {
            return { exports: { value: 42 } }
          }
        },
      },
    })

    const mod = await loader.load('/index.ts')
    expect((mod.exports as { value?: number }).value).toBe(42)
  })

  it('resolves bare node_modules packages', async () => {
    const vfs = new VirtualFileSystem()
    vfs.mkdirp('/node_modules/hono')
    vfs.writeFile('/node_modules/hono/package.json', JSON.stringify({ main: './index.js' }))
    vfs.writeFile('/node_modules/hono/index.js', 'module.exports = { ok: true }')
    vfs.writeFile('/index.ts', `const hono = require('hono'); export const ok = hono.ok;`)

    const loader = new ModuleLoader({
      vfs,
      transpiler: new Transpiler(),
      runtime: createRuntime(),
    })

    const mod = await loader.load('/index.ts')
    expect((mod.exports as { ok?: boolean }).ok).toBe(true)
  })
})
