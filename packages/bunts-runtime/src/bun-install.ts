import { InodeKind } from '@vitamin-ai/virtual-fs'
import type { VirtualFileSystem } from '@vitamin-ai/virtual-fs'

export type BunInstallOptions = {
  vfs: VirtualFileSystem
  cwd?: string
  registryUrl?: string
  stdout?: (message: string) => void
  stderr?: (message: string) => void
  onProgress?: (info: {
    phase: 'start' | 'metadata' | 'download' | 'extract' | 'done' | 'skip' | 'error'
    name: string
    spec: string
    version?: string
    message?: string
  }) => void
  onPackageCount?: (info: { total: number; installed: number }) => void
  onDownloadProgress?: (info: {
    name: string
    spec: string
    version?: string
    received: number
    total?: number
    percent?: number
  }) => void
  onDownloadError?: (info: {
    name: string
    spec: string
    version?: string
    url?: string
    message: string
    optional: boolean
    shouldContinue: boolean
  }) => void
  retryCount?: number
  retryDelayMs?: number
  fetchImpl?: typeof fetch
  enableScripts?: boolean
  runScript?: (command: string, cwd: string) => Promise<void>
}

type PackageJson = {
  name?: string
  version?: string
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  optionalDependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
  workspaces?: string[] | { packages?: string[] }
  scripts?: Record<string, string>
  bin?: string | Record<string, string>
}

type RegistryMetadata = {
  versions: Record<string, { dist?: { tarball?: string; integrity?: string } }>
  'dist-tags'?: Record<string, string>
}

type InstallRequest = {
  name: string
  spec: string
  optional: boolean
  parent?: string
}

type LockfileEntry = {
  version: string
  integrity?: string
  resolved?: string
  dependencies?: Record<string, string>
}

type Lockfile = {
  dependencies: Record<string, LockfileEntry>
}

type WorkspacePackage = {
  name: string
  version?: string
  path: string
}

const DEFAULT_REGISTRY = 'https://registry.npmjs.org'

