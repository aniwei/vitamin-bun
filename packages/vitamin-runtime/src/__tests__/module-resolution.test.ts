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

  it('resolves conditional exports based on parent module type', async () => {
    const vfs = new VirtualFileSystem()
    vfs.mkdirp('/node_modules/demo')
    vfs.writeFile(
      '/node_modules/demo/package.json',
      JSON.stringify({ exports: { '.': { import: './esm.js', require: './cjs.js' } } }),
    )
    vfs.writeFile('/node_modules/demo/esm.js', 'module.exports = { kind: "esm" }')
    vfs.writeFile('/node_modules/demo/cjs.js', 'module.exports = { kind: "cjs" }')
    vfs.writeFile('/index.mjs', "import demo from 'demo'; export const kind = demo.kind;")

    const loader = new ModuleLoader({
      vfs,
      transpiler: new Transpiler(),
      runtime: createRuntime(),
    })

    const mod = await loader.load('/index.mjs')
    expect((mod.exports as { kind?: string }).kind).toBe('esm')
  })

  it('resolves nested default exports conditions', async () => {
    const vfs = new VirtualFileSystem()
    vfs.mkdirp('/node_modules/feature')
    vfs.writeFile(
      '/node_modules/feature/package.json',
      JSON.stringify({
        exports: {
          '.': {
            import: { default: './esm.js' },
            require: './cjs.js',
          },
        },
      }),
    )
    vfs.writeFile('/node_modules/feature/esm.js', 'module.exports = { kind: "esm-default" }')
    vfs.writeFile('/node_modules/feature/cjs.js', 'module.exports = { kind: "cjs" }')
    vfs.writeFile('/index.mjs', "import feature from 'feature'; export const kind = feature.kind;")

    const loader = new ModuleLoader({
      vfs,
      transpiler: new Transpiler(),
      runtime: createRuntime(),
    })

    const mod = await loader.load('/index.mjs')
    expect((mod.exports as { kind?: string }).kind).toBe('esm-default')
  })

  it('resolves subpath exports with default condition', async () => {
    const vfs = new VirtualFileSystem()
    vfs.mkdirp('/node_modules/feature')
    vfs.writeFile(
      '/node_modules/feature/package.json',
      JSON.stringify({
        exports: {
          './subpath': { default: './subpath.js' },
        },
      }),
    )
    vfs.writeFile('/node_modules/feature/subpath.js', 'module.exports = { ok: true }')
    vfs.writeFile('/index.cjs', "const mod = require('feature/subpath'); module.exports = mod;")

    const loader = new ModuleLoader({
      vfs,
      transpiler: new Transpiler(),
      runtime: createRuntime(),
    })

    const mod = await loader.load('/index.cjs')
    expect((mod.exports as { ok?: boolean }).ok).toBe(true)
  })
})
