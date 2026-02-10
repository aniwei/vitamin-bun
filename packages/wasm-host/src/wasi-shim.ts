import type { VirtualFileSystem } from '@vitamin-ai/virtual-fs'
import { Whence as VfsWhence, InodeKind } from '@vitamin-ai/virtual-fs'
import type { WasiImports, WasmHostOptions } from './types'
import {
  WasiErrno,
  WasiFiletype,
  WasiClockId,
  WasiWhence,
  WasiOflags,
  WasiFdflags,
} from './types'
import { MemoryAccess } from './memory'

export class WasiShim implements WasiImports {
  private mem!: MemoryAccess
  private vfs: VirtualFileSystem
  private envVars: Record<string, string>
  private args: string[]
  private preopens: Record<string, string>
  private onStdout: (data: Uint8Array) => void
  private onStderr: (data: Uint8Array) => void

  private preopenFds = new Map<number, string>()
  private fdPaths = new Map<number, string>()
  private nextPreopenFd = 3 // 0 = stdin, 1 = stdout, 2 = stderr

  constructor(options: WasmHostOptions) {
    this.vfs = options.vfs
    this.envVars = options.env ?? {}
    this.args = options.args ?? []
    this.preopens = options.preopens ?? { '/': '/' }
    this.onStdout = options.onStdout ?? (() => {})
    this.onStderr = options.onStderr ?? (() => {})

    for (const [guestPath] of Object.entries(this.preopens)) {
      this.preopenFds.set(this.nextPreopenFd++, guestPath)
    }
  }

  setMemory(memory: WebAssembly.Memory): void {
    this.mem = new MemoryAccess(memory)
  }

  clock_time_get(id: number, _precision: bigint, out: number): number {
    this.mem.refresh()
    let timeNs: bigint

    switch (id) {
      case WasiClockId.REALTIME:
        timeNs = BigInt(Math.round(Date.now() * 1_000_000))
        break
      case WasiClockId.MONOTONIC:
        timeNs = BigInt(Math.round(performance.now() * 1_000_000))
        break
      default:
        timeNs = 0n
    }

    this.mem.view.setBigUint64(out, timeNs, true)
    return WasiErrno.SUCCESS
  }

  clock_res_get(id: number, out: number): number {
    this.mem.refresh()
    const resNs = id === WasiClockId.REALTIME ? 1_000_000n : 5_000n
    this.mem.view.setBigUint64(out, resNs, true)
    return WasiErrno.SUCCESS
  }

  fd_read(fd: number, iovs: number, iovsLen: number, nread: number): number {
    this.mem.refresh()

    if (fd === 0) {
      this.mem.view.setUint32(nread, 0, true)
      return WasiErrno.SUCCESS
    }

    try {
      let totalRead = 0

      for (let i = 0; i < iovsLen; i++) {
        const ptr = this.mem.view.getUint32(iovs + i * 8, true)
        const len = this.mem.view.getUint32(iovs + i * 8 + 4, true)

        const data = this.vfs.fdRead(fd, len)
        new Uint8Array(this.mem.memory.buffer, ptr, data.byteLength).set(data)
        totalRead += data.byteLength
        if (data.byteLength < len) break
      }

      this.mem.view.setUint32(nread, totalRead, true)
      return WasiErrno.SUCCESS
    } catch {
      return WasiErrno.EBADF
    }
  }

  fd_write(
    fd: number,
    iovs: number,
    iovsLen: number,
    nwritten: number,
  ): number {
    this.mem.refresh()

    try {
      let totalWritten = 0

      for (let i = 0; i < iovsLen; i++) {
        const ptr = this.mem.view.getUint32(iovs + i * 8, true)
        const len = this.mem.view.getUint32(iovs + i * 8 + 4, true)
        const data = new Uint8Array(this.mem.memory.buffer, ptr, len)

        if (fd === 1) {
          // stdout
          this.onStdout(data.slice())
          totalWritten += len
        } else if (fd === 2) {
          // stderr
          this.onStderr(data.slice())
          totalWritten += len
        } else {
          totalWritten += this.vfs.fdWrite(fd, data.slice())
        }
      }

      this.mem.view.setUint32(nwritten, totalWritten, true)
      return WasiErrno.SUCCESS
    } catch {
      return WasiErrno.EBADF
    }
  }

