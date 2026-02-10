import { describe, it, expect, vi, afterEach } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { createHash } from 'crypto'
import { VirtualFileSystem } from '../../../virtual-fs/src/index'
import { bunInstall } from '../vitamin-install'
import { RuntimeCore } from '../runtime-core'

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe('bun install', () => {
  it('loads parity fixtures with expected shape', () => {
    const fixturePath = join(__dirname, 'fixtures', 'bun-install-parity.json')
    const text = readFileSync(fixturePath, 'utf8')
    const data = JSON.parse(text) as {
      cases: Array<{ name: string; dependencies: Record<string, string>; expect: { nodeModules: string[]; lockfile: boolean } }>
    }

    expect(Array.isArray(data.cases)).toBe(true)
    expect(data.cases.length).toBeGreaterThan(0)
    for (const entry of data.cases) {
      expect(typeof entry.name).toBe('string')
      expect(typeof entry.dependencies).toBe('object')
      expect(Array.isArray(entry.expect.nodeModules)).toBe(true)
      expect(typeof entry.expect.lockfile).toBe('boolean')
    }
  })

  it('installs dependencies into node_modules', async () => {
    const vfs = new VirtualFileSystem()
    vfs.writeFile('/package.json', JSON.stringify({ dependencies: { demo: '^1.0.0' } }))

    const tarball = createTar({
      'package/package.json': JSON.stringify({ name: 'demo', version: '1.2.0', main: 'index.js' }),
      'package/index.js': 'module.exports = 42',
    })

    mockRegistryFetch([
      {
        name: 'demo',
        versions: [
          { version: '1.0.0', tarball },
          { version: '1.2.0', tarball },
        ],
      },
    ])

    await bunInstall({ vfs, cwd: '/' })

    expect(vfs.exists('/node_modules/demo/index.js')).toBe(true)
    expect(vfs.exists('/bun.lock')).toBe(true)
  })

  it('supports bun install via RuntimeCore', async () => {
    const vfs = new VirtualFileSystem()
    vfs.writeFile('/package.json', JSON.stringify({ dependencies: { demo: '1.0.0' } }))

    const tarball = createTar({
      'package/package.json': JSON.stringify({ name: 'demo', version: '1.0.0', main: 'index.js' }),
      'package/index.js': 'module.exports = 1',
    })

    mockRegistryFetch([
      {
        name: 'demo',
        versions: [{ version: '1.0.0', tarball }],
      },
    ])

    const runtime = new RuntimeCore({ vfs })
    const code = await runtime.exec('bun', ['install'])

    expect(code).toBe(0)
    expect(vfs.exists('/node_modules/demo/index.js')).toBe(true)
  })

  it('installs transitive dependencies', async () => {
    const vfs = new VirtualFileSystem()
    vfs.writeFile('/package.json', JSON.stringify({ dependencies: { demo: '^1.0.0' } }))

    const depTarball = createTar({
      'package/package.json': JSON.stringify({ name: 'dep', version: '2.1.0' }),
      'package/index.js': 'module.exports = 7',
    })
    const demoTarball = createTar({
      'package/package.json': JSON.stringify({
        name: 'demo',
        version: '1.1.0',
        dependencies: { dep: '^2.0.0' },
      }),
      'package/index.js': 'module.exports = 42',
    })

    mockRegistryFetch([
      {
        name: 'demo',
        versions: [{ version: '1.1.0', tarball: demoTarball }],
      },
      {
        name: 'dep',
        versions: [{ version: '2.1.0', tarball: depTarball }],
      },
    ])

    await bunInstall({ vfs, cwd: '/' })

    expect(vfs.exists('/node_modules/demo/index.js')).toBe(true)
    expect(vfs.exists('/node_modules/dep/index.js')).toBe(true)
  })

  it('fails integrity checks for corrupted tarballs', async () => {
    const vfs = new VirtualFileSystem()
    vfs.writeFile('/package.json', JSON.stringify({ dependencies: { demo: '1.0.0' } }))

    const tarball = createTar({
      'package/package.json': JSON.stringify({ name: 'demo', version: '1.0.0' }),
      'package/index.js': 'module.exports = 2',
    })
    const integrity = `sha512-${createHash('sha512').update(new TextEncoder().encode('wrong')).digest('base64')}`

    mockRegistryFetch([
      {
        name: 'demo',
        versions: [{ version: '1.0.0', tarball, integrity }],
      },
    ])

    await expect(bunInstall({ vfs, cwd: '/' })).rejects.toThrow('Integrity check failed')
  })

  it('installs workspace dependencies locally', async () => {
    const vfs = new VirtualFileSystem()
    vfs.mkdirp('/packages/local-lib')
    vfs.writeFile(
      '/package.json',
      JSON.stringify({
        workspaces: ['packages/*'],
        dependencies: { 'local-lib': 'workspace:*' },
      }),
    )
    vfs.writeFile(
      '/packages/local-lib/package.json',
      JSON.stringify({ name: 'local-lib', version: '0.1.0' }),
    )
    vfs.writeFile('/packages/local-lib/index.js', 'module.exports = 3')

    globalThis.fetch = vi.fn(async () => {
      throw new Error('registry fetch should not be called')
    }) as typeof fetch

    await bunInstall({ vfs, cwd: '/' })

    expect(vfs.exists('/node_modules/local-lib/index.js')).toBe(true)
  })
})

