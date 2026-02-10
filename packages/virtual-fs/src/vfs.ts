import {
  type FileDescriptor,
  type DirectoryEntry,
  type Inode,
  type OpenFlags,
  type VFSOptions,
  InodeKind,
  Whence,
} from './types'
import {
  createFileInode,
  createDirectoryInode,
} from './inode'

const encoder = new TextEncoder()
const decoder = new TextDecoder()

export class VirtualFileSystem {
  private inodes = new Map<number, Inode>()
  private fds = new Map<number, FileDescriptor>()
  private root: Inode
  private nextFd = 3 
  private onCreate?: VFSOptions['onCreate']
  private onDelete?: VFSOptions['onDelete']
  private onMove?: VFSOptions['onMove']

  constructor(_options?: VFSOptions) {
    this.onCreate = _options?.onCreate
    this.onDelete = _options?.onDelete
    this.onMove = _options?.onMove
    this.root = createDirectoryInode()
    this.inodes.set(this.root.ino, this.root)
  }

  private segments(path: string): string[] {
    return path
      .split('/')
      .filter((s) => s !== '' && s !== '.')
  }

  resolve(path: string): Inode | undefined {
    const parts = this.segments(path)
    let current = this.root

    for (const part of parts) {
      if (part === '..') {
        continue
      }
      if (current.kind !== InodeKind.Directory) {
        return undefined
      }
      const childIno = current.children.get(part)
      if (childIno === undefined) {
        return undefined
      }
      const child = this.inodes.get(childIno)
      if (!child) {
        return undefined
      }
      current = child
    }

    return current
  }

  private resolveParent(
    path: string,
  ): { parent: Inode; name: string } | undefined {
    const parts = this.segments(path)
    if (parts.length === 0) {
      return undefined
    }
    const name = parts.pop()!
    let current = this.root

    for (const part of parts) {
      if (current.kind !== InodeKind.Directory) return undefined
      
      const childIno = current.children.get(part)
      if (childIno === undefined) return undefined
      
      const child = this.inodes.get(childIno)
      if (!child) return undefined
      current = child
    }

    if (current.kind !== InodeKind.Directory) return undefined
    return { parent: current, name }
  }

  mkdir(path: string): void {
    const result = this.resolveParent(path)
    if (!result) throw new Error(`ENOENT: parent not found for ${path}`)

    const { parent, name } = result
    if (parent.children.has(name)) {
      throw new Error(`EEXIST: ${path} already exists`)
    }

    const dir = createDirectoryInode()
    this.inodes.set(dir.ino, dir)
    parent.children.set(name, dir.ino)
    this.onCreate?.({ path, kind: 'directory' })
  }

  mkdirp(path: string): void {
    const parts = this.segments(path)
    let current = this.root
    let currentPath = ''

    for (const part of parts) {
      let childIno = current.children.get(part)
      if (childIno === undefined) {
        const dir = createDirectoryInode()
        this.inodes.set(dir.ino, dir)
        current.children.set(part, dir.ino)
        childIno = dir.ino
        currentPath = `${currentPath}/${part}`.replace(/\/+/g, '/')
        this.onCreate?.({ path: currentPath || '/', kind: 'directory' })
      } else {
        currentPath = `${currentPath}/${part}`.replace(/\/+/g, '/')
      }
      const child = this.inodes.get(childIno)
      if (!child || child.kind !== InodeKind.Directory) {
        throw new Error(`ENOTDIR: ${part} is not a directory`)
      }
      current = child
    }
  }

  readdir(path: string): DirectoryEntry[] {
    const dir = this.resolve(path)
    if (!dir) throw new Error(`ENOENT: ${path} not found`)
    if (dir.kind !== InodeKind.Directory) {
      throw new Error(`ENOTDIR: ${path} is not a directory`)
    }

    const entries: DirectoryEntry[] = []
    for (const [name, ino] of dir.children) {
      const child = this.inodes.get(ino)
      if (child) {
        entries.push({ name, ino, kind: child.kind })
      }
    }
    return entries
  }

  writeFile(path: string, content: string | Uint8Array): void {
    const data = typeof content === 'string' ? encoder.encode(content) : content
    const result = this.resolveParent(path)
    if (!result) throw new Error(`ENOENT: parent not found for ${path}`)
    const { parent, name } = result

    const existingIno = parent.children.get(name)
    if (existingIno !== undefined) {
      const existing = this.inodes.get(existingIno)
      if (!existing) throw new Error(`EIO: inode missing for ${path}`)
      if (existing.kind !== InodeKind.File) {
        throw new Error(`EISDIR: ${path} is a directory`)
      }

      existing.data = data
      existing.metadata.size = data.byteLength
      existing.metadata.mtimeMs = Date.now()
      return
    }

    const file = createFileInode(data)
    this.inodes.set(file.ino, file)
    parent.children.set(name, file.ino)
    this.onCreate?.({ path, kind: 'file' })
  }

  readFileBytes(path: string): Uint8Array {
    const inode = this.resolve(path)
    if (!inode) throw new Error(`ENOENT: ${path} not found`)
    if (inode.kind !== InodeKind.File) {
      throw new Error(`EISDIR: ${path} is not a file`)
    }
    inode.metadata.atimeMs = Date.now()
    return inode.data
  }

  readFile(path: string): string {
    return decoder.decode(this.readFileBytes(path))
  }

  unlink(path: string): void {
    const result = this.resolveParent(path)
    if (!result) throw new Error(`ENOENT: ${path} not found`)
      
    const { parent, name } = result
    const ino = parent.children.get(name)
    if (ino === undefined) throw new Error(`ENOENT: ${path} not found`)

    const inode = this.inodes.get(ino)
    if (!inode) throw new Error(`EIO: inode missing for ${path}`)
    if (inode.kind === InodeKind.Directory) {
      throw new Error(`EISDIR: ${path} is a directory, use rmdir`)
    }

    parent.children.delete(name)
    this.inodes.delete(ino)
    this.onDelete?.({ path, kind: 'file' })
  }

