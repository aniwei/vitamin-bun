import { describe, it, expect, vi, afterEach } from 'vitest'
import { VirtualFileSystem } from '../../../virtual-fs/src/index'
import { RuntimeCore } from '../runtime-core'
import { runAddFlow } from '../vitamin-add/add-flow'
import type { AddRequest } from '../vitamin-add/types'

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe('bun add', () => {
  it('updates package.json with new dependency', async () => {
    const vfs = new VirtualFileSystem()
    vfs.writeFile('/package.json', JSON.stringify({ name: 'demo' }, null, 2))

    const requests: AddRequest[] = [
      { name: 'is-even', spec: 'latest', dependencyType: 'dependencies' },
    ]

    await runAddFlow({ vfs, cwd: '/', requests })
    const next = JSON.parse(vfs.readFile('/package.json')) as Record<string, unknown>
    expect((next.dependencies as Record<string, string>)['is-even']).toBe('latest')
  })

  it('runs bun add via RuntimeCore', async () => {
    const vfs = new VirtualFileSystem()
    vfs.writeFile('/package.json', JSON.stringify({ name: 'demo' }, null, 2))

    const tarball = createTar({
      'package/package.json': JSON.stringify({ name: 'is-even', version: '1.0.0', main: 'index.js' }),
      'package/index.js': 'module.exports = 2',
    })

    mockRegistryFetch([
      {
        name: 'is-even',
        versions: [{ version: '1.0.0', tarball }],
      },
    ])

    const runtime = new RuntimeCore({ vfs })
    const code = await runtime.exec('bun', ['add', 'is-even'])

    expect(code).toBe(0)
    expect(vfs.exists('/node_modules/is-even/index.js')).toBe(true)
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
