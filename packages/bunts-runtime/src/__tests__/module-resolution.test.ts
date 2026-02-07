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

describe('ModuleLoader package.json resolution', () => {
  it('resolves main field', async () => {
    const vfs = new VirtualFileSystem()
    vfs.mkdirp('/pkg')
    vfs.writeFile('/pkg/package.json', JSON.stringify({ main: 'dist/index' }))
    vfs.mkdirp('/pkg/dist')
    vfs.writeFile('/pkg/dist/index', 'module.exports = { ok: true }')

    const loader = new ModuleLoader({
      vfs,
      transpiler: new Transpiler(),
      runtime: createRuntime(),
    })

    const mod = await loader.load('/pkg')
    expect((mod.exports as { ok?: boolean }).ok).toBe(true)
  })

  it('prefers module field over main', async () => {
    const vfs = new VirtualFileSystem()
    vfs.mkdirp('/pkg')
    vfs.writeFile('/pkg/package.json', JSON.stringify({ module: 'esm/index', main: 'cjs/index' }))
    vfs.mkdirp('/pkg/esm')
    vfs.mkdirp('/pkg/cjs')
    vfs.writeFile('/pkg/esm/index', 'module.exports = { kind: "esm" }')
    vfs.writeFile('/pkg/cjs/index', 'module.exports = { kind: "cjs" }')

    const loader = new ModuleLoader({
      vfs,
      transpiler: new Transpiler(),
      runtime: createRuntime(),
    })

    const mod = await loader.load('/pkg')
    expect((mod.exports as { kind?: string }).kind).toBe('esm')
  })

  it('resolves exports field', async () => {
    const vfs = new VirtualFileSystem()
    vfs.mkdirp('/pkg')
    vfs.writeFile('/pkg/package.json', JSON.stringify({ exports: { '.': './src/index' } }))
    vfs.mkdirp('/pkg/src')
    vfs.writeFile('/pkg/src/index', 'module.exports = { ok: "exports" }')

    const loader = new ModuleLoader({
      vfs,
      transpiler: new Transpiler(),
      runtime: createRuntime(),
    })

    const mod = await loader.load('/pkg')
    expect((mod.exports as { ok?: string }).ok).toBe('exports')
  })
})