  fd_seek(
    fd: number,
    offset: bigint,
    whence: number,
    newoffset: number,
  ): number {
    this.mem.refresh()

    try {
      let vfsWhence: VfsWhence
      switch (whence) {
        case WasiWhence.SET:
          vfsWhence = VfsWhence.Set
          break
        case WasiWhence.CUR:
          vfsWhence = VfsWhence.Current
          break
        case WasiWhence.END:
          vfsWhence = VfsWhence.End
          break
        default:
          return WasiErrno.EINVAL
      }

      const newPos = this.vfs.fdSeek(fd, Number(offset), vfsWhence)
      this.mem.view.setBigUint64(newoffset, BigInt(newPos), true)
      return WasiErrno.SUCCESS
    } catch {
      return WasiErrno.EBADF
    }
  }

  fd_close(fd: number): number {
    try {
      this.vfs.close(fd)
      return WasiErrno.SUCCESS
    } catch {
      return WasiErrno.EBADF
    }
  }

  fd_fdstat_get(fd: number, buf: number): number {
    this.mem.refresh()

    if (fd <= 2) {
      // stdin/stdout/stderr → character device
      this.mem.view.setUint8(buf, WasiFiletype.CHARACTER_DEVICE)
      this.mem.view.setUint16(buf + 2, 0, true) // flags
      this.mem.view.setBigUint64(buf + 8, 0xffffffffffffffffn, true) // rights base
      this.mem.view.setBigUint64(buf + 16, 0xffffffffffffffffn, true) // rights inheriting
      return WasiErrno.SUCCESS
    }

    try {
      const path = this.fdPaths.get(fd) ?? this.preopenFds.get(fd)
      if (!path) return WasiErrno.EBADF
      const stat = this.vfs.stat(path)
      const filetype =
        stat.kind === InodeKind.Directory
          ? WasiFiletype.DIRECTORY
          : WasiFiletype.REGULAR_FILE
      this.mem.view.setUint8(buf, filetype)
      this.mem.view.setUint16(buf + 2, 0, true)
      this.mem.view.setBigUint64(buf + 8, 0xffffffffffffffffn, true)
      this.mem.view.setBigUint64(buf + 16, 0xffffffffffffffffn, true)
      return WasiErrno.SUCCESS
    } catch {
      return WasiErrno.EBADF
    }
  }

  fd_fdstat_set_flags(_fd: number, _flags: number): number {
    return WasiErrno.SUCCESS // no-op
  }

  fd_filestat_get(fd: number, buf: number): number {
    this.mem.refresh()

    try {
      const path = this.fdPaths.get(fd) ?? this.preopenFds.get(fd)
      if (!path) return WasiErrno.EBADF
      const stat = this.vfs.stat(path)
      const filetype =
        stat.kind === InodeKind.Directory
          ? WasiFiletype.DIRECTORY
          : WasiFiletype.REGULAR_FILE

      // filestat struct: dev(8) + ino(8) + filetype(1) + pad(7) + nlink(8) + size(8) + atim(8) + mtim(8) + ctim(8)
      this.mem.view.setBigUint64(buf, 0n, true) // dev
      this.mem.view.setBigUint64(buf + 8, 0n, true) // ino
      this.mem.view.setUint8(buf + 16, filetype)
      this.mem.view.setBigUint64(buf + 24, 1n, true) // nlink
      this.mem.view.setBigUint64(buf + 32, BigInt(stat.size), true) // size
      this.mem.view.setBigUint64(buf + 40, BigInt(stat.atimeMs * 1_000_000), true) // atim
      this.mem.view.setBigUint64(buf + 48, BigInt(stat.mtimeMs * 1_000_000), true) // mtim
      this.mem.view.setBigUint64(buf + 56, BigInt(stat.ctimeMs * 1_000_000), true) // ctim

      return WasiErrno.SUCCESS
    } catch {
      return WasiErrno.EBADF
    }
  }