  rmdir(path: string): void {
    const result = this.resolveParent(path)
    if (!result) throw new Error(`ENOENT: ${path} not found`)

    const { parent, name } = result
    const ino = parent.children.get(name)
    
    if (ino === undefined) throw new Error(`ENOENT: ${path} not found`)
    const inode = this.inodes.get(ino)
    
    if (!inode) throw new Error(`EIO: inode missing`)
    if (inode.kind !== InodeKind.Directory) {
      throw new Error(`ENOTDIR: ${path} is not a directory`)
    }

    if (inode.children.size > 0) {
      throw new Error(`ENOTEMPTY: ${path} is not empty`)
    }

    parent.children.delete(name)
    this.inodes.delete(ino)
    this.onDelete?.({ path, kind: 'directory' })
  }

  /** Move or rename a file or directory. */
  rename(from: string, to: string): void {
    const fromResult = this.resolveParent(from)
    if (!fromResult) throw new Error(`ENOENT: ${from} not found`)
    const toResult = this.resolveParent(to)
    if (!toResult) throw new Error(`ENOENT: parent not found for ${to}`)

    const { parent: fromParent, name: fromName } = fromResult
    const { parent: toParent, name: toName } = toResult
    const ino = fromParent.children.get(fromName)
    if (ino === undefined) throw new Error(`ENOENT: ${from} not found`)
    if (toParent.children.has(toName)) {
      throw new Error(`EEXIST: ${to} already exists`)
    }

    fromParent.children.delete(fromName)
    toParent.children.set(toName, ino)
    const inode = this.inodes.get(ino)
    const kind = inode?.kind === InodeKind.Directory ? 'directory' : 'file'
    this.onMove?.({ from, to, kind })
  }

  stat(path: string): { kind: InodeKind } & import('./types').Metadata {
    const inode = this.resolve(path)
    if (!inode) throw new Error(`ENOENT: ${path} not found`)
    return { kind: inode.kind, ...inode.metadata }
  }

  exists(path: string): boolean {
    return this.resolve(path) !== undefined
  }

  open(path: string, flags: Partial<OpenFlags> = {}): number {
    const fullFlags: OpenFlags = {
      read: true,
      write: false,
      create: false,
      truncate: false,
      append: false,
      exclusive: false,
      ...flags,
    }

    let inode = this.resolve(path)
    if (!inode && fullFlags.create) {
      this.writeFile(path, new Uint8Array(0))
      inode = this.resolve(path)
    }
    if (!inode) throw new Error(`ENOENT: ${path} not found`)
    if (inode.kind !== InodeKind.File) {
      throw new Error(`EISDIR: cannot open directory as file`)
    }
    if (fullFlags.exclusive && inode) {
      throw new Error(`EEXIST: ${path} already exists (exclusive)`)
    }
    if (fullFlags.truncate && fullFlags.write) {
      inode.data = new Uint8Array(0)
      inode.metadata.size = 0
      inode.metadata.mtimeMs = Date.now()
    }

    const fd: FileDescriptor = {
      fd: this.nextFd++,
      ino: inode.ino,
      offset: fullFlags.append ? inode.data.byteLength : 0,
      flags: fullFlags,
    }
    this.fds.set(fd.fd, fd)
    return fd.fd
  }

  fdRead(fd: number, length: number): Uint8Array {
    const desc = this.fds.get(fd)
    if (!desc) throw new Error(`EBADF: bad file descriptor ${fd}`)
    const inode = this.inodes.get(desc.ino)
    if (!inode) throw new Error(`EIO: inode missing`)

    const end = Math.min(desc.offset + length, inode.data.byteLength)
    const slice = inode.data.slice(desc.offset, end)
    desc.offset = end
    inode.metadata.atimeMs = Date.now()
    return slice
  }

  fdWrite(fd: number, data: Uint8Array): number {
    const desc = this.fds.get(fd)
    if (!desc) throw new Error(`EBADF: bad file descriptor ${fd}`)
    if (!desc.flags.write) throw new Error(`EBADF: fd not writable`)
    const inode = this.inodes.get(desc.ino)
    if (!inode) throw new Error(`EIO: inode missing`)

    const newSize = Math.max(inode.data.byteLength, desc.offset + data.byteLength)
    if (newSize > inode.data.byteLength) {
      const expanded = new Uint8Array(newSize)
      expanded.set(inode.data)
      inode.data = expanded
    }
    inode.data.set(data, desc.offset)
    desc.offset += data.byteLength
    inode.metadata.size = inode.data.byteLength
    inode.metadata.mtimeMs = Date.now()
    return data.byteLength
  }

  fdSeek(fd: number, offset: number, whence: Whence): number {
    const desc = this.fds.get(fd)
    if (!desc) throw new Error(`EBADF: bad file descriptor ${fd}`)
    const inode = this.inodes.get(desc.ino)
    if (!inode) throw new Error(`EIO: inode missing`)

    switch (whence) {
      case Whence.Set:
        desc.offset = offset
        break
      case Whence.Current:
        desc.offset += offset
        break
      case Whence.End:
        desc.offset = inode.data.byteLength + offset
        break
    }

    if (desc.offset < 0) desc.offset = 0
    return desc.offset
  }

  close(fd: number): void {
    if (!this.fds.has(fd)) throw new Error(`EBADF: bad file descriptor ${fd}`)
    this.fds.delete(fd)
  }
}
