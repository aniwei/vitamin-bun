/**
 * Type definitions for the virtual filesystem.
 */

/** Supported inode types. */
export enum InodeKind {
  File = 'file',
  Directory = 'directory',
  Symlink = 'symlink',
}

/** File metadata mirroring POSIX stat fields. */
export interface Metadata {
  /** File size in bytes. */
  size: number
  /** Last access time (ms since epoch). */
  atimeMs: number
  /** Last modification time (ms since epoch). */
  mtimeMs: number
  /** Creation time (ms since epoch). */
  ctimeMs: number
  /** POSIX permission bits (e.g. 0o755). */
  mode: number
}

/** A single filesystem inode. */
export interface Inode {
  /** Unique inode number. */
  ino: number
  /** Entry type. */
  kind: InodeKind
  /** File content (only for File inodes). */
  data: Uint8Array
  /** Child entries mapping name → inode number (only for Directory inodes). */
  children: Map<string, number>
  /** Symlink target path (only for Symlink inodes). */
  target: string
  /** File metadata. */
  metadata: Metadata
}

/** Flags for opening a file. */
export interface OpenFlags {
  read: boolean
  write: boolean
  create: boolean
  truncate: boolean
  append: boolean
  exclusive: boolean
}

/** Seek origin for fd_seek. */
export enum Whence {
  /** Seek from the beginning of the file. */
  Set = 0,
  /** Seek from the current position. */
  Current = 1,
  /** Seek from the end of the file. */
  End = 2,
}

/** A directory entry returned by readdir. */
export interface DirectoryEntry {
  name: string
  ino: number
  kind: InodeKind
}

/** An open file descriptor. */
export interface FileDescriptor {
  /** File descriptor number. */
  fd: number
  /** Inode number this fd points to. */
  ino: number
  /** Current seek offset. */
  offset: number
  /** Open flags. */
  flags: OpenFlags
}

/** Storage backend interface for pluggable persistence. */
export interface StorageBackend {
  /** Read the entire content of a file by inode number. */
  read(ino: number): Promise<Uint8Array>
  /** Write the entire content of a file by inode number. */
  write(ino: number, data: Uint8Array): Promise<void>
  /** Delete a file by inode number. */
  delete(ino: number): Promise<void>
  /** Check if a file exists by inode number. */
  exists(ino: number): Promise<boolean>
}

/** Mount point configuration. */
export interface MountPoint {
  /** Path where this backend is mounted. */
  path: string
  /** Storage backend to use for this mount. */
  backend: StorageBackend
}

/** Options for creating a VFS instance. */
export interface VFSOptions {
  /** Initial mount points. */
  mounts?: MountPoint[]
}
