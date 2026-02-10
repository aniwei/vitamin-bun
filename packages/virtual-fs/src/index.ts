export { VirtualFileSystem } from './vfs'
export { MemoryBackend } from './backends'
export {
  createFileInode,
  createDirectoryInode,
  createSymlinkInode,
  resetInodeCounter,
} from './inode'
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
} from './types'
