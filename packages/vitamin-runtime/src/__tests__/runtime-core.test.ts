import { describe, it, expect, vi, afterEach } from 'vitest'
import { VirtualFileSystem } from '../../../virtual-fs/src/index'
import { RuntimeCore } from '../runtime-core'

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe('RuntimeCore', () => {
  it('executes a simple entry file', async () => {
    const vfs = new VirtualFileSystem()
    vfs.writeFile('/index.ts', `
      console.log('hello')
      export const ok = true
    `)

    const stdout: Uint8Array[] = []
    const runtime = new RuntimeCore({
      vfs,
      onStdout: (data) => stdout.push(data),
    })

    const code = await runtime.exec('bun', ['run', '/index.ts'])
    expect(code).toBe(0)

    const text = new TextDecoder().decode(concat(stdout))
    expect(text).toContain('hello')
  })

  it('returns a clear error for unsupported CLI commands', async () => {
    const vfs = new VirtualFileSystem()
    const stderr: Uint8Array[] = []
    const runtime = new RuntimeCore({
      vfs,
      onStderr: (data) => stderr.push(data),
    })

    const code = await runtime.exec('bun', ['build'])
    expect(code).toBe(1)

    const text = new TextDecoder().decode(concat(stderr))
    expect(text).toContain('bun build is not available in the browser runtime yet')
  })

  it('reports missing bunx binaries', async () => {
    const vfs = new VirtualFileSystem()
    const stderr: Uint8Array[] = []
    const runtime = new RuntimeCore({
      vfs,
      onStderr: (data) => stderr.push(data),
      env: { BUNX_AUTO_INSTALL: 'false' },
    })

    const code = await runtime.exec('bun', ['x', 'demo'])
    expect(code).toBe(1)

    const text = new TextDecoder().decode(concat(stderr))
    expect(text).toContain('bunx could not find demo')
  })

  it('supports bunx path specifiers', async () => {
    const vfs = new VirtualFileSystem()
    vfs.mkdirp('/tools')
    vfs.writeFile('/tools/demo.js', `console.log('path ran')`)

    const stdout: Uint8Array[] = []
    const runtime = new RuntimeCore({
      vfs,
      onStdout: (data) => stdout.push(data),
    })

    const code = await runtime.exec('bun', ['x', './tools/demo.js'])
    expect(code).toBe(0)

    const text = new TextDecoder().decode(concat(stdout))
    expect(text).toContain('path ran')
  })

  it('executes bunx binaries from node_modules/.bin', async () => {
    const vfs = new VirtualFileSystem()
    vfs.mkdirp('/node_modules/.bin')
    vfs.writeFile('/node_modules/.bin/demo', `console.log('bin ran')`)

    const stdout: Uint8Array[] = []
    const runtime = new RuntimeCore({
      vfs,
      onStdout: (data) => stdout.push(data),
    })

    const code = await runtime.exec('bun', ['x', 'demo'])
    expect(code).toBe(0)

    const text = new TextDecoder().decode(concat(stdout))
    expect(text).toContain('bin ran')
  })

  it('resolves bunx binaries from package.json bin', async () => {
    const vfs = new VirtualFileSystem()
    vfs.mkdirp('/node_modules/demo/bin')
    vfs.writeFile('/node_modules/demo/package.json', JSON.stringify({ name: 'demo', bin: 'bin/cli.js' }))
    vfs.writeFile('/node_modules/demo/bin/cli.js', `console.log('pkg bin ran')`)

    const stdout: Uint8Array[] = []
    const runtime = new RuntimeCore({
      vfs,
      onStdout: (data) => stdout.push(data),
    })

    const code = await runtime.exec('bun', ['x', 'demo'])
    expect(code).toBe(0)

    const text = new TextDecoder().decode(concat(stdout))
    expect(text).toContain('pkg bin ran')
  })

  it('resolves bunx binaries for scoped packages', async () => {
    const vfs = new VirtualFileSystem()
    vfs.mkdirp('/node_modules/@scope/demo/bin')
    vfs.writeFile(
      '/node_modules/@scope/demo/package.json',
      JSON.stringify({ name: '@scope/demo', bin: { demo: 'bin/cli.js' } }),
    )
    vfs.writeFile('/node_modules/@scope/demo/bin/cli.js', `console.log('scoped bin ran')`)

    const stdout: Uint8Array[] = []
    const runtime = new RuntimeCore({
      vfs,
      onStdout: (data) => stdout.push(data),
    })

    const code = await runtime.exec('bun', ['x', '@scope/demo'])
    expect(code).toBe(0)

    const text = new TextDecoder().decode(concat(stdout))
    expect(text).toContain('scoped bin ran')
  })

  it('prefers workspace binaries over node_modules', async () => {
    const vfs = new VirtualFileSystem()
    vfs.writeFile(
      '/package.json',
      JSON.stringify({ name: 'root', version: '0.0.0', workspaces: ['packages/*'] }),
    )
    vfs.mkdirp('/packages/demo/bin')
    vfs.writeFile('/packages/demo/package.json', JSON.stringify({ name: 'demo', bin: 'bin/cli.js' }))
    vfs.writeFile('/packages/demo/bin/cli.js', `console.log('workspace bin ran')`)

    vfs.mkdirp('/node_modules/demo/bin')
    vfs.writeFile('/node_modules/demo/package.json', JSON.stringify({ name: 'demo', bin: 'bin/cli.js' }))
    vfs.writeFile('/node_modules/demo/bin/cli.js', `console.log('node_modules bin ran')`)

    const stdout: Uint8Array[] = []
    const runtime = new RuntimeCore({
      vfs,
      onStdout: (data) => stdout.push(data),
    })

    const code = await runtime.exec('bun', ['x', 'demo'])
    expect(code).toBe(0)

    const text = new TextDecoder().decode(concat(stdout))
    expect(text).toContain('workspace bin ran')
  })

  it('installs missing bunx packages before executing', async () => {
    const vfs = new VirtualFileSystem()
    vfs.writeFile('/package.json', JSON.stringify({ name: 'root', version: '0.0.0' }))

    const tarball = createTar({
      'package/package.json': JSON.stringify({ name: 'demo', version: '1.0.0', bin: 'cli.js' }),
      'package/cli.js': `console.log('installed bin')`,
    })

    mockRegistryFetch([
      {
        name: 'demo',
        versions: [{ version: '1.0.0', tarball }],
      },
    ])

    const stdout: Uint8Array[] = []
    const runtime = new RuntimeCore({
      vfs,
      onStdout: (data) => stdout.push(data),
    })

    const code = await runtime.exec('bun', ['x', 'demo'])
    expect(code).toBe(0)

    const text = new TextDecoder().decode(concat(stdout))
    expect(text).toContain('installed bin')
  })

  it('respects --no-install flag for bunx', async () => {
    const vfs = new VirtualFileSystem()
    vfs.writeFile('/package.json', JSON.stringify({ name: 'root', version: '0.0.0' }))

    const stderr: Uint8Array[] = []
    const runtime = new RuntimeCore({
      vfs,
      onStderr: (data) => stderr.push(data),
    })

    const code = await runtime.exec('bun', ['x', '--no-install', 'demo'])
    expect(code).toBe(1)

    const text = new TextDecoder().decode(concat(stderr))
    expect(text).toContain('bunx could not find demo')
  })

  it('supports bunx --package with custom binary name', async () => {
    const vfs = new VirtualFileSystem()
    vfs.writeFile('/package.json', JSON.stringify({ name: 'root', version: '0.0.0' }))

    const tarball = createTar({
      'package/package.json': JSON.stringify({ name: 'toolkit', version: '1.0.0', bin: { cli: 'bin/cli.js' } }),
      'package/bin/cli.js': `console.log('package cli ran')`,
    })

    mockRegistryFetch([
      {
        name: 'toolkit',
        versions: [{ version: '1.0.0', tarball }],
      },
    ])

    const stdout: Uint8Array[] = []
    const runtime = new RuntimeCore({
      vfs,
      onStdout: (data) => stdout.push(data),
    })

    const code = await runtime.exec('bun', ['x', '--package', 'toolkit', 'cli'])
    expect(code).toBe(0)

    const text = new TextDecoder().decode(concat(stdout))
    expect(text).toContain('package cli ran')
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
