export { VirtualFileSystem } from './vfs.js'
export { MemoryBackend } from './backends/index.js'
export {
  createFileInode,
  createDirectoryInode,
  createSymlinkInode,
  resetInodeCounter,
} from './inode.js'
export {
  type Inode,
  type Metadata,
  type FileDescriptor,
  type DirectoryEntry,
  type OpenFlags,
  type StorageBackend,
  type MountPoint,
  type VFSOptions,
  InodeKind,
  Whence,
} from './types.js'
