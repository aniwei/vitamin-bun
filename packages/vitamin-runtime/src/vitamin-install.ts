import { InodeKind } from '@vitamin-ai/virtual-fs'
import { createInstallFlow } from './vitamin-install/install-flow'
import { readLockfile, writeLockfile } from './vitamin-install/lockfile'
import { readPackageJson } from './vitamin-install/package-json'
import { joinPath, normalizeRoot } from './vitamin-install/paths'
import { createInstallCache } from './vitamin-install/cache'
import type { VirtualFileSystem } from '@vitamin-ai/virtual-fs'
import type { InstallContext, PackageJson, WorkspacePackage } from './vitamin-install/types'

export type VitaminInstallOptions = {
  vfs: VirtualFileSystem
  cwd?: string
  registryUrl?: string
  stdout?: (message: string) => void
  stderr?: (message: string) => void
  onStateChange?: (info: {
    phase: 'start' | 'metadata' | 'download' | 'extract' | 'done' | 'skip' | 'error'
    name: string
    spec: string
    version?: string
    message?: string
  }) => void
  onPackageCountChange?: (info: { total: number; installed: number }) => void
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
  cache?: 'memory' | 'indexeddb'
  cacheName?: string
  fetchImpl?: typeof fetch
  enableScripts?: boolean
  runScript?: (command: string, cwd: string) => Promise<void>
}

const DEFAULT_REGISTRY = 'https://registry.npmjs.org'

export async function install(options: VitaminInstallOptions): Promise<void> {
  const { vfs, stdout, stderr } = options
  const cwd = normalizeRoot(options.cwd ?? '/')
  const registryUrl = options.registryUrl ?? DEFAULT_REGISTRY
  const enableScripts = options.enableScripts ?? false
  const cache = await createInstallCache(options.cache ?? 'indexeddb', options.cacheName)

  const pkg = readPackageJson(vfs, joinPath(cwd, 'package.json'))
  const deps = readRootDependencies(pkg)
  const workspacePackages = loadWorkspaces(vfs, cwd, pkg)

  const context: InstallContext = {
    vfs,
    cwd,
    registryUrl,
    fetch: options.fetchImpl ?? fetch,
    enableScripts,
    cache,
    stdout,
    stderr,
  }

  const requests = Object.entries(deps).map(([name, spec]) => ({
    name,
    spec,
    optional: false,
  }))

  const existingLockfile = readLockfile(context)
  const flow = createInstallFlow(context, {
    requests,
    workspacePackages,
    existingLockfile,
    onStateChange: options.onStateChange,
    onPackageCountChange: options.onPackageCountChange,
    onDownloadProgress: options.onDownloadProgress,
    onDownloadError: options.onDownloadError,
    retryCount: options.retryCount,
    retryDelayMs: options.retryDelayMs,
    enableScripts,
    runScript: options.runScript,
  })

  const lockfile = await flow.run()
  writeLockfile(context, lockfile)
  stdout?.(`Installed ${Object.keys(lockfile.dependencies).length} packages.\n`)
}

function readRootDependencies(pkg: PackageJson): Record<string, string> {
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
