import { InodeKind } from '@vitamin-ai/virtual-fs'
import { fetchRegistryMetadata } from './registry'
import { resolveVersion, satisfiesRange } from './resolve'
import { fetchArrayBufferCached } from './fetch'
import { extractTarToVfs } from './tar'
import { verifyIntegrity } from './integrity'
import { readPackageJson, readPackageJsonSafe } from './package-json'
import { joinPath } from './paths'

import type { VirtualFileSystem } from '@vitamin-ai/virtual-fs'
import type { InstallContext, InstallRequest, PackageJson, WorkspacePackage } from './types'
import type { LockfileEntry } from './lockfile'
import type { RegistryMetadata } from './registry'

export type InstallResult = LockfileEntry

const DEFAULT_REGISTRY = 'https://registry.npmjs.org'

export async function installDependency(params: {
  ctx: InstallContext
  request: InstallRequest
  registryCache: Map<string, Promise<RegistryMetadata>>
  workspacePackages: Map<string, WorkspacePackage>
  installed: Map<string, LockfileEntry>
  installQueue: InstallRequest[]
  pushRequest: (request: InstallRequest) => void
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
  enableScripts: boolean
  runScript?: (command: string, cwd: string) => Promise<void>
}): Promise<LockfileEntry> {
  const {
    ctx,
    request,
    registryCache,
    workspacePackages,
    installed,
    installQueue,
    enableScripts,
    runScript,
  } = params

  ctx.stdout?.(`Installing ${request.name}@${request.spec}...\n`)
  params.onStateChange?.({ phase: 'start', name: request.name, spec: request.spec })

  const workspace = resolveWorkspaceDependency(request, workspacePackages)
  if (!workspace && isWorkspaceSpec(request.spec)) {
    throw new Error(`Workspace dependency not found: ${request.name}@${request.spec}`)
  }

  if (workspace) {
    const installPath = resolveNodeModulesPath(ctx.cwd, request.name)
    
    ctx.vfs.mkdirp(installPath)
    copyDirectory(ctx.vfs, workspace.path, installPath)
    
    const workspacePkg = readPackageJson(ctx.vfs, joinPath(installPath, 'package.json'))
    createBinLinks({
      vfs: ctx.vfs,
      cwd: ctx.cwd,
      packagePath: installPath,
      packageName: workspacePkg.name ?? request.name,
      pkg: workspacePkg,
      stderr: ctx.stderr,
    })
    
    enqueueDependencies(workspacePkg, request.name, params.pushRequest)
    checkPeerDependencies(workspacePkg, installed, ctx.stderr)
    
    await runLifecycleScripts({
      pkg: workspacePkg,
      cwd: installPath,
      enableScripts,
      runScript,
      stderr: ctx.stderr,
    })
    
    params.onStateChange?.({
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

  params.onStateChange?.({ phase: 'metadata', name: request.name, spec: request.spec })

  const metadata = await fetchRegistryMetadata(ctx, request.name, registryCache)
  const version = resolveVersion(request.spec, metadata)
  params.onStateChange?.({ phase: 'metadata', name: request.name, spec: request.spec, version })
  
  const dist = metadata.versions[version]?.dist
  if (!dist?.tarball) {
    throw new Error(`No tarball found for ${request.name}@${version}`)
  }

  params.onStateChange?.({ phase: 'download', name: request.name, spec: request.spec, version })
  const tarballUrl = rewriteTarballUrl(dist.tarball, ctx.registryUrl)
  const maxRetries = params.retryCount ?? 2
  const retryDelayMs = params.retryDelayMs ?? 500
  let tarballBytes: Uint8Array | null = null
  let attempt = 0

  while (attempt <= maxRetries) {
    try {
      const tarball = await fetchArrayBufferCached(ctx.cache, ctx.fetch, tarballUrl, (progress) => {
        const percent = progress.total 
          ? Math.round((progress.received / progress.total) * 100) 
          : undefined

        params.onDownloadProgress?.({
          name: request.name,
          spec: request.spec,
          version,
          received: progress.received,
          total: progress.total,
          percent,
        })
      })
      tarballBytes = new Uint8Array(tarball)
      if (dist.integrity) {
        await verifyIntegrity(tarballBytes, dist.integrity)
      }

      await ctx.cache?.setArrayBuffer(tarballUrl, tarballBytes.buffer)
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
      
      params.onStateChange?.({ 
        phase: 'error', 
        name: request.name, 
        spec: request.spec, 
        version, 
        message 
      })
      
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

  params.onStateChange?.({ 
    phase: 'extract', 
    name: request.name, 
    spec: request.spec, 
    version 
  })

  const tarData = isGzip(tarballBytes.buffer) ? await gunzip(tarballBytes) : tarballBytes
  const installPath = resolveNodeModulesPath(ctx.cwd, request.name)
  extractTarToVfs(ctx.vfs, tarData, installPath)

  const installedPkg = readPackageJsonSafe(
    ctx.vfs,
    joinPath(installPath, 'package.json'),
    request.name,
    version,
    ctx.stderr,
  )
  
  createBinLinks({
    vfs: ctx.vfs,
    cwd: ctx.cwd,
    packagePath: installPath,
    packageName: installedPkg.name ?? request.name,
    pkg: installedPkg,
    stderr: ctx.stderr,
  })
  enqueueDependencies(installedPkg, request.name, params.pushRequest)
  checkPeerDependencies(installedPkg, installed, ctx.stderr)
  await runLifecycleScripts({
    pkg: installedPkg,
    cwd: installPath,
    enableScripts,
    runScript,
    stderr: ctx.stderr,
  })

  params.onStateChange?.({ 
    phase: 'done', 
    name: request.name, 
    spec: request.spec, 
    version 
  })

  return {
    version: installedPkg.version ?? version,
    integrity: dist.integrity,
    resolved: tarballUrl,
    dependencies: installedPkg.dependencies ?? {},
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
    const name = packageName.includes('/') ? packageName.split('/')[1] ?? packageName : packageName
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

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
