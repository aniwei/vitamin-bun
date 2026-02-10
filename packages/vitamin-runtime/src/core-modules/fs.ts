import type { VirtualFileSystem, Metadata, InodeKind } from '@vitamin-ai/virtual-fs'
import { join } from '../path'

export function createFsModule(vfs: VirtualFileSystem) {
  return {
    readFileSync(path: string, encoding?: string): string | Uint8Array {
      if (encoding === 'utf8' || encoding === 'utf-8') return vfs.readFile(path)
      return vfs.readFileBytes(path)
    },
    async readFile(path: string, encoding?: string): Promise<string | Uint8Array> {
      return this.readFileSync(path, encoding)
    },
    writeFileSync(path: string, data: string | Uint8Array): void {
      vfs.writeFile(path, data)
    },
    async writeFile(path: string, data: string | Uint8Array): Promise<void> {
      this.writeFileSync(path, data)
    },
    readdirSync(path: string): string[] {
      return vfs.readdir(path).map((e) => e.name)
    },
    async readdir(path: string): Promise<string[]> {
      return this.readdirSync(path)
    },
    existsSync(path: string): boolean {
      return vfs.exists(path)
    },
    statSync(path: string) {
      return createStats(vfs.stat(path))
    },
    async stat(path: string) {
      return this.statSync(path)
    },
    mkdirSync(path: string, options?: { recursive?: boolean }): void {
      if (options?.recursive) {
        vfs.mkdirp(path)
        return
      }
      vfs.mkdir(path)
    },
    async mkdir(path: string, options?: { recursive?: boolean }): Promise<void> {
      this.mkdirSync(path, options)
    },
    rmSync(path: string, options?: { recursive?: boolean; force?: boolean }): void {
      removePath(vfs, path, options?.recursive ?? false, options?.force ?? false)
    },
    async rm(path: string, options?: { recursive?: boolean; force?: boolean }): Promise<void> {
      this.rmSync(path, options)
    },
  }
}

export function createFsPromisesModule(vfs: VirtualFileSystem) {
  return {
    async readFile(path: string, encoding?: string): Promise<string | Uint8Array> {
      if (encoding === 'utf8' || encoding === 'utf-8') return vfs.readFile(path)
      return vfs.readFileBytes(path)
    },
    async writeFile(path: string, data: string | Uint8Array): Promise<void> {
      vfs.writeFile(path, data)
    },
    async readdir(path: string): Promise<string[]> {
      return vfs.readdir(path).map((e) => e.name)
    },
    async stat(path: string) {
      return createStats(vfs.stat(path))
    },
    async mkdir(path: string, options?: { recursive?: boolean }): Promise<void> {
      if (options?.recursive) {
        vfs.mkdirp(path)
        return
      }
      vfs.mkdir(path)
    },
    async rm(path: string, options?: { recursive?: boolean; force?: boolean }): Promise<void> {
      removePath(vfs, path, options?.recursive ?? false, options?.force ?? false)
    },
  }
}

function createStats(stat: Metadata & { kind: InodeKind }) {
  return {
    ...stat,
    isFile: () => stat.kind === 'file',
    isDirectory: () => stat.kind === 'directory',
  }
}

function removePath(vfs: VirtualFileSystem, path: string, recursive: boolean, force: boolean): void {
  if (!vfs.exists(path)) {
    if (force) return
    throw new Error(`ENOENT: ${path} not found`)
  }

  const stat = vfs.stat(path)
  if (stat.kind === 'directory') {
    if (recursive) {
      const entries = vfs.readdir(path)
      for (const entry of entries) {
        removePath(vfs, join(path, entry.name), true, force)
      }
    }
    vfs.rmdir(path)
    return
  }

  vfs.unlink(path)
}
