/**
 * Type definitions for the WASM host bindings layer.
 */

/**
 * WASI error codes matching the WASI snapshot preview1 specification.
 * @see https://github.com/WebAssembly/WASI/blob/main/legacy/preview1/docs.md
 */
export enum WasiErrno {
  SUCCESS = 0,
  E2BIG = 1,
  EACCES = 2,
  EBADF = 8,
  EEXIST = 20,
  EINVAL = 28,
  EIO = 29,
  EISDIR = 31,
  ENOENT = 44,
  ENOSYS = 52,
  ENOTDIR = 54,
  ENOTEMPTY = 55,
}

/** WASI clock IDs. */
export enum WasiClockId {
  REALTIME = 0,
  MONOTONIC = 1,
}

/** Configuration for instantiating the WASM host. */
export interface WasmHostOptions {
  /** The compiled WASM module. */
  module: WebAssembly.Module
  /** Preopened directory mappings (WASI convention). */
  preopens?: Record<string, string>
  /** Environment variables. */
  env?: Record<string, string>
  /** Command-line arguments. */
  args?: string[]
  /** Callback for stdout data. */
  onStdout?: (data: Uint8Array) => void
  /** Callback for stderr data. */
  onStderr?: (data: Uint8Array) => void
}

/**
 * Represents the JS context bridge — the interface that allows the WASM
 * binary to execute JavaScript in the host environment.
 */
export interface JSContextBridge {
  /** Evaluate JavaScript source code and return a handle to the result. */
  eval(code: string): number
  /** Call a function handle with argument handles. */
  call(fnHandle: number, args: number[]): number
  /** Get a property from an object handle. */
  getProperty(objHandle: number, key: string): number
  /** Set a property on an object handle. */
  setProperty(objHandle: number, key: string, valueHandle: number): void
  /** Create a new empty object and return its handle. */
  createObject(): number
  /** Get the typeof an object handle as a string. */
  typeOf(handle: number): string
  /** Release a handle, allowing the JS object to be garbage collected. */
  release(handle: number): void
}

/**
 * The full set of WASI imports that the host provides to the WASM module.
 * Each function corresponds to a WASI snapshot preview1 import.
 */
export interface WasiImports {
  args_get: (argv: number, argvBuf: number) => number
  args_sizes_get: (argc: number, argvBufSize: number) => number
  environ_get: (environ: number, environBuf: number) => number
  environ_sizes_get: (
    environCount: number,
    environBufSize: number,
  ) => number
  clock_time_get: (
    clockId: number,
    precision: bigint,
    time: number,
  ) => number
  fd_close: (fd: number) => number
  fd_fdstat_get: (fd: number, fdstat: number) => number
  fd_read: (
    fd: number,
    iovs: number,
    iovsLen: number,
    nread: number,
  ) => number
  fd_seek: (
    fd: number,
    offset: bigint,
    whence: number,
    newOffset: number,
  ) => number
  fd_write: (
    fd: number,
    iovs: number,
    iovsLen: number,
    nwritten: number,
  ) => number
  path_open: (
    dirfd: number,
    dirflags: number,
    path: number,
    pathLen: number,
    oflags: number,
    fsRightsBase: bigint,
    fsRightsInheriting: bigint,
    fdflags: number,
    fd: number,
  ) => number
  path_create_directory: (
    fd: number,
    path: number,
    pathLen: number,
  ) => number
  path_unlink_file: (
    fd: number,
    path: number,
    pathLen: number,
  ) => number
  proc_exit: (code: number) => void
  random_get: (buf: number, bufLen: number) => number
}
