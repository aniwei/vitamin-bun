import type { InstallContext } from './types'

export type LockfileEntry = {
  version: string
  integrity?: string
  resolved?: string
  dependencies?: Record<string, string>
}

export type Lockfile = {
  dependencies: Record<string, LockfileEntry>
}

const LOCKFILE_NAME = 'bun.lock'

export function readLockfile(ctx: InstallContext): Lockfile | null {
  const path = joinPath(ctx.cwd, LOCKFILE_NAME)
  
  if (!ctx.vfs.exists(path)) return null
  try {
    const text = ctx.vfs.readFile(path)
    return JSON.parse(text) as Lockfile
  } catch {
    return null
  }
}

export function writeLockfile(ctx: InstallContext, lockfile: Lockfile): void {
  const path = joinPath(ctx.cwd, LOCKFILE_NAME)
  ctx.vfs.writeFile(path, JSON.stringify(lockfile, null, 2))
}

function joinPath(...parts: string[]): string {
  const joined = parts.join('/')
  const normalized = joined.replace(/\/+|\\+/g, '/').replace(/\/+$/, '') || '/'
  if (parts[0]?.startsWith('/') && !normalized.startsWith('/')) {
    return `/${normalized}`
  }
  return normalized
}
