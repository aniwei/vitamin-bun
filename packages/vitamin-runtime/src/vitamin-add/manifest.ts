import type { VirtualFileSystem } from '@vitamin-ai/virtual-fs'
import type { AddRequest } from './types'

export type PackageJsonManifest = {
  name?: string
  version?: string
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
  optionalDependencies?: Record<string, string>
}

export function readManifest(vfs: VirtualFileSystem, path: string): PackageJsonManifest {
  if (!vfs.exists(path)) {
    throw new Error(`package.json not found at ${path}`)
  }
  const text = vfs.readFile(path)
  return JSON.parse(text) as PackageJsonManifest
}

export function applyAddRequest(manifest: PackageJsonManifest, request: AddRequest): PackageJsonManifest {
  const next = { ...manifest }
  const field = request.dependencyType
  const current = next[field] ?? {}
  next[field] = { ...current, [request.name]: request.spec }
  return next
}

export function writeManifest(vfs: VirtualFileSystem, path: string, manifest: PackageJsonManifest): void {
  vfs.writeFile(path, JSON.stringify(manifest, null, 2))
}
