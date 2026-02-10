import type { VirtualFileSystem } from '@vitamin-ai/virtual-fs'
import type { InstallCache } from './cache'

export type InstallContext = {
  vfs: VirtualFileSystem
  cwd: string
  registryUrl: string
  fetch: typeof fetch
  enableScripts: boolean
  cache?: InstallCache
  stdout?: (message: string) => void
  stderr?: (message: string) => void
}

export type PackageJson = {
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

export type InstallRequest = {
  name: string
  spec: string
  optional: boolean
  parent?: string
}

export type InstallPlan = {
  requests: InstallRequest[]
  createdAt: number
}

export type WorkspacePackage = {
  name: string
  version?: string
  path: string
}