function mockRegistryFetch(packages: Array<{
  name: string
  versions: Array<{ version: string; tarball: Uint8Array; integrity?: string }>
}>): void {
  const metadataMap = new Map<string, { metadata: unknown; tarballs: Map<string, Uint8Array> }>()

  for (const pkg of packages) {
    const tarballs = new Map<string, Uint8Array>()
    const versions = Object.fromEntries(
      pkg.versions.map((entry) => {
        const tarballUrl = `https://registry.npmjs.org/${pkg.name}/-/${pkg.name}-${entry.version}.tgz`
        tarballs.set(tarballUrl, entry.tarball)
        return [
          entry.version,
          {
            dist: {
              tarball: tarballUrl,
              integrity: entry.integrity,
            },
          },
        ]
      }),
    )
    metadataMap.set(pkg.name, {
      metadata: {
        'dist-tags': { latest: pkg.versions[pkg.versions.length - 1].version },
        versions,
      },
      tarballs,
    })
  }

  globalThis.fetch = vi.fn(async (url: string | URL) => {
    const href = String(url)
    for (const { tarballs } of metadataMap.values()) {
      const tarball = tarballs.get(href)
      if (tarball) {
        const body = tarball.slice().buffer
        return new Response(body)
      }
    }

    for (const [name, { metadata }] of metadataMap.entries()) {
      if (href.includes(encodePackageName(name))) {
        return new Response(JSON.stringify(metadata))
      }
    }

    return new Response('Not Found', { status: 404 })
  }) as typeof fetch
}

function createTar(files: Record<string, string>): Uint8Array {
  const encoded = Object.fromEntries(Object.entries(files).map(([name, content]) => [name, new TextEncoder().encode(content)]))
  const chunks: Uint8Array[] = []

  for (const [name, data] of Object.entries(encoded)) {
    const header = new Uint8Array(512)
    writeString(header, 0, 100, name)
    writeOctal(header, 100, 8, 0o644)
    writeOctal(header, 108, 8, 0)
    writeOctal(header, 116, 8, 0)
    writeOctal(header, 124, 12, data.length)
    writeOctal(header, 136, 12, Math.floor(Date.now() / 1000))
    for (let i = 148; i < 156; i += 1) header[i] = 0x20
    header[156] = 0x30
    writeString(header, 257, 6, 'ustar')
    writeString(header, 263, 2, '00')

    const checksum = header.reduce((sum, byte) => sum + byte, 0)
    writeOctal(header, 148, 8, checksum)

    chunks.push(header)
    chunks.push(data)

    const padding = (512 - (data.length % 512)) % 512
    if (padding > 0) chunks.push(new Uint8Array(padding))
  }

  chunks.push(new Uint8Array(512))
  chunks.push(new Uint8Array(512))

  return concatChunks(chunks)
}

function writeString(buf: Uint8Array, offset: number, length: number, value: string): void {
  const bytes = new TextEncoder().encode(value)
  buf.set(bytes.slice(0, length), offset)
}

function writeOctal(buf: Uint8Array, offset: number, length: number, value: number): void {
  const text = value.toString(8).padStart(length - 1, '0') + '\0'
  writeString(buf, offset, length, text)
}

function concatChunks(chunks: Uint8Array[]): Uint8Array {
  const size = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0)
  const out = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.byteLength
  }
  return out
}

function encodePackageName(name: string): string {
  if (name.startsWith('@')) {
    return name.replace('/', '%2f')
  }
  return name
}
