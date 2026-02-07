import { describe, it, expect, vi, afterEach } from 'vitest'
import { VirtualFileSystem } from '../../../virtual-fs/src/index'
import { bunInstall } from '../bun-install'
import { RuntimeCore } from '../runtime-core'

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe('bun install', () => {
  it('installs dependencies into node_modules', async () => {
    const vfs = new VirtualFileSystem()
    vfs.writeFile('/package.json', JSON.stringify({ dependencies: { demo: '^1.0.0' } }))

    const tarball = createTar({
      'package/package.json': JSON.stringify({ name: 'demo', version: '1.2.0', main: 'index.js' }),
      'package/index.js': 'module.exports = 42',
    })

    mockRegistryFetch({
      packageName: 'demo',
      tarballUrl: 'https://registry.npmjs.org/demo/-/demo-1.2.0.tgz',
      tarball,
      versions: ['1.0.0', '1.2.0'],
    })

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

    mockRegistryFetch({
      packageName: 'demo',
      tarballUrl: 'https://registry.npmjs.org/demo/-/demo-1.0.0.tgz',
      tarball,
      versions: ['1.0.0'],
    })

    const runtime = new RuntimeCore({ vfs })
    const code = await runtime.exec('bun', ['install'])

    expect(code).toBe(0)
    expect(vfs.exists('/node_modules/demo/index.js')).toBe(true)
  })
})

function mockRegistryFetch(params: {
  packageName: string
  tarballUrl: string
  tarball: Uint8Array
  versions: string[]
}): void {
  const metadata = {
    'dist-tags': { latest: params.versions[params.versions.length - 1] },
    versions: Object.fromEntries(
      params.versions.map((version) => [
        version,
        {
          dist: {
            tarball: params.tarballUrl.replace(/\d+\.\d+\.\d+/, version),
          },
        },
      ]),
    ),
  }

  globalThis.fetch = vi.fn(async (url: string | URL) => {
    const href = String(url)
    if (href.endsWith('.tgz')) {
      return new Response(params.tarball)
    }
    if (href.includes(encodeURIComponent(params.packageName))) {
      return new Response(JSON.stringify(metadata))
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
