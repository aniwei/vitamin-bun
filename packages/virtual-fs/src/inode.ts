import {
  type Inode,
  type Metadata,
  InodeKind,
} from './types.js'

let nextIno = 1

function now(): number {
  return Date.now()
}

function defaultMetadata(mode: number, size = 0): Metadata {
  const t = now()
  return { size, atimeMs: t, mtimeMs: t, ctimeMs: t, mode }
}

/** Create a new file inode. */
export function createFileInode(
  data: Uint8Array = new Uint8Array(0),
  mode = 0o644,
): Inode {
  return {
    ino: nextIno++,
    kind: InodeKind.File,
    data,
    children: new Map(),
    target: '',
    metadata: defaultMetadata(mode, data.byteLength),
  }
}

/** Create a new directory inode. */
export function createDirectoryInode(mode = 0o755): Inode {
  return {
    ino: nextIno++,
    kind: InodeKind.Directory,
    data: new Uint8Array(0),
    children: new Map(),
    target: '',
    metadata: defaultMetadata(mode),
  }
}

/** Create a new symlink inode. */
export function createSymlinkInode(target: string): Inode {
  return {
    ino: nextIno++,
    kind: InodeKind.Symlink,
    data: new Uint8Array(0),
    children: new Map(),
    target,
    metadata: defaultMetadata(0o777),
  }
}

/**
 * Reset the global inode counter. Intended for testing only.
 */
export function resetInodeCounter(): void {
  nextIno = 1
}
