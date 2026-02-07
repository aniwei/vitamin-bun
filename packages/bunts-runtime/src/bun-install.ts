import type { VirtualFileSystem } from '@vitamin-ai/virtual-fs'

export type BunInstallOptions = {
  vfs: VirtualFileSystem
  cwd?: string
  registryUrl?: string
  stdout?: (message: string) => void
  stderr?: (message: string) => void
  fetchImpl?: typeof fetch
}

type PackageJson = {
  name?: string
  version?: string
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
}

type RegistryMetadata = {
  versions: Record<string, { dist?: { tarball?: string; integrity?: string } }>
  'dist-tags'?: Record<string, string>
}

const DEFAULT_REGISTRY = 'https://registry.npmjs.org'

export async function bunInstall(options: BunInstallOptions): Promise<void> {
  const { vfs, stdout, stderr } = options
  const cwd = normalizeRoot(options.cwd ?? '/')
  const fetchImpl = options.fetchImpl ?? fetch
  const registryUrl = options.registryUrl ?? DEFAULT_REGISTRY

  const pkg = readPackageJson(vfs, joinPath(cwd, 'package.json'))
  const deps = {
    ...(pkg.dependencies ?? {}),
    ...(pkg.devDependencies ?? {}),
  }

  const installResults: Record<string, string> = {}

  vfs.mkdirp(joinPath(cwd, 'node_modules'))

  for (const [name, spec] of Object.entries(deps)) {
    stdout?.(`Installing ${name}@${spec}...\n`)
    const metadata = await fetchJson<RegistryMetadata>(fetchImpl, `${registryUrl}/${encodePackageName(name)}`)
    const version = resolveVersion(spec, metadata)
    const dist = metadata.versions[version]?.dist
    if (!dist?.tarball) {
      throw new Error(`No tarball found for ${name}@${version}`)
    }

    const tarballUrl = rewriteTarballUrl(dist.tarball, registryUrl)
    const tarball = await fetchArrayBuffer(fetchImpl, tarballUrl)
    const tarData = isGzip(tarball) ? await gunzip(new Uint8Array(tarball)) : new Uint8Array(tarball)

    extractTarToVfs(vfs, tarData, joinPath(cwd, 'node_modules', name))
    installResults[name] = version
  }

  vfs.writeFile(joinPath(cwd, 'bun.lock'), JSON.stringify({ dependencies: installResults }, null, 2))
  stdout?.(`Installed ${Object.keys(installResults).length} packages.\n`)
}

function readPackageJson(vfs: VirtualFileSystem, path: string): PackageJson {
  if (!vfs.exists(path)) {
    throw new Error(`package.json not found at ${path}`)
  }
  const text = vfs.readFile(path)
  return JSON.parse(text) as PackageJson
}

async function fetchJson<T>(fetchImpl: typeof fetch, url: string): Promise<T> {
  const response = await fetchImpl(url)
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`)
  }
  return (await response.json()) as T
}

async function fetchArrayBuffer(fetchImpl: typeof fetch, url: string): Promise<ArrayBuffer> {
  const response = await fetchImpl(url)
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`)
  }
  return await response.arrayBuffer()
}

function resolveVersion(spec: string, metadata: RegistryMetadata): string {
  const tags = metadata['dist-tags'] ?? {}
  if (!spec || spec === '*' || spec === 'latest') {
    return tags.latest ?? fail(`No latest tag found`)
  }
  if (spec in tags) return tags[spec]

  if (spec.startsWith('^') || spec.startsWith('~')) {
    const base = spec.slice(1)
    const baseVersion = parseVersion(base)
    if (!baseVersion) {
      throw new Error(`Unsupported version spec: ${spec}`)
    }
    const candidates = Object.keys(metadata.versions).filter((version) => {
      const parsed = parseVersion(version)
      if (!parsed) return false
      if (spec.startsWith('^')) return parsed.major === baseVersion.major
      return parsed.major === baseVersion.major && parsed.minor === baseVersion.minor
    })
    const selected = maxVersion(candidates)
    if (!selected) throw new Error(`No matching version for ${spec}`)
    return selected
  }

  if (metadata.versions[spec]) return spec
  throw new Error(`Unsupported or missing version: ${spec}`)
}

