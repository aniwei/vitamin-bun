
export enum InodeKind {
  File = 'file',
  Directory = 'directory',
  Symlink = 'symlink',
}

export interface Metadata {
  size: number
  atimeMs: number
  mtimeMs: number
  ctimeMs: number
  mode: number
}

export interface Inode {
  ino: number
  kind: InodeKind
  data: Uint8Array
  children: Map<string, number>
  target: string
  metadata: Metadata
}

export interface OpenFlags {
  read: boolean
  write: boolean
  create: boolean
  truncate: boolean
  append: boolean
  exclusive: boolean
}

export enum Whence {
  Set = 0,
  Current = 1,
  End = 2,
}

export interface DirectoryEntry {
  name: string
  ino: number
  kind: InodeKind
}

export interface FileDescriptor {
  fd: number
  ino: number
  offset: number
  flags: OpenFlags
}

export interface StorageBackend {
  read(ino: number): Promise<Uint8Array>
  write(ino: number, data: Uint8Array): Promise<void>
  delete(ino: number): Promise<void>
  exists(ino: number): Promise<boolean>
}

export interface MountPoint {
  path: string
  backend: StorageBackend
}

export interface VFSOptions {
  mounts?: MountPoint[]
  onCreate?: (event: VfsCreateEvent) => void
  onDelete?: (event: VfsDeleteEvent) => void
  onMove?: (event: VfsMoveEvent) => void
}

export type VfsEntryKind = 'file' | 'directory'

export type VfsCreateEvent = {
  path: string
  kind: VfsEntryKind
}

export type VfsDeleteEvent = {
  path: string
  kind: VfsEntryKind
}

export type VfsMoveEvent = {
  from: string
  to: string
  kind: VfsEntryKind
}
