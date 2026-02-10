import { Minimatch } from 'minimatch'
import type { VitaminRuntime } from './vitamin-runtime'
import type { VitaminInstallOptions } from './vitamin-install'
import type { VirtualFileSystem } from '@vitamin-ai/virtual-fs'

export type VitaminxRunnerOptions = {
  vfs: VirtualFileSystem
  runtime: VitaminRuntime
  install: (options: VitaminInstallOptions) => Promise<void>
  registryUrl?: string
}

export type VitaminxExecResult = {
  exitCode: number
  entry?: string
  name?: string
  rest?: string[]
}

type VitaminxPackageSpec = { name: string; version?: string }

type VitaminxCacheEntry = {
  path: string
  binPath?: string
  packageJsonPath?: string
  binMtime?: number
  packageJsonMtime?: number
}

export function createVitaminxRunner(options: VitaminxRunnerOptions) {
  const cache = new Map<string, VitaminxCacheEntry>()
  return {
    async exec(args: string[]): Promise<VitaminxExecResult> {
      const parsed = parseVitaminxArgs(args)
      if (!parsed.name) {
        options.runtime.process.stderr.write('vitaminx requires a package or binary name.\n')
        return { exitCode: 1 }
      }

      const cwd = parsed.cwd ?? options.runtime.process.cwd()
      const packageSpec = parsePackageSpecifier(parsed.name)
      const packageSpecs = parsed.packages.length > 0 ? parsed.packages : [packageSpec]
      const cacheKey = `${cwd}|${parsed.name}|${packageSpecs.map((spec) => `${spec.name}@${spec.version ?? ''}`).join(',')}`
      const cached = cache.get(cacheKey)
      let resolved = cached && isCacheValid(options.vfs, cached)
        ? cached
        : resolveVitaminxBinary(
          options.vfs, 
          cwd, 
          parsed.name, 
          packageSpec.name, 
          packageSpecs)

      if (!resolved && shouldAutoInstall(parsed, options.runtime.process.env)) {
        for (const spec of packageSpecs) {
          await ensurePackageInstalled({
            vfs: options.vfs,
            cwd,
            name: spec.name,
            version: spec.version,
            runtime: options.runtime,
            install: options.install,
            registryUrl: options.registryUrl,
          })
        }
        resolved = resolveVitaminxBinary(options.vfs, cwd, parsed.name, packageSpec.name, packageSpecs)
        if (resolved) {
          cache.set(cacheKey, resolved)
        }
      }

      if (!resolved) {
        options.runtime.process.stderr.write(
          `vitaminx could not find ${parsed.name} in node_modules or package.json bin.\n`,
        )
        return { exitCode: 1 }
      }

      cache.set(cacheKey, resolved)
      return { exitCode: 0, entry: resolved.path, name: parsed.name, rest: parsed.rest }
    },
  }
}

function parseVitaminxArgs(args: string[]): {
  name: string
  rest: string[]
  noInstall: boolean
  packages: VitaminxPackageSpec[]
  cwd?: string
} {
  let noInstall = false
  let name = ''
  const rest: string[] = []
  const packages: VitaminxPackageSpec[] = []
  let cwdOverride: string | undefined
  const separatorIndex = args.indexOf('--')
  const head = separatorIndex === -1 ? args : args.slice(0, separatorIndex)

  for (let i = 0; i < head.length; i += 1) {
    const arg = head[i]
    if (arg === '--no-install') {
      noInstall = true
      continue
    }
    if (arg === '--package' || arg === '-p') {
      const pkg = head[i + 1]
      if (pkg) {
        packages.push(parsePackageSpecifier(pkg))
        i += 1
      }
      continue
    }
    if (arg === '--cwd') {
      const cwd = head[i + 1]
      if (cwd) {
        cwdOverride = cwd
        i += 1
      }
      continue
    }
    if (!name) {
      name = arg
      continue
    }
    rest.push(arg)
  }

  if (separatorIndex !== -1) {
    return {
      name,
      rest: args.slice(separatorIndex + 1),
      noInstall,
      packages,
      cwd: cwdOverride,
    }
  }

  if (!name && packages.length === 1) {
    name = packages[0].name
  }
  return { name, rest, noInstall, packages, cwd: cwdOverride }
}

function shouldAutoInstall(parsed: { noInstall: boolean }, env: Record<string, string> | undefined): boolean {
  const envValue = env?.BUNX_AUTO_INSTALL
  if (parsed.noInstall) return false
  if (envValue === '0' || envValue === 'false') return false
  return true
}