export async function bunInstall(options: BunInstallOptions): Promise<void> {
  const { vfs, stdout, stderr } = options
  const cwd = normalizeRoot(options.cwd ?? '/')
  const fetchImpl = options.fetchImpl ?? fetch
  const registryUrl = options.registryUrl ?? DEFAULT_REGISTRY
  const enableScripts = options.enableScripts ?? false

  const pkg = readPackageJson(vfs, joinPath(cwd, 'package.json'))
  const deps = collectRootDependencies(pkg)
  const workspacePackages = loadWorkspaces(vfs, cwd, pkg)

  const registryCache = new Map<string, Promise<RegistryMetadata>>()
  const installQueue: InstallRequest[] = []
  const installed = new Map<string, LockfileEntry>()
  const lockfile: Lockfile = { dependencies: {} }
  const seenRequests = new Set<string>()

  const existingLockfile = readLockfileSafe(vfs, joinPath(cwd, 'bun.lock'))
  if (existingLockfile) {
    for (const [name, entry] of Object.entries(existingLockfile.dependencies ?? {})) {
      const installPath = resolveNodeModulesPath(cwd, name)
      if (vfs.exists(installPath)) {
        installed.set(name, entry)
        lockfile.dependencies[name] = entry
      }
    }
  }

  const pushRequest = (request: InstallRequest) => {
    if (seenRequests.has(request.name)) return
    seenRequests.add(request.name)
    installQueue.push(request)
    options.onPackageCount?.({ total: seenRequests.size, installed: installed.size })
  }

  vfs.mkdirp(joinPath(cwd, 'node_modules'))

  for (const [name, spec] of Object.entries(deps)) {
    if (!installed.has(name)) {
      pushRequest({ name, spec, optional: false })
    }
  }

  while (installQueue.length > 0) {
    const request = installQueue.shift()!
    if (installed.has(request.name)) continue
    try {
      const entry = await installDependency({
        vfs,
        cwd,
        fetchImpl,
        registryUrl,
        request,
        registryCache,
        workspacePackages,
        installed,
        installQueue,
        pushRequest,
        stdout,
        stderr,
        onProgress: options.onProgress,
        onPackageCount: options.onPackageCount,
        onDownloadProgress: options.onDownloadProgress,
        onDownloadError: options.onDownloadError,
        retryCount: options.retryCount,
        retryDelayMs: options.retryDelayMs,
        enableScripts,
        runScript: options.runScript,
      })
      installed.set(request.name, entry)
      options.onPackageCount?.({ total: seenRequests.size, installed: installed.size })
      lockfile.dependencies[request.name] = entry
    } catch (err) {
      if (request.optional) {
        stderr?.(`Skipping optional dependency ${request.name}: ${String(err)}\n`)
        continue
      }
      throw err
    }
  }

  vfs.writeFile(joinPath(cwd, 'bun.lock'), JSON.stringify(lockfile, null, 2))
  stdout?.(`Installed ${Object.keys(lockfile.dependencies).length} packages.\n`)
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

async function fetchArrayBuffer(
  fetchImpl: typeof fetch,
  url: string,
  onProgress?: (received: number, total?: number) => void,
): Promise<ArrayBuffer> {
  const response = await fetchImpl(url)
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`)
  }

  if (!response.body || !onProgress) {
    return await response.arrayBuffer()
  }

  const total = response.headers.get('content-length')
  const totalBytes = total ? Number(total) : undefined
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let received = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (value) {
      chunks.push(value)
      received += value.byteLength
      onProgress(received, totalBytes)
    }
  }

  const buffer = new Uint8Array(received)
  let offset = 0
  for (const chunk of chunks) {
    buffer.set(chunk, offset)
    offset += chunk.byteLength
  }

  return buffer.buffer
}

function resolveVersion(spec: string, metadata: RegistryMetadata): string {
  const tags = metadata['dist-tags'] ?? {}
  if (!spec || spec === '*' || spec === 'latest') {
    return tags.latest ?? fail('No latest tag found')
  }
  if (spec in tags) return tags[spec]

  const normalized = spec.replace(/^workspace:/, '')
  if (metadata.versions[normalized]) return normalized

  const ranges = normalized.split('||').map((part) => part.trim()).filter(Boolean)
  const candidates = Object.keys(metadata.versions).filter((version) =>
    ranges.length > 0
      ? ranges.some((range) => satisfiesRange(version, range))
      : satisfiesRange(version, normalized),
  )
  const selected = maxVersion(candidates)

  if (!selected) throw new Error(`No matching version for ${spec}`)
  return selected
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

function satisfiesRange(version: string, range: string): boolean {
  if (!range || range === '*' || range === 'latest') return true
  if (range.includes('||')) {
    return range.split('||').some((part) => satisfiesRange(version, part.trim()))
  }
  if (range.startsWith('^') || range.startsWith('~')) {
    const base = normalizeShortVersion(range.slice(1))
    const baseVersion = parseVersion(base)
    if (!baseVersion) return false
    const upper = range.startsWith('^')
      ? bumpCaret(baseVersion)
      : bumpTilde(baseVersion)
    return compareVersion(version, base) >= 0 && compareVersion(version, upper) < 0
  }

  if (range.includes(' ')) {
    return range.split(/\s+/).every((part) => satisfiesRange(version, part))
  }

  const comparatorMatch = range.match(/^(>=|<=|>|<|=)?\s*(.+)$/)
  if (!comparatorMatch) return false
  const [, operator, raw] = comparatorMatch
  const target = normalizeShortVersion(raw)

  if (raw.endsWith('.x') || raw.endsWith('.*')) {
    return matchesWildcard(version, raw)
  }

  const cmp = compareVersion(version, target)
  switch (operator) {
    case '>':
      return cmp > 0
    case '>=':
      return cmp >= 0
    case '<':
      return cmp < 0
    case '<=':
      return cmp <= 0
    case '=':
    case undefined:
      return cmp === 0
    default:
      return false
  }
}

function normalizeShortVersion(version: string): string {
  const parts = version.split('.')
  while (parts.length < 3) parts.push('0')
  return parts.join('.')
}

function matchesWildcard(version: string, raw: string): boolean {
  const normalized = raw.replace(/\*|x/g, '0')
  const target = parseVersion(normalized)
  const current = parseVersion(version)
  if (!target || !current) return false
  const rawParts = raw.split('.')
  if (rawParts.length >= 1 && rawParts[0] !== '*' && rawParts[0] !== 'x') {
    if (current.major !== target.major) return false
  }
  if (rawParts.length >= 2 && rawParts[1] !== '*' && rawParts[1] !== 'x') {
    if (current.minor !== target.minor) return false
  }
  if (rawParts.length >= 3 && rawParts[2] !== '*' && rawParts[2] !== 'x') {
    if (current.patch !== target.patch) return false
  }
  return true
}

function bumpCaret(version: { major: number; minor: number; patch: number }): string {
  if (version.major > 0) return `${version.major + 1}.0.0`
  if (version.minor > 0) return `0.${version.minor + 1}.0`
  return `0.0.${version.patch + 1}`
}

function bumpTilde(version: { major: number; minor: number; patch: number }): string {
  return `${version.major}.${version.minor + 1}.0`
}

function extractTarToVfs(vfs: VirtualFileSystem, tar: Uint8Array, targetRoot: string): void {
  vfs.mkdirp(targetRoot)
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

function isGzip(buffer: ArrayBufferLike): boolean {
  const bytes = new Uint8Array(buffer)
  return bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b
}

async function gunzip(data: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'function') {
    const inputBuffer = data.slice().buffer
    const stream = new Response(inputBuffer).body?.pipeThrough(new DecompressionStream('gzip'))
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

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function readLockfileSafe(vfs: VirtualFileSystem, path: string): Lockfile | null {
  if (!vfs.exists(path)) return null
  try {
    const text = vfs.readFile(path)
    return JSON.parse(text) as Lockfile
  } catch {
    return null
  }
}

function collectRootDependencies(pkg: PackageJson): Record<string, string> {
  return {
    ...(pkg.dependencies ?? {}),
    ...(pkg.devDependencies ?? {}),
    ...(pkg.optionalDependencies ?? {}),
  }
}

function loadWorkspaces(
  vfs: VirtualFileSystem,
  cwd: string,
  pkg: PackageJson,
): Map<string, WorkspacePackage> {
  const workspaces = resolveWorkspacePatterns(pkg.workspaces)
  const workspacePaths = workspaces.flatMap((pattern) => expandWorkspacePattern(vfs, cwd, pattern))
  const workspaceMap = new Map<string, WorkspacePackage>()

  for (const workspacePath of workspacePaths) {
    const packagePath = joinPath(workspacePath, 'package.json')
    if (!vfs.exists(packagePath)) continue
    const workspacePkg = readPackageJson(vfs, packagePath)
    if (!workspacePkg.name) continue
    workspaceMap.set(workspacePkg.name, {
      name: workspacePkg.name,
      version: workspacePkg.version,
      path: workspacePath,
    })
  }

  return workspaceMap
}

function resolveWorkspacePatterns(
  workspaces?: string[] | { packages?: string[] },
): string[] {
  if (!workspaces) return []
  if (Array.isArray(workspaces)) return workspaces
  return workspaces.packages ?? []
}

function expandWorkspacePattern(
  vfs: VirtualFileSystem,
  cwd: string,
  pattern: string,
): string[] {
  const normalized = pattern.replace(/\\/g, '/')
  if (!normalized.includes('*')) {
    return [joinPath(cwd, normalized)]
  }

  const [prefix] = normalized.split('*')
  const base = joinPath(cwd, prefix)
  if (!vfs.exists(base)) return []
  return vfs
    .readdir(base)
    .filter((entry) => entry.kind === InodeKind.Directory)
    .map((entry) => joinPath(base, entry.name))
}

async function installDependency(params: {
  vfs: VirtualFileSystem
  cwd: string
  fetchImpl: typeof fetch
  registryUrl: string
  request: InstallRequest
  registryCache: Map<string, Promise<RegistryMetadata>>
  workspacePackages: Map<string, WorkspacePackage>
  installed: Map<string, LockfileEntry>
  installQueue: InstallRequest[]
  pushRequest: (request: InstallRequest) => void
  stdout?: (message: string) => void
  stderr?: (message: string) => void
  onProgress?: (info: {
    phase: 'start' | 'metadata' | 'download' | 'extract' | 'done' | 'skip' | 'error'
    name: string
    spec: string
    version?: string
    message?: string
  }) => void
  onPackageCount?: (info: { total: number; installed: number }) => void
  onDownloadProgress?: (info: {
    name: string
    spec: string
    version?: string
    received: number
    total?: number
    percent?: number
  }) => void
  onDownloadError?: (info: {
    name: string
    spec: string
    version?: string
    url?: string
    message: string
    optional: boolean
    shouldContinue: boolean
  }) => void
  retryCount?: number
  retryDelayMs?: number
  enableScripts: boolean
  runScript?: (command: string, cwd: string) => Promise<void>
}): Promise<LockfileEntry> {
  const {
    vfs,
    cwd,
    fetchImpl,
    registryUrl,
    request,
    registryCache,
    workspacePackages,
    installed,
    installQueue,
    stdout,
    stderr,
    enableScripts,
    runScript,
  } = params

  stdout?.(`Installing ${request.name}@${request.spec}...\n`)
  params.onProgress?.({ phase: 'start', name: request.name, spec: request.spec })

  const workspace = resolveWorkspaceDependency(request, workspacePackages)
  if (!workspace && isWorkspaceSpec(request.spec)) {
    throw new Error(`Workspace dependency not found: ${request.name}@${request.spec}`)
  }
  if (workspace) {
    const installPath = resolveNodeModulesPath(cwd, request.name)
    vfs.mkdirp(installPath)
    copyDirectory(vfs, workspace.path, installPath)
    const workspacePkg = readPackageJson(vfs, joinPath(installPath, 'package.json'))
    createBinLinks({
      vfs,
      cwd,
      packagePath: installPath,
      packageName: workspacePkg.name ?? request.name,
      pkg: workspacePkg,
      stderr,
    })
    enqueueDependencies(workspacePkg, request.name, params.pushRequest)
    checkPeerDependencies(workspacePkg, installed, stderr)
    await runLifecycleScripts({
      pkg: workspacePkg,
      cwd: installPath,
      enableScripts,
      runScript,
      stderr,
    })
    params.onProgress?.({
      phase: 'done',
      name: request.name,
      spec: request.spec,
      version: workspacePkg.version ?? workspace.version ?? '0.0.0',
    })
    return {
      version: workspacePkg.version ?? workspace.version ?? '0.0.0',
      resolved: `workspace:${workspace.path}`,
      dependencies: workspacePkg.dependencies ?? {},
    }
  }

  params.onProgress?.({ phase: 'metadata', name: request.name, spec: request.spec })
  const metadata = await fetchRegistryMetadata(fetchImpl, registryUrl, request.name, registryCache)
  const version = resolveVersion(request.spec, metadata)
  params.onProgress?.({ phase: 'metadata', name: request.name, spec: request.spec, version })
  const dist = metadata.versions[version]?.dist
  if (!dist?.tarball) {
    throw new Error(`No tarball found for ${request.name}@${version}`)
  }

  params.onProgress?.({ phase: 'download', name: request.name, spec: request.spec, version })
  const tarballUrl = rewriteTarballUrl(dist.tarball, registryUrl)
  const maxRetries = params.retryCount ?? 2
  const retryDelayMs = params.retryDelayMs ?? 500
  let tarballBytes: Uint8Array | null = null
  let attempt = 0

  while (attempt <= maxRetries) {
    try {
      const tarball = await fetchArrayBuffer(fetchImpl, tarballUrl, (received, total) => {
        const percent = total ? Math.round((received / total) * 100) : undefined
        params.onDownloadProgress?.({ name: request.name, spec: request.spec, version, received, total, percent })
      })
      tarballBytes = new Uint8Array(tarball)
      if (dist.integrity) {
        await verifyIntegrity(tarballBytes, dist.integrity)
      }
      break
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      const shouldRetry = attempt < maxRetries
      params.onDownloadError?.({
        name: request.name,
        spec: request.spec,
        version,
        url: tarballUrl,
        message: shouldRetry ? `${message} (retry ${attempt + 1}/${maxRetries})` : message,
        optional: request.optional,
        shouldContinue: request.optional,
      })
      params.onProgress?.({ phase: 'error', name: request.name, spec: request.spec, version, message })
      if (!shouldRetry) {
        throw err
      }
      await delay(retryDelayMs * Math.pow(2, attempt))
      attempt += 1
    }
  }

  if (!tarballBytes) {
    throw new Error(`Failed to download ${request.name}@${version}`)
  }
  params.onProgress?.({ phase: 'extract', name: request.name, spec: request.spec, version })
  const tarData = isGzip(tarballBytes.buffer) ? await gunzip(tarballBytes) : tarballBytes

  const installPath = resolveNodeModulesPath(cwd, request.name)
  extractTarToVfs(vfs, tarData, installPath)
  const installedPkg = readPackageJsonSafe(
    vfs,
    joinPath(installPath, 'package.json'),
    request.name,
    version,
    stderr,
  )
  createBinLinks({
    vfs,
    cwd,
    packagePath: installPath,
    packageName: installedPkg.name ?? request.name,
    pkg: installedPkg,
    stderr,
  })
  enqueueDependencies(installedPkg, request.name, params.pushRequest)
  checkPeerDependencies(installedPkg, installed, stderr)
  await runLifecycleScripts({
    pkg: installedPkg,
    cwd: installPath,
    enableScripts,
    runScript,
    stderr,
  })

  params.onProgress?.({ phase: 'done', name: request.name, spec: request.spec, version })
  return {
    version: installedPkg.version ?? version,
    integrity: dist.integrity,
    resolved: tarballUrl,
    dependencies: installedPkg.dependencies ?? {},
  }
}

function readPackageJsonSafe(
  vfs: VirtualFileSystem,
  path: string,
  name: string,
  version: string,
  stderr?: (message: string) => void,
): PackageJson {
  try {
    return readPackageJson(vfs, path)
  } catch (err) {
    stderr?.(`Warning: ${String(err)}; falling back to minimal package.json for ${name}\n`)
    return { name, version, dependencies: {} }
  }
}

function enqueueDependencies(
  pkg: PackageJson,
  parent: string | undefined,
  pushRequest: (request: InstallRequest) => void,
): void {
  for (const [name, spec] of Object.entries(pkg.dependencies ?? {})) {
    pushRequest({ name, spec, optional: false, parent })
  }
  for (const [name, spec] of Object.entries(pkg.optionalDependencies ?? {})) {
    pushRequest({ name, spec, optional: true, parent })
  }
}

function checkPeerDependencies(
  pkg: PackageJson,
  installed: Map<string, LockfileEntry>,
  stderr?: (message: string) => void,
): void {
  for (const [name, spec] of Object.entries(pkg.peerDependencies ?? {})) {
    const entry = installed.get(name)
    if (!entry) {
      stderr?.(`Missing peer dependency ${name}@${spec} for ${pkg.name ?? 'unknown'}\n`)
      continue
    }
    if (!satisfiesRange(entry.version, spec)) {
      stderr?.(`Peer dependency mismatch ${name}@${entry.version} (wanted ${spec})\n`)
    }
  }
}

function resolveWorkspaceDependency(
  request: InstallRequest,
  workspaces: Map<string, WorkspacePackage>,
): WorkspacePackage | null {
  if (!isWorkspaceSpec(request.spec)) return null
  return workspaces.get(request.name) ?? null
}

function isWorkspaceSpec(spec: string): boolean {
  return spec.startsWith('workspace:') || spec.startsWith('file:') || spec.startsWith('link:')
}

function resolveNodeModulesPath(cwd: string, name: string): string {
  if (name.startsWith('@')) {
    const [scope, pkg] = name.split('/')
    return joinPath(cwd, 'node_modules', scope, pkg ?? '')
  }
  return joinPath(cwd, 'node_modules', name)
}

function createBinLinks(params: {
  vfs: VirtualFileSystem
  cwd: string
  packagePath: string
  packageName: string
  pkg: PackageJson
  stderr?: (message: string) => void
}): void {
  const { vfs, cwd, packagePath, packageName, pkg, stderr } = params
  const binField = pkg.bin
  if (!binField) return

  const binDir = joinPath(cwd, 'node_modules', '.bin')
  vfs.mkdirp(binDir)

  const entries: Record<string, string> = {}
  if (typeof binField === 'string') {
    const name = packageName.includes('/')
      ? packageName.split('/')[1] ?? packageName
      : packageName
    entries[name] = binField
  } else if (typeof binField === 'object') {
    for (const [name, target] of Object.entries(binField)) {
      if (typeof target === 'string') {
        entries[name] = target
      }
    }
  }

  for (const [name, target] of Object.entries(entries)) {
    const targetPath = joinPath(packagePath, target)
    if (!vfs.exists(targetPath)) {
      stderr?.(`Warning: bin target not found for ${packageName}: ${target}\n`)
      continue
    }
    const binPath = joinPath(binDir, name)
    const shim = `import '${targetPath}'\n`
    vfs.writeFile(binPath, shim)
  }
}

function copyDirectory(vfs: VirtualFileSystem, source: string, target: string): void {
  vfs.mkdirp(target)
  for (const entry of vfs.readdir(source)) {
    const sourcePath = joinPath(source, entry.name)
    const targetPath = joinPath(target, entry.name)
    if (entry.kind === InodeKind.Directory) {
      copyDirectory(vfs, sourcePath, targetPath)
    } else {
      const data = vfs.readFileBytes(sourcePath)
      vfs.writeFile(targetPath, data)
    }
  }
}

async function fetchRegistryMetadata(
  fetchImpl: typeof fetch,
  registryUrl: string,
  name: string,
  cache: Map<string, Promise<RegistryMetadata>>,
): Promise<RegistryMetadata> {
  const key = `${registryUrl}|${name}`
  if (!cache.has(key)) {
    cache.set(key, fetchJson<RegistryMetadata>(fetchImpl, `${registryUrl}/${encodePackageName(name)}`))
  }
  return await cache.get(key)!
}

async function runLifecycleScripts(params: {
  pkg: PackageJson
  cwd: string
  enableScripts: boolean
  runScript?: (command: string, cwd: string) => Promise<void>
  stderr?: (message: string) => void
}): Promise<void> {
  const { pkg, cwd, enableScripts, runScript, stderr } = params
  const scripts = pkg.scripts ?? {}
  const phases = ['preinstall', 'install', 'postinstall'] as const
  for (const phase of phases) {
    const script = scripts[phase]
    if (!script) continue
    if (!enableScripts) {
      stderr?.(`Skipping ${phase} script for ${pkg.name ?? 'package'} (scripts disabled)\n`)
      continue
    }
    if (!runScript) {
      stderr?.(`No script runner available for ${phase} in ${pkg.name ?? 'package'}\n`)
      continue
    }
    await runScript(script, cwd)
  }
}

async function verifyIntegrity(data: Uint8Array, integrity: string): Promise<void> {
  const candidates = integrity.trim().split(/\s+/)
  if (candidates.length === 0) throw new Error(`Unsupported integrity format: ${integrity}`)
  const subtle = await getSubtleCrypto()
  const buffer = data.slice().buffer
  const results: Array<{ algorithm: string; expected: string; actual: string }> = []

  for (const candidate of candidates) {
    const [algorithm, expected] = candidate.split('-', 2)
    if (!expected) continue
    const digest = await subtle.digest(normalizeAlgorithm(algorithm), buffer)
    const actual = toBase64(new Uint8Array(digest))
    results.push({ algorithm, expected, actual })
    if (actual === expected) return
  }

  const summary = results.map((item) => `${item.algorithm}: ${item.actual}`).join(', ')
  throw new Error(`Integrity check failed for ${summary}`)
}

async function getSubtleCrypto(): Promise<SubtleCrypto> {
  if (globalThis.crypto?.subtle) return globalThis.crypto.subtle
  throw new Error('WebCrypto not available for integrity checks')
}

function normalizeAlgorithm(algorithm: string): AlgorithmIdentifier {
  switch (algorithm) {
    case 'sha512':
      return 'SHA-512'
    case 'sha256':
      return 'SHA-256'
    case 'sha1':
      return 'SHA-1'
    default:
      throw new Error(`Unsupported integrity algorithm: ${algorithm}`)
  }
}

function toBase64(bytes: Uint8Array): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  let output = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] ?? 0
    const b = bytes[i + 1] ?? 0
    const c = bytes[i + 2] ?? 0
    const triple = (a << 16) | (b << 8) | c
    output += alphabet[(triple >> 18) & 0x3f]
    output += alphabet[(triple >> 12) & 0x3f]
    output += i + 1 < bytes.length ? alphabet[(triple >> 6) & 0x3f] : '='
    output += i + 2 < bytes.length ? alphabet[triple & 0x3f] : '='
  }
  return output
}