function parseVersion(version: string): { major: number; minor: number; patch: number } | null {
  const clean = version.split('-')[0]
  const parts = clean.split('.')
  if (parts.length < 3) return null
  const major = Number(parts[0])
  const minor = Number(parts[1])
  const patch = Number(parts[2])
  if (Number.isNaN(major) || Number.isNaN(minor) || Number.isNaN(patch)) return null
  return { major, minor, patch }
}

function maxVersion(versions: string[]): string | null {
  let best: string | null = null
  for (const version of versions) {
    if (!best) {
      best = version
      continue
    }
    if (compareVersion(version, best) > 0) {
      best = version
    }
  }
  return best
}

function compareVersion(a: string, b: string): number {
  const av = parseVersion(a)
  const bv = parseVersion(b)
  if (!av || !bv) return 0
  if (av.major !== bv.major) return av.major - bv.major
  if (av.minor !== bv.minor) return av.minor - bv.minor
  return av.patch - bv.patch
}

function extractTarToVfs(vfs: VirtualFileSystem, tar: Uint8Array, targetRoot: string): void {
  let offset = 0
  const textDecoder = new TextDecoder()

  while (offset + 512 <= tar.length) {
    const header = tar.slice(offset, offset + 512)
    if (isZeroBlock(header)) break

    const name = readString(header, 0, 100)
    const prefix = readString(header, 345, 155)
    const sizeText = readString(header, 124, 12).trim()
    const typeflag = header[156]

    const size = sizeText ? parseInt(sizeText, 8) : 0
    const fullName = prefix ? `${prefix}/${name}` : name
    const normalized = stripPackagePrefix(fullName)

    const dataStart = offset + 512
    const dataEnd = dataStart + size

    if (normalized) {
      const targetPath = joinPath(targetRoot, normalized)
      if (typeflag === 53) {
        vfs.mkdirp(targetPath)
      } else {
        const dir = targetPath.split('/').slice(0, -1).join('/')
        if (dir) vfs.mkdirp(dir)
        vfs.writeFile(targetPath, tar.slice(dataStart, dataEnd))
      }
    }

    const blocks = Math.ceil(size / 512)
    offset = dataStart + blocks * 512
  }
}

function stripPackagePrefix(path: string): string | null {
  const trimmed = path.replace(/^\/+/, '')
  if (!trimmed.startsWith('package/')) return null
  return trimmed.slice('package/'.length)
}

function readString(buf: Uint8Array, start: number, length: number): string {
  const slice = buf.slice(start, start + length)
  let end = slice.indexOf(0)
  if (end === -1) end = slice.length
  return new TextDecoder().decode(slice.slice(0, end))
}

function isZeroBlock(block: Uint8Array): boolean {
  for (const byte of block) {
    if (byte !== 0) return false
  }
  return true
}

function isGzip(buffer: ArrayBuffer): boolean {
  const bytes = new Uint8Array(buffer)
  return bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b
}

async function gunzip(data: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'function') {
    const stream = new Response(data).body?.pipeThrough(new DecompressionStream('gzip'))
    if (!stream) throw new Error('Failed to create gzip decompression stream')
    const buffer = await new Response(stream).arrayBuffer()
    return new Uint8Array(buffer)
  }

  try {
    const { gunzipSync } = await import('fflate')
    return gunzipSync(data)
  } catch (err) {
    throw new Error(`gzip decompression not available: ${String(err)}`)
  }
}

function encodePackageName(name: string): string {
  if (name.startsWith('@')) {
    return name.replace('/', '%2f')
  }
  return name
}

function rewriteTarballUrl(tarballUrl: string, registryUrl: string): string {
  if (registryUrl === DEFAULT_REGISTRY) return tarballUrl
  try {
    const tarball = new URL(tarballUrl)
    const registry = new URL(registryUrl)
    const defaultRegistry = new URL(DEFAULT_REGISTRY)
    if (tarball.origin !== defaultRegistry.origin) return tarballUrl
    const base = registry.toString().replace(/\/$/, '')
    return `${base}${tarball.pathname}${tarball.search}`
  } catch {
    return tarballUrl
  }
}

function joinPath(...parts: string[]): string {
  const joined = parts.join('/')
  const normalized = joined.replace(/\/+|\\+/g, '/').replace(/\/+$/, '') || '/'
  if (parts[0]?.startsWith('/') && !normalized.startsWith('/')) {
    return `/${normalized}`
  }
  return normalized
}

function normalizeRoot(path: string): string {
  if (!path.startsWith('/')) return `/${path}`
  return path
}

function fail(message: string): never {
  throw new Error(message)
}