  fd_prestat_get(fd: number, buf: number): number {
    this.mem.refresh()
    const path = this.preopenFds.get(fd)
    if (path === undefined) return WasiErrno.EBADF

    // prestat type: directory (0)
    this.mem.view.setUint8(buf, 0)
    // prestat_dir: pr_name_len
    const nameLen = new TextEncoder().encode(path).byteLength
    this.mem.view.setUint32(buf + 4, nameLen, true)
    return WasiErrno.SUCCESS
  }

  fd_prestat_dir_name(fd: number, pathPtr: number, pathLen: number): number {
    this.mem.refresh()
    const path = this.preopenFds.get(fd)
    if (path === undefined) return WasiErrno.EBADF

    const encoded = new TextEncoder().encode(path)
    const copyLen = Math.min(encoded.byteLength, pathLen)
    new Uint8Array(this.mem.memory.buffer, pathPtr, copyLen).set(
      encoded.subarray(0, copyLen),
    )
    return WasiErrno.SUCCESS
  }

  fd_readdir(
    fd: number,
    buf: number,
    bufLen: number,
    _cookie: bigint,
    used: number,
  ): number {
    this.mem.refresh()

    try {
      const path = this.fdPaths.get(fd) ?? this.preopenFds.get(fd)
      if (!path) return WasiErrno.EBADF
      const entries = this.vfs.readdir(path)
      let offset = 0

      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i]
        const nameBytes = new TextEncoder().encode(entry.name)

        // dirent: d_next(8) + d_ino(8) + d_namlen(4) + d_type(1) + pad(3) + name
        const entrySize = 24 + nameBytes.byteLength
        if (offset + entrySize > bufLen) break

        this.mem.view.setBigUint64(buf + offset, BigInt(i + 1), true) // d_next
        this.mem.view.setBigUint64(buf + offset + 8, 0n, true) // d_ino (unknown)
        this.mem.view.setUint32(buf + offset + 16, nameBytes.byteLength, true) // d_namlen
        this.mem.view.setUint8(buf + offset + 20, WasiFiletype.REGULAR_FILE) // d_type (simplified)
        new Uint8Array(this.mem.memory.buffer, buf + offset + 24, nameBytes.byteLength).set(nameBytes)

        offset += entrySize
      }

      this.mem.view.setUint32(used, offset, true)
      return WasiErrno.SUCCESS
    } catch {
      return WasiErrno.EBADF
    }
  }

  fd_advise(
    _fd: number,
    _offset: bigint,
    _len: bigint,
    _advice: number,
  ): number {
    return WasiErrno.SUCCESS // no-op
  }

  fd_allocate(_fd: number, _offset: bigint, _len: bigint): number {
    return WasiErrno.ENOSYS
  }

  fd_datasync(_fd: number): number {
    return WasiErrno.SUCCESS // no-op (in-memory)
  }

  fd_sync(_fd: number): number {
    return WasiErrno.SUCCESS // no-op (in-memory)
  }

  fd_tell(fd: number, offset: number): number {
    this.mem.refresh()
    try {
      const pos = this.vfs.fdSeek(fd, 0, VfsWhence.Current)
      this.mem.view.setBigUint64(offset, BigInt(pos), true)
      return WasiErrno.SUCCESS
    } catch {
      return WasiErrno.EBADF
    }
  }

  fd_renumber(_from: number, _to: number): number {
    return WasiErrno.ENOSYS
  }

  fd_filestat_set_size(_fd: number, _size: bigint): number {
    return WasiErrno.ENOSYS
  }

  fd_filestat_set_times(
    _fd: number,
    _atim: bigint,
    _mtim: bigint,
    _fstFlags: number,
  ): number {
    return WasiErrno.SUCCESS // no-op
  }

  fd_pread(
    _fd: number,
    _iovs: number,
    _iovsLen: number,
    _offset: bigint,
    _nread: number,
  ): number {
    return WasiErrno.ENOSYS
  }

  fd_pwrite(
    _fd: number,
    _iovs: number,
    _iovsLen: number,
    _offset: bigint,
    _nwritten: number,
  ): number {
    return WasiErrno.ENOSYS
  }

  path_open(
    dirfd: number,
    _dirflags: number,
    pathPtr: number,
    pathLen: number,
    oflags: number,
    _fsRightsBase: bigint,
    _fsRightsInheriting: bigint,
    fdflags: number,
    fdOut: number,
  ): number {
    this.mem.refresh()

    try {
      const path = this.mem.readString(pathPtr, pathLen)

      let fullPath = path
      if (!path.startsWith('/')) {
        const dirPath = this.preopenFds.get(dirfd)
        if (dirPath) {
          fullPath = dirPath === '/' ? `/${path}` : `${dirPath}/${path}`
        }
      }

      const openFlags = {
        read: true,
        write: !!(fdflags & WasiFdflags.APPEND) || !(oflags & WasiOflags.DIRECTORY),
        create: !!(oflags & WasiOflags.CREAT),
        truncate: !!(oflags & WasiOflags.TRUNC),
        append: !!(fdflags & WasiFdflags.APPEND),
        exclusive: !!(oflags & WasiOflags.EXCL),
      }

      const fd = this.vfs.open(fullPath, openFlags)
      this.fdPaths.set(fd, fullPath)
      this.mem.view.setUint32(fdOut, fd, true)
      return WasiErrno.SUCCESS
    } catch (e) {
      if (e instanceof Error) {
        if (e.message.includes('ENOENT')) return WasiErrno.ENOENT
        if (e.message.includes('EISDIR')) return WasiErrno.EISDIR
        if (e.message.includes('EEXIST')) return WasiErrno.EEXIST
      }
      return WasiErrno.EIO
    }
  }

  path_filestat_get(
    fd: number,
    _flags: number,
    pathPtr: number,
    pathLen: number,
    buf: number,
  ): number {
    this.mem.refresh()

    try {
      const path = this.mem.readString(pathPtr, pathLen)

      let fullPath = path
      if (!path.startsWith('/')) {
        const dirPath = this.preopenFds.get(fd)
        if (dirPath) {
          fullPath = dirPath === '/' ? `/${path}` : `${dirPath}/${path}`
        }
      }

      // Stat directly via path
      const stat = this.vfs.stat(fullPath)
      const filetype =
        stat.kind === InodeKind.Directory
          ? WasiFiletype.DIRECTORY
          : WasiFiletype.REGULAR_FILE

      // Write filestat struct
      this.mem.view.setBigUint64(buf, 0n, true) // dev
      this.mem.view.setBigUint64(buf + 8, 0n, true) // ino
      this.mem.view.setUint8(buf + 16, filetype)
      this.mem.view.setBigUint64(buf + 24, 1n, true) // nlink
      this.mem.view.setBigUint64(buf + 32, BigInt(stat.size), true)
      this.mem.view.setBigUint64(buf + 40, BigInt(stat.atimeMs * 1_000_000), true)
      this.mem.view.setBigUint64(buf + 48, BigInt(stat.mtimeMs * 1_000_000), true)
      this.mem.view.setBigUint64(buf + 56, BigInt(stat.ctimeMs * 1_000_000), true)
      return WasiErrno.SUCCESS
    } catch {
      return WasiErrno.ENOENT
    }
  }

  path_filestat_set_times(
    _fd: number,
    _flags: number,
    _path: number,
    _pathLen: number,
    _atim: bigint,
    _mtim: bigint,
    _fstFlags: number,
  ): number {
    return WasiErrno.SUCCESS // no-op
  }

  path_create_directory(fd: number, pathPtr: number, pathLen: number): number {
    this.mem.refresh()

    try {
      const path = this.mem.readString(pathPtr, pathLen)

      let fullPath = path
      if (!path.startsWith('/')) {
        const dirPath = this.preopenFds.get(fd)
        if (dirPath) {
          fullPath = dirPath === '/' ? `/${path}` : `${dirPath}/${path}`
        }
      }

      this.vfs.mkdir(fullPath)
      return WasiErrno.SUCCESS
    } catch {
      return WasiErrno.EIO
    }
  }

  path_unlink_file(fd: number, pathPtr: number, pathLen: number): number {
    this.mem.refresh()

    try {
      const path = this.mem.readString(pathPtr, pathLen)

      let fullPath = path
      if (!path.startsWith('/')) {
        const dirPath = this.preopenFds.get(fd)
        if (dirPath) {
          fullPath = dirPath === '/' ? `/${path}` : `${dirPath}/${path}`
        }
      }

      this.vfs.unlink(fullPath)
      return WasiErrno.SUCCESS
    } catch {
      return WasiErrno.ENOENT
    }
  }

  path_remove_directory(fd: number, pathPtr: number, pathLen: number): number {
    this.mem.refresh()

    try {
      const path = this.mem.readString(pathPtr, pathLen)

      let fullPath = path
      if (!path.startsWith('/')) {
        const dirPath = this.preopenFds.get(fd)
        if (dirPath) {
          fullPath = dirPath === '/' ? `/${path}` : `${dirPath}/${path}`
        }
      }

      this.vfs.rmdir(fullPath)
      return WasiErrno.SUCCESS
    } catch {
      return WasiErrno.ENOENT
    }
  }

  path_rename(
    _oldFd: number,
    _oldPath: number,
    _oldPathLen: number,
    _newFd: number,
    _newPath: number,
    _newPathLen: number,
  ): number {
    return WasiErrno.ENOSYS
  }

  path_symlink(
    _oldPath: number,
    _oldPathLen: number,
    _fd: number,
    _newPath: number,
    _newPathLen: number,
  ): number {
    return WasiErrno.ENOSYS
  }

  path_readlink(
    _fd: number,
    _path: number,
    _pathLen: number,
    _buf: number,
    _bufLen: number,
    _used: number,
  ): number {
    return WasiErrno.ENOSYS
  }

  path_link(
    _oldFd: number,
    _oldFlags: number,
    _oldPath: number,
    _oldPathLen: number,
    _newFd: number,
    _newPath: number,
    _newPathLen: number,
  ): number {
    return WasiErrno.ENOSYS
  }

  // ─── Environment ────────────────────────────────────────────

  environ_get(environ: number, buf: number): number {
    this.mem.refresh()

    const entries = Object.entries(this.envVars)
    let bufOffset = buf

    for (let i = 0; i < entries.length; i++) {
      const [key, value] = entries[i]
      const str = `${key}=${value}\0`
      const encoded = new TextEncoder().encode(str)

      // Write pointer to the string
      this.mem.view.setUint32(environ + i * 4, bufOffset, true)

      // Write the string data
      new Uint8Array(this.mem.memory.buffer, bufOffset, encoded.byteLength).set(
        encoded,
      )
      bufOffset += encoded.byteLength
    }

    return WasiErrno.SUCCESS
  }

  environ_sizes_get(countOut: number, sizeOut: number): number {
    this.mem.refresh()

    const entries = Object.entries(this.envVars)
    const count = entries.length
    let size = 0
    for (const [key, value] of entries) {
      size += new TextEncoder().encode(`${key}=${value}\0`).byteLength
    }

    this.mem.view.setUint32(countOut, count, true)
    this.mem.view.setUint32(sizeOut, size, true)
    return WasiErrno.SUCCESS
  }

  args_get(argv: number, buf: number): number {
    this.mem.refresh()

    let bufOffset = buf
    for (let i = 0; i < this.args.length; i++) {
      const str = `${this.args[i]}\0`
      const encoded = new TextEncoder().encode(str)

      this.mem.view.setUint32(argv + i * 4, bufOffset, true)
      new Uint8Array(this.mem.memory.buffer, bufOffset, encoded.byteLength).set(
        encoded,
      )
      bufOffset += encoded.byteLength
    }

    return WasiErrno.SUCCESS
  }

  args_sizes_get(argc: number, bufSize: number): number {
    this.mem.refresh()

    let size = 0
    for (const arg of this.args) {
      size += new TextEncoder().encode(`${arg}\0`).byteLength
    }

    this.mem.view.setUint32(argc, this.args.length, true)
    this.mem.view.setUint32(bufSize, size, true)
    return WasiErrno.SUCCESS
  }

  // ─── Process ────────────────────────────────────────────────

  proc_exit(code: number): never {
    throw new WasiExitError(code)
  }

  proc_raise(_sig: number): number {
    return WasiErrno.ENOSYS
  }

  sched_yield(): number {
    return WasiErrno.SUCCESS
  }

  random_get(buf: number, len: number): number {
    this.mem.refresh()
    const bytes = new Uint8Array(this.mem.memory.buffer, buf, len)
    crypto.getRandomValues(bytes)
    return WasiErrno.SUCCESS
  }

  poll_oneoff(
    _inSubs: number,
    _outEvents: number,
    _nsubscriptions: number,
    _nevents: number,
  ): number {
    return WasiErrno.ENOSYS
  }

  // ─── Socket (stub) ──────────────────────────────────────────

  sock_accept(
    _fd: number,
    _flags: number,
    _newFd: number,
  ): number {
    return WasiErrno.ENOSYS
  }

  sock_recv(
    _fd: number,
    _riData: number,
    _riDataLen: number,
    _riFlags: number,
    _roDataLen: number,
    _roFlags: number,
  ): number {
    return WasiErrno.ENOSYS
  }

  sock_send(
    _fd: number,
    _siData: number,
    _siDataLen: number,
    _siFlags: number,
    _soDataLen: number,
  ): number {
    return WasiErrno.ENOSYS
  }

  sock_shutdown(_fd: number, _how: number): number {
    return WasiErrno.ENOSYS
  }

  getImports(): { wasi_snapshot_preview1: WasiImports } {
    return {
      wasi_snapshot_preview1: {
        clock_time_get: this.clock_time_get.bind(this),
        clock_res_get: this.clock_res_get.bind(this),
        fd_read: this.fd_read.bind(this),
        fd_write: this.fd_write.bind(this),
        fd_seek: this.fd_seek.bind(this),
        fd_close: this.fd_close.bind(this),
        fd_fdstat_get: this.fd_fdstat_get.bind(this),
        fd_fdstat_set_flags: this.fd_fdstat_set_flags.bind(this),
        fd_filestat_get: this.fd_filestat_get.bind(this),
        fd_prestat_get: this.fd_prestat_get.bind(this),
        fd_prestat_dir_name: this.fd_prestat_dir_name.bind(this),
        fd_readdir: this.fd_readdir.bind(this),
        fd_advise: this.fd_advise.bind(this),
        fd_allocate: this.fd_allocate.bind(this),
        fd_datasync: this.fd_datasync.bind(this),
        fd_sync: this.fd_sync.bind(this),
        fd_tell: this.fd_tell.bind(this),
        fd_renumber: this.fd_renumber.bind(this),
        fd_filestat_set_size: this.fd_filestat_set_size.bind(this),
        fd_filestat_set_times: this.fd_filestat_set_times.bind(this),
        fd_pread: this.fd_pread.bind(this),
        fd_pwrite: this.fd_pwrite.bind(this),
        path_open: this.path_open.bind(this),
        path_filestat_get: this.path_filestat_get.bind(this),
        path_filestat_set_times: this.path_filestat_set_times.bind(this),
        path_create_directory: this.path_create_directory.bind(this),
        path_unlink_file: this.path_unlink_file.bind(this),
        path_remove_directory: this.path_remove_directory.bind(this),
        path_rename: this.path_rename.bind(this),
        path_symlink: this.path_symlink.bind(this),
        path_readlink: this.path_readlink.bind(this),
        path_link: this.path_link.bind(this),
        environ_get: this.environ_get.bind(this),
        environ_sizes_get: this.environ_sizes_get.bind(this),
        args_get: this.args_get.bind(this),
        args_sizes_get: this.args_sizes_get.bind(this),
        proc_exit: this.proc_exit.bind(this),
        proc_raise: this.proc_raise.bind(this),
        sched_yield: this.sched_yield.bind(this),
        random_get: this.random_get.bind(this),
        poll_oneoff: this.poll_oneoff.bind(this),
        sock_accept: this.sock_accept.bind(this),
        sock_recv: this.sock_recv.bind(this),
        sock_send: this.sock_send.bind(this),
        sock_shutdown: this.sock_shutdown.bind(this),
      },
    }
  }
}

export class WasiExitError extends Error {
  constructor(public readonly exitCode: number) {
    super(`WASI proc_exit with code ${exitCode}`)
    this.name = 'WasiExitError'
  }
}