function resolveVitaminxBinary(
  vfs: VirtualFileSystem,
  cwd: string,
  name: string,
  packageName: string,
  packageSpecs: VitaminxPackageSpec[],
): VitaminxCacheEntry | null {
  if (isPathSpecifier(name)) {
    const resolved = name.startsWith('/') ? name : joinPath(cwd, name)
    return vfs.exists(resolved)
      ? { path: resolved, binPath: resolved, binMtime: statMtime(vfs, resolved) }
      : null
  }

  const nameCandidates = [name, stripScope(name)].filter(Boolean) as string[]
  const workspaceBin = resolveWorkspaceBinary(vfs, cwd, nameCandidates, packageName)
  if (workspaceBin) return workspaceBin
  for (const candidate of nameCandidates) {
    const binPath = joinPath(cwd, 'node_modules', '.bin', candidate)
    if (vfs.exists(binPath)) {
      return { path: binPath, binPath, binMtime: statMtime(vfs, binPath) }
    }
  }

  for (const spec of packageSpecs) {
    const resolved = resolvePackageBin(vfs, cwd, nameCandidates, spec.name)
    if (resolved) return resolved
  }

  return resolvePackageBin(vfs, cwd, nameCandidates, packageName)
}

function resolveWorkspaceBinary(
  vfs: VirtualFileSystem,
  cwd: string,
  nameCandidates: string[],
  packageName: string,
): VitaminxCacheEntry | null {
  const workspaceRoot = findWorkspaceRoot(vfs, cwd)
  if (!workspaceRoot) return null
  const workspacePackages = resolveWorkspaces(vfs, workspaceRoot)
  for (const workspacePath of workspacePackages) {
    const packageJsonPath = joinPath(workspacePath, 'package.json')
    if (!vfs.exists(packageJsonPath)) continue
    const packageJson = readJson<Record<string, unknown>>(vfs, packageJsonPath)
    const bin = packageJson.bin
    const workspaceName = typeof packageJson.name === 'string' ? packageJson.name : undefined
    if (workspaceName && workspaceName !== packageName) {
      const stripped = stripScope(workspaceName)
      if (!nameCandidates.includes(workspaceName) && (!stripped || !nameCandidates.includes(stripped))) {
        continue
      }
    }
    const resolved = resolveBinFromPackageJson(workspacePath, packageJson, nameCandidates)
    if (resolved) {
      return {
        path: resolved,
        packageJsonPath,
        packageJsonMtime: statMtime(vfs, packageJsonPath),
        binPath: resolved,
        binMtime: statMtime(vfs, resolved),
      }
    }
  }
  return null
}

function resolveBinFromPackageJson(
  packageDir: string,
  packageJson: Record<string, unknown>,
  nameCandidates: string[],
): string | null {
  const bin = packageJson.bin
  if (typeof bin === 'string') {
    return joinPath(packageDir, bin)
  }
  if (bin && typeof bin === 'object') {
    const binMap = bin as Record<string, string>
    const packageJsonName = typeof packageJson.name === 'string' ? packageJson.name : undefined
    const candidates = [...nameCandidates]
    if (packageJsonName) {
      candidates.push(packageJsonName)
      const stripped = stripScope(packageJsonName)
      if (stripped) candidates.push(stripped)
    }
    for (const candidate of candidates) {
      if (binMap[candidate]) return joinPath(packageDir, binMap[candidate])
    }
    const fallback = binMap[Object.keys(binMap)[0] ?? '']
    return fallback ? joinPath(packageDir, fallback) : null
  }
  return null
}

function resolvePackageBin(
  vfs: VirtualFileSystem,
  cwd: string,
  nameCandidates: string[],
  packageName: string,
): VitaminxCacheEntry | null {
  const packageDir = joinPath(cwd, 'node_modules', packageName)
  const packageJsonPath = joinPath(packageDir, 'package.json')
  if (!vfs.exists(packageJsonPath)) return null

  const packageJson = readJson<Record<string, unknown>>(vfs, packageJsonPath)
  const resolved = resolveBinFromPackageJson(packageDir, packageJson, nameCandidates)
  if (!resolved) return null
  return {
    path: resolved,
    packageJsonPath,
    packageJsonMtime: statMtime(vfs, packageJsonPath),
    binPath: resolved,
    binMtime: statMtime(vfs, resolved),
  }
}

function resolveWorkspaces(vfs: VirtualFileSystem, root: string): string[] {
  const packageJsonPath = joinPath(root, 'package.json')
  if (!vfs.exists(packageJsonPath)) return []
  const packageJson = readJson<Record<string, unknown>>(vfs, packageJsonPath)
  const workspaces = packageJson.workspaces
  const patterns = Array.isArray(workspaces)
    ? workspaces
    : typeof workspaces === 'object'
      ? (workspaces as { packages?: string[] }).packages ?? []
      : []
  const results: string[] = []
  for (const pattern of patterns) {
    results.push(...expandWorkspacePattern(vfs, root, pattern))
  }
  return results
}

function expandWorkspacePattern(
  vfs: VirtualFileSystem,
  root: string,
  pattern: string,
): string[] {
  const normalized = pattern.replace(/\\/g, '/')
  const matcher = new Minimatch(normalized, { dot: true, nocase: false })
  const candidates = walkDirectories(vfs, root)
  return candidates
    .map((path) => stripPrefix(path, root))
    .filter((relative) => matcher.match(relative))
    .map((relative) => joinPath(root, relative))
}

