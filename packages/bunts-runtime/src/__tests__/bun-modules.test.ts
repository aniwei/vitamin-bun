import { describe, it, expect } from 'vitest'
import { createRequire } from 'module'
import { VirtualFileSystem } from '../../../virtual-fs/src/index'
import { RuntimeCore } from '../runtime-core'

describe('bun:* modules', () => {
  it('supports bun:glob, bun:semver, bun:transpiler', async () => {
    const vfs = new VirtualFileSystem()
    vfs.mkdirp('/src/nested')
    vfs.mkdirp('/src/__tests__')
    vfs.writeFile('/src/a.ts', 'export const a = 1')
    vfs.writeFile('/src/nested/b.ts', 'export const b = 2')
    vfs.writeFile('/src/.hidden.ts', 'export const hidden = true')
    vfs.writeFile('/src/__tests__/c.ts', 'export const c = 3')

    vfs.writeFile(
      '/index.ts',
      `const glob = require('bun:glob')
    const semver = require('bun:semver')
    const transpiler = require('bun:transpiler')
    const files = glob.glob('src/**/*.ts', { cwd: '/', ignore: 'src/**/__tests__/*' }).sort()
    const dotFiles = glob.glob('src/**/*.ts', { cwd: '/', dot: true, ignore: 'src/**/__tests__/*' }).sort()
    console.log(JSON.stringify(files))
    console.log(JSON.stringify(dotFiles))
    console.log(glob.hasMagic('src/**/*.ts'))
    console.log(glob.match('/src/a.ts', '/src/*.ts'))
    console.log(semver.compare('1.2.0', '1.3.0'))
    console.log(semver.satisfies('1.2.0-beta.1', '>=1.2.0-0'))
    console.log(semver.coerce('v1.2.3')?.version)
    console.log(semver.intersects('^1.2.0', '>=1.2.3'))
    console.log(semver.compareBuild('1.2.3+1', '1.2.3+2'))
    console.log(transpiler.transpile('const a: number = 1').includes(':') ? 'bad' : 'ok')
`,
    )

    const stdout: Uint8Array[] = []
    const runtime = new RuntimeCore({
      vfs,
      onStdout: (data) => stdout.push(data),
    })

    const code = await runtime.exec('bun', ['run', '/index.ts'])
    expect(code).toBe(0)

    const text = new TextDecoder().decode(concat(stdout))
    const lines = text.trim().split('\n')
    expect(lines[0]).toBe('["/src/a.ts","/src/nested/b.ts"]')
    expect(lines[1]).toBe('["/src/.hidden.ts","/src/a.ts","/src/nested/b.ts"]')
    expect(lines[2]).toBe('true')
    expect(lines[3]).toBe('true')
    expect(lines[4]).toBe('-1')
    expect(lines[5]).toBe('true')
    expect(lines[6]).toBe('1.2.3')
    expect(lines[7]).toBe('true')
    expect(lines[8]).toBe('-1')
    expect(lines[9]).toBe('ok')
  })

  it('throws clear errors for bun:ffi', async () => {
    const vfs = new VirtualFileSystem()
    vfs.writeFile(
      '/index.ts',
      `require('bun:ffi')
`,
    )

    const stderr: Uint8Array[] = []
    const runtime = new RuntimeCore({
      vfs,
      onStderr: (data) => stderr.push(data),
    })

    const code = await runtime.exec('bun', ['run', '/index.ts'])
    expect(code).toBe(1)

    const text = new TextDecoder().decode(concat(stderr))
    expect(text).toContain('bun:ffi is not available in browser runtime')
  })

  it('supports bun:sqlite with wasm', async () => {
    const vfs = new VirtualFileSystem()
    vfs.writeFile(
      '/index.ts',
      `const sqlite = require('bun:sqlite')
const db = sqlite.openSync(':memory:')
db.exec('CREATE TABLE demo (id INTEGER, name TEXT)')
db.exec("INSERT INTO demo VALUES (1, 'alice')")
const rows = db.query('SELECT name FROM demo WHERE id = 1')
console.log(rows[0].name)
db.close()
`,
    )


    const require = createRequire(import.meta.url)
    const wasmPath = require.resolve('sql.js/dist/sql-wasm.wasm')

    const stdout: Uint8Array[] = []
    const stderr: Uint8Array[] = []
    const runtime = new RuntimeCore({
      vfs,
      onStdout: (data) => stdout.push(data),
      onStderr: (data) => stderr.push(data),
      env: { BUN_SQLITE_WASM_URL: wasmPath },
    })

    const code = await runtime.exec('bun', ['run', '/index.ts'])
    const stderrText = new TextDecoder().decode(concat(stderr))
    expect(code, stderrText).toBe(0)

    const text = new TextDecoder().decode(concat(stdout))
    const lines = text.trim().split('\n')
    expect(lines[0]).toBe('alice')
  })
})

function concat(buffers: Uint8Array[]): Uint8Array {
  const total = buffers.reduce((sum, b) => sum + b.byteLength, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const b of buffers) {
    out.set(b, offset)
    offset += b.byteLength
  }
  return out
}
