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

describe('ESM execution and interop', () => {
  it('supports named exports', async () => {
    const vfs = new VirtualFileSystem()
    vfs.writeFile('/a.ts', 'export const x = 1')
    vfs.writeFile('/b.ts', "import { x } from './a'; export const y = x + 1")

    const loader = new ModuleLoader({
      vfs,
      transpiler: new Transpiler(),
      runtime: createRuntime(),
    })

    const mod = await loader.load('/b.ts')
    expect((mod.exports as { y?: number }).y).toBe(2)
  })

  it('supports default exports', async () => {
    const vfs = new VirtualFileSystem()
    vfs.writeFile('/a.ts', 'export default function(){ return 7 }')
    vfs.writeFile('/b.ts', "import foo from './a'; export const y = foo();")

    const loader = new ModuleLoader({
      vfs,
      transpiler: new Transpiler(),
      runtime: createRuntime(),
    })

    const mod = await loader.load('/b.ts')
    expect((mod.exports as { y?: number }).y).toBe(7)
  })

  it('CJS require ESM returns default and named exports', async () => {
    const vfs = new VirtualFileSystem()
    vfs.writeFile('/esm.ts', 'export const x = 3; export default 9')
    vfs.writeFile('/cjs', "const esm = require('./esm'); module.exports = esm;")

    const loader = new ModuleLoader({
      vfs,
      transpiler: new Transpiler(),
      runtime: createRuntime(),
    })

    const mod = await loader.load('/cjs')
    const exportsObj = mod.exports as { x?: number; default?: number }
    expect(exportsObj.x).toBe(3)
    expect(exportsObj.default).toBe(9)
  })

  it('ESM import CJS maps to default export', async () => {
    const vfs = new VirtualFileSystem()
    vfs.writeFile('/cjs.cjs', 'module.exports = { x: 5 }')
    vfs.writeFile('/esm.ts', "import foo from './cjs.cjs'; export const y = foo.x;")

    const loader = new ModuleLoader({
      vfs,
      transpiler: new Transpiler(),
      runtime: createRuntime(),
    })

    const mod = await loader.load('/esm.ts')
    expect((mod.exports as { y?: number }).y).toBe(5)
  })

  it('supports dynamic import', async () => {
    const vfs = new VirtualFileSystem()
    vfs.writeFile('/dep.ts', 'export const x = 2')
    vfs.writeFile('/index.ts', "export async function run(){ const mod = await import('./dep'); return mod.x }")

    const loader = new ModuleLoader({
      vfs,
      transpiler: new Transpiler(),
      runtime: createRuntime(),
    })

    const mod = await loader.load('/index.ts')
    const run = (mod.exports as { run?: () => Promise<number> }).run
    expect(await run?.()).toBe(2)
  })
})