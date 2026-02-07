import type { VirtualFileSystem } from '@vitamin-ai/virtual-fs'

// ─── WASI Error Codes ───────────────────────────────────────────

/** WASI errno values (Preview 1) */
export const enum WasiErrno {
  SUCCESS = 0,
  E2BIG = 1,
  EACCES = 2,
  EADDRINUSE = 3,
  EADDRNOTAVAIL = 4,
  EAFNOSUPPORT = 5,
  EAGAIN = 6,
  EALREADY = 7,
  EBADF = 8,
  EBADMSG = 9,
  EBUSY = 10,
  ECANCELED = 11,
  EDOM = 18,
  EEXIST = 20,
  EFAULT = 21,
  EINVAL = 28,
  EIO = 29,
  EISDIR = 31,
  ENOENT = 44,
  ENOSYS = 52,
  ENOTDIR = 54,
  ENOTEMPTY = 55,
  EPERM = 63,
  ESPIPE = 70,
}

/** WASI file types */
export const enum WasiFiletype {
  UNKNOWN = 0,
  BLOCK_DEVICE = 1,
  CHARACTER_DEVICE = 2,
  DIRECTORY = 3,
  REGULAR_FILE = 4,
  SOCKET_DGRAM = 5,
  SOCKET_STREAM = 6,
  SYMBOLIC_LINK = 7,
}

/** WASI clock IDs */
export const enum WasiClockId {
  REALTIME = 0,
  MONOTONIC = 1,
  PROCESS_CPUTIME_ID = 2,
  THREAD_CPUTIME_ID = 3,
}

/** WASI open flags */
export const enum WasiOflags {
  CREAT = 1 << 0,
  DIRECTORY = 1 << 1,
  EXCL = 1 << 2,
  TRUNC = 1 << 3,
}

/** WASI fd flags */
export const enum WasiFdflags {
  APPEND = 1 << 0,
  DSYNC = 1 << 1,
  NONBLOCK = 1 << 2,
  RSYNC = 1 << 3,
  SYNC = 1 << 4,
}

/** WASI seek whence */
export const enum WasiWhence {
  SET = 0,
  CUR = 1,
  END = 2,
}

// ─── WasmHost Types ─────────────────────────────────────────────

/** Options for creating a WasmHost instance */
export interface WasmHostOptions {
  /** URL or path to the WASM binary */
  wasmUrl: string | URL

  /** Virtual filesystem instance */
  vfs: VirtualFileSystem

  /** Environment variables to expose to WASM */
  env?: Record<string, string>

  /** Command-line arguments */
  args?: string[]

  /** Preopened directories (path → fd mapping) */
  preopens?: Record<string, string>

  /** Initial heap size in bytes (default: 64MB) */
  heapSize?: number

  /** stdout callback */
  onStdout?: (data: Uint8Array) => void

  /** stderr callback */
  onStderr?: (data: Uint8Array) => void
}

/** Exports expected from the WASM module */
export interface WasmExports {
  memory: WebAssembly.Memory
  _start?: () => void
  _initialize?: () => void
  init?: (heapSize: number) => number
  [key: string]: unknown
}

/** WASI Preview 1 import interface */
export interface WasiImports {
  // Clock
  clock_time_get(id: number, precision: bigint, out: number): number
  clock_res_get(id: number, out: number): number

  // File descriptors
  fd_read(fd: number, iovs: number, iovsLen: number, nread: number): number
  fd_write(fd: number, iovs: number, iovsLen: number, nwritten: number): number
  fd_seek(fd: number, offset: bigint, whence: number, newoffset: number): number
  fd_close(fd: number): number
  fd_fdstat_get(fd: number, buf: number): number
  fd_fdstat_set_flags(fd: number, flags: number): number
  fd_filestat_get(fd: number, buf: number): number
  fd_prestat_get(fd: number, buf: number): number
  fd_prestat_dir_name(fd: number, path: number, pathLen: number): number
  fd_readdir(
    fd: number,
    buf: number,
    bufLen: number,
    cookie: bigint,
    used: number,
  ): number
  fd_advise(fd: number, offset: bigint, len: bigint, advice: number): number
  fd_allocate(fd: number, offset: bigint, len: bigint): number
  fd_datasync(fd: number): number
  fd_sync(fd: number): number
  fd_tell(fd: number, offset: number): number
  fd_renumber(from: number, to: number): number
  fd_filestat_set_size(fd: number, size: bigint): number
  fd_filestat_set_times(
    fd: number,
    atim: bigint,
    mtim: bigint,
    fstFlags: number,
  ): number
  fd_pread(
    fd: number,
    iovs: number,
    iovsLen: number,
    offset: bigint,
    nread: number,
  ): number
  fd_pwrite(
    fd: number,
    iovs: number,
    iovsLen: number,
    offset: bigint,
    nwritten: number,
  ): number

  // Path operations
  path_open(
    dirfd: number,
    dirflags: number,
    path: number,
    pathLen: number,
    oflags: number,
    fsRightsBase: bigint,
    fsRightsInheriting: bigint,
    fdflags: number,
    fd: number,
  ): number
  path_filestat_get(
    fd: number,
    flags: number,
    path: number,
    pathLen: number,
    buf: number,
  ): number
  path_filestat_set_times(
    fd: number,
    flags: number,
    path: number,
    pathLen: number,
    atim: bigint,
    mtim: bigint,
    fstFlags: number,
  ): number
  path_create_directory(fd: number, path: number, pathLen: number): number
  path_unlink_file(fd: number, path: number, pathLen: number): number
  path_remove_directory(fd: number, path: number, pathLen: number): number
  path_rename(
    oldFd: number,
    oldPath: number,
    oldPathLen: number,
    newFd: number,
    newPath: number,
    newPathLen: number,
  ): number
  path_symlink(
    oldPath: number,
    oldPathLen: number,
    fd: number,
    newPath: number,
    newPathLen: number,
  ): number
  path_readlink(
    fd: number,
    path: number,
    pathLen: number,
    buf: number,
    bufLen: number,
    used: number,
  ): number
  path_link(
    oldFd: number,
    oldFlags: number,
    oldPath: number,
    oldPathLen: number,
    newFd: number,
    newPath: number,
    newPathLen: number,
  ): number

  // Environment
  environ_get(environ: number, buf: number): number
  environ_sizes_get(countOut: number, sizeOut: number): number
  args_get(argv: number, buf: number): number
  args_sizes_get(argc: number, bufSize: number): number

  // Process
  proc_exit(code: number): never
  proc_raise(sig: number): number
  sched_yield(): number

  // Random
  random_get(buf: number, len: number): number

  // Poll
  poll_oneoff(
    inSubs: number,
    outEvents: number,
    nsubscriptions: number,
    nevents: number,
  ): number

  // Socket (custom extensions for network proxy)
  sock_accept(fd: number, flags: number, newFd: number): number
  sock_recv(
    fd: number,
    riData: number,
    riDataLen: number,
    riFlags: number,
    roDataLen: number,
    roFlags: number,
  ): number
  sock_send(
    fd: number,
    siData: number,
    siDataLen: number,
    siFlags: number,
    soDataLen: number,
  ): number
  sock_shutdown(fd: number, how: number): number
}

// ─── WASM Memory Access Helper ──────────────────────────────────

/** Helper for reading/writing WASM linear memory */
export interface WasmMemoryAccess {
  readonly memory: WebAssembly.Memory
  readonly view: DataView
  readonly bytes: Uint8Array

  /** Read a UTF-8 string from memory */
  readString(ptr: number, len: number): string

  /** Write a UTF-8 string to memory, returns bytes written */
  writeString(ptr: number, str: string): number

  /** Read bytes from memory */
  readBytes(ptr: number, len: number): Uint8Array

  /** Write bytes to memory */
  writeBytes(ptr: number, data: Uint8Array): void

  /** Refresh views after memory growth */
  refresh(): void
}

// ─── JS Context Bridge Types ────────────────────────────────────

/** An opaque handle representing a JS value on the host side */
export type JSHandle = number

/** Custom host imports for JS context bridging */
export interface JSContextImports {
  /** Evaluate JS code and return a handle to the result */
  js_context_eval(codePtr: number, codeLen: number): JSHandle

  /** Call a function handle with arguments */
  js_context_call(
    fnHandle: JSHandle,
    thisHandle: JSHandle,
    argsPtr: number,
    argsLen: number,
  ): JSHandle

  /** Get a property from an object handle */
  js_context_get_property(
    objHandle: JSHandle,
    namePtr: number,
    nameLen: number,
  ): JSHandle

  /** Set a property on an object handle */
  js_context_set_property(
    objHandle: JSHandle,
    namePtr: number,
    nameLen: number,
    valueHandle: JSHandle,
  ): void

  /** Create a new plain object, returns handle */
  js_context_create_object(): JSHandle

  /** Get the typeof a handle as a string handle */
  js_context_typeof(handle: JSHandle): JSHandle

  /** Release a handle (allow GC) */
  js_context_release(handle: JSHandle): void

  /** Get the global object handle */
  js_context_global(): JSHandle
}