function walkDirectories(vfs: VirtualFileSystem, root: string): string[] {
  const results: string[] = []
  let entries: ReturnType<VirtualFileSystem['readdir']>
  try {
    entries = vfs.readdir(root)
  } catch {
    return results
  }
  for (const entry of entries) {
    if (entry.kind !== 'directory') continue
    const next = joinPath(root, entry.name)
    results.push(next)
    results.push(...walkDirectories(vfs, next))
  }
  return results
}

function findWorkspaceRoot(vfs: VirtualFileSystem, cwd: string): string | null {
  const segments = cwd.split('/').filter(Boolean)
  for (let i = segments.length; i >= 0; i -= 1) {
    const prefix = `/${segments.slice(0, i).join('/')}` || '/'
    const packageJsonPath = joinPath(prefix, 'package.json')
    if (vfs.exists(packageJsonPath)) {
      const packageJson = readJson<Record<string, unknown>>(vfs, packageJsonPath)
      if (packageJson.workspaces) return prefix
    }
  }
  return null
}

async function ensurePackageInstalled(params: {
  vfs: VirtualFileSystem
  cwd: string
  name: string
  version?: string
  runtime: VitaminRuntime
  install: (options: VitaminInstallOptions) => Promise<void>
  registryUrl?: string
}): Promise<void> {
  const { vfs, cwd, name, version, runtime, install, registryUrl } = params
  vfs.mkdirp(cwd)
  const packageJsonPath = joinPath(cwd, 'package.json')
  const hasPackageJson = vfs.exists(packageJsonPath)
  const packageJson = hasPackageJson
    ? readJson<Record<string, unknown>>(vfs, packageJsonPath)
    : { name: 'vitaminx-temp', version: '0.0.0' }
  const dependencies = (packageJson.dependencies ?? {}) as Record<string, string>
  if (!dependencies[name]) {
    dependencies[name] = version ?? 'latest'
    packageJson.dependencies = dependencies
    writeJson(vfs, packageJsonPath, packageJson)
  }

  await install({
    vfs,
    cwd,
    registryUrl,
    stdout: (message) => runtime.process.stdout.write(message),
    stderr: (message) => runtime.process.stderr.write(message),
  })
}

function parsePackageSpecifier(spec: string): VitaminxPackageSpec {
  if (spec.startsWith('@')) {
    const atIndex = spec.lastIndexOf('@')
    const slashIndex = spec.indexOf('/')
    if (atIndex > slashIndex) {
      return { name: spec.slice(0, atIndex), version: spec.slice(atIndex + 1) }
    }
    return { name: spec }
  }

  const atIndex = spec.lastIndexOf('@')
  if (atIndex > 0) {
    return { name: spec.slice(0, atIndex), version: spec.slice(atIndex + 1) }
  }
  return { name: spec }
}

function isPathSpecifier(name: string): boolean {
  return name.startsWith('/') || name.startsWith('./') || name.startsWith('../')
}

function stripScope(name?: string): string | undefined {
  if (!name) return undefined
  if (name.startsWith('@')) {
    return name.split('/')[1]
  }
  return name
}

function joinPath(...parts: string[]): string {
  const joined = parts.join('/').replace(/\\/g, '/')
  const normalized = joined.replace(/\/+/, '/').replace(/\/+$/g, '') || '/'
  if (parts[0]?.startsWith('/') && !normalized.startsWith('/')) {
    return `/${normalized}`
  }
  return normalized
}

function statMtime(vfs: VirtualFileSystem, path: string): number | undefined {
  try {
    return vfs.stat(path).mtimeMs
  } catch {
    return undefined
  }
}

function isCacheValid(vfs: VirtualFileSystem, entry: VitaminxCacheEntry): boolean {
  if (!vfs.exists(entry.path)) return false
  if (entry.binPath) {
    if (!vfs.exists(entry.binPath)) return false
    if (entry.binMtime !== undefined && entry.binMtime !== statMtime(vfs, entry.binPath)) return false
  }
  if (entry.packageJsonPath) {
    if (!vfs.exists(entry.packageJsonPath)) return false
    if (entry.packageJsonMtime !== undefined && entry.packageJsonMtime !== statMtime(vfs, entry.packageJsonPath)) return false
  }
  return true
}

function stripPrefix(path: string, prefix: string): string {
  if (path.startsWith(prefix)) {
    const trimmed = path.slice(prefix.length)
    return trimmed.startsWith('/') ? trimmed.slice(1) : trimmed
  }
  return path
}

function readJson<T>(vfs: VirtualFileSystem, path: string): T {
  const text = vfs.readFile(path)
  return JSON.parse(text) as T
}

function writeJson(vfs: VirtualFileSystem, path: string, value: unknown): void {
  vfs.writeFile(path, JSON.stringify(value, null, 2))
}
