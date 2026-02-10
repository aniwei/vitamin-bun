import type { VirtualFileSystem } from '@vitamin-ai/virtual-fs'
import type { PackageJson } from './types'

export function readPackageJson(vfs: VirtualFileSystem, path: string): PackageJson {
  if (!vfs.exists(path)) {
    throw new Error(`package.json not found at ${path}`)
  }

  const text = vfs.readFile(path)
  return JSON.parse(text) as PackageJson
}

export function readPackageJsonSafe(
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
