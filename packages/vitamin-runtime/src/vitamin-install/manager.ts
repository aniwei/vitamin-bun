import { installDependency } from './installer'
import { joinPath } from './paths'
import type { InstallContext, InstallPlan, InstallRequest, WorkspacePackage } from './types'
import type { Lockfile, LockfileEntry } from './lockfile'
import type { RegistryMetadata } from './registry'

export type InstallManager = {
  plan: InstallPlan
  run: () => Promise<Lockfile>
}

export type InstallManagerOptions = {
  requests: InstallRequest[]
  registryCache?: Map<string, Promise<RegistryMetadata>>
  workspacePackages: Map<string, WorkspacePackage>
  existingLockfile?: Lockfile | null
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
}

export function createInstallManager(
  ctx: InstallContext,
  options: InstallManagerOptions,
): InstallManager {
  const registryCache = options.registryCache ?? new Map<string, Promise<RegistryMetadata>>()
  const installQueue: InstallRequest[] = []
  const installed = new Map<string, LockfileEntry>()
  const lockfile: Lockfile = { dependencies: {} }
  const seenRequests = new Set<string>()

  if (options.existingLockfile) {
    for (const [name, entry] of Object.entries(options.existingLockfile.dependencies ?? {})) {
      const installPath = resolveNodeModulesPath(ctx.cwd, name)
      if (ctx.vfs.exists(installPath)) {
        installed.set(name, entry)
        lockfile.dependencies[name] = entry
      }
    }
  }

  const pushRequest = (request: InstallRequest) => {
    if (seenRequests.has(request.name)) return
    
    seenRequests.add(request.name)
    installQueue.push(request)
    options.onPackageCountChange?.({ 
      total: seenRequests.size, 
      installed: installed.size 
    })
  }

  ctx.vfs.mkdirp(joinPath(ctx.cwd, 'node_modules'))

  for (const request of options.requests) {
    if (!installed.has(request.name)) {
      pushRequest(request)
    }
  }

  return {
    plan: { requests: options.requests, createdAt: Date.now() },
    async run() {
      while (installQueue.length > 0) {
        const request = installQueue.shift()!
        if (installed.has(request.name)) continue
        try {
          const entry = await installDependency({
            ctx,
            request,
            registryCache,
            workspacePackages: options.workspacePackages,
            installed,
            installQueue,
            pushRequest,
            onStateChange: options.onStateChange,
            onPackageCountChange: options.onPackageCountChange,
            onDownloadProgress: options.onDownloadProgress,
            onDownloadError: options.onDownloadError,
            retryCount: options.retryCount,
            retryDelayMs: options.retryDelayMs,
            enableScripts: options.enableScripts,
            runScript: options.runScript,
          })
          installed.set(request.name, entry)
          options.onPackageCountChange?.({ total: seenRequests.size, installed: installed.size })
          lockfile.dependencies[request.name] = entry
        } catch (err) {
          if (request.optional) {
            ctx.stderr?.(`Skipping optional dependency ${request.name}: ${String(err)}\n`)
            continue
          }
          throw err
        }
      }

      return lockfile
    },
  }
}

function resolveNodeModulesPath(cwd: string, name: string): string {
  if (name.startsWith('@')) {
    const [scope, pkg] = name.split('/')
    return joinPath(cwd, 'node_modules', scope, pkg ?? '')
  }
  return joinPath(cwd, 'node_modules', name)
}
