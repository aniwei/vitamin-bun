import { VirtualFileSystem, Whence } from '@aspect-build/virtual-fs'
import { WasiErrno, type WasiImports } from './types.js'

/**
 * Creates a set of WASI preview1 import functions backed by a
 * {@link VirtualFileSystem}.  These imports are supplied to `WebAssembly.instantiate`
 * so that the WASM module can perform file I/O, read env vars, etc.
 */
export function createWasiImports(options: {
  vfs: VirtualFileSystem
  args: string[]
  env: Record<string, string>
  onStdout?: (data: Uint8Array) => void
  onStderr?: (data: Uint8Array) => void
  getMemory: () => WebAssembly.Memory
}): { wasi_snapshot_preview1: WasiImports } {
  const { vfs, args, env, onStdout, onStderr, getMemory } = options

  const encoder = new TextEncoder()
  const decoder = new TextDecoder()

  /** Helper to read a UTF-8 string from WASM memory. */
  function readString(ptr: number, len: number): string {
    const buf = new Uint8Array(getMemory().buffer, ptr, len)
    return decoder.decode(buf)
  }

  /** Helper to write a 32-bit value into WASM memory. */
  function writeU32(ptr: number, value: number): void {
    const view = new DataView(getMemory().buffer)
    view.setUint32(ptr, value, true)
  }

  /** Helper to write a 64-bit value into WASM memory. */
  function writeU64(ptr: number, value: bigint): void {
    const view = new DataView(getMemory().buffer)
    view.setBigUint64(ptr, value, true)
  }

  const wasi: WasiImports = {
    args_get(argv: number, argvBuf: number): number {
      let bufOffset = argvBuf
      for (let i = 0; i < args.length; i++) {
        writeU32(argv + i * 4, bufOffset)
        const encoded = encoder.encode(args[i] + '\0')
        new Uint8Array(getMemory().buffer).set(encoded, bufOffset)
        bufOffset += encoded.byteLength
      }
      return WasiErrno.SUCCESS
    },

    args_sizes_get(argc: number, argvBufSize: number): number {
      writeU32(argc, args.length)
      const totalBytes = args.reduce(
        (sum, a) => sum + encoder.encode(a + '\0').byteLength,
        0,
      )
      writeU32(argvBufSize, totalBytes)
      return WasiErrno.SUCCESS
    },

    environ_get(environ: number, environBuf: number): number {
      const entries = Object.entries(env)
      let bufOffset = environBuf
      for (let i = 0; i < entries.length; i++) {
        writeU32(environ + i * 4, bufOffset)
        const str = `${entries[i][0]}=${entries[i][1]}\0`
        const encoded = encoder.encode(str)
        new Uint8Array(getMemory().buffer).set(encoded, bufOffset)
        bufOffset += encoded.byteLength
      }
      return WasiErrno.SUCCESS
    },

    environ_sizes_get(
      environCount: number,
      environBufSize: number,
    ): number {
      const entries = Object.entries(env)
      writeU32(environCount, entries.length)
      const totalBytes = entries.reduce(
        (sum, [k, v]) => sum + encoder.encode(`${k}=${v}\0`).byteLength,
        0,
      )
      writeU32(environBufSize, totalBytes)
      return WasiErrno.SUCCESS
    },

    clock_time_get(
      _clockId: number,
      _precision: bigint,
      time: number,
    ): number {
      const now = BigInt(Math.round(performance.now() * 1_000_000))
      writeU64(time, now)
      return WasiErrno.SUCCESS
    },

    fd_close(fd: number): number {
      try {
        vfs.close(fd)
        return WasiErrno.SUCCESS
      } catch {
        return WasiErrno.EBADF
      }
    },

    fd_fdstat_get(_fd: number, _fdstat: number): number {
      // Minimal stub — real implementation would populate fdstat struct.
      return WasiErrno.SUCCESS
    },

    fd_read(
      fd: number,
      iovs: number,
      iovsLen: number,
      nread: number,
    ): number {
      try {
        const view = new DataView(getMemory().buffer)
        const mem = new Uint8Array(getMemory().buffer)
        let totalRead = 0

        for (let i = 0; i < iovsLen; i++) {
          const ptr = view.getUint32(iovs + i * 8, true)
          const len = view.getUint32(iovs + i * 8 + 4, true)
          const data = vfs.fdRead(fd, len)
          mem.set(data, ptr)
          totalRead += data.byteLength
          if (data.byteLength < len) break
        }

        writeU32(nread, totalRead)
        return WasiErrno.SUCCESS
      } catch {
        return WasiErrno.EBADF
      }
    },

    fd_seek(
      fd: number,
      offset: bigint,
      whence: number,
      newOffset: number,
    ): number {
      try {
        const result = vfs.fdSeek(
          fd,
          Number(offset),
          whence as Whence,
        )
        writeU64(newOffset, BigInt(result))
        return WasiErrno.SUCCESS
      } catch {
        return WasiErrno.EBADF
      }
    },

    fd_write(
      fd: number,
      iovs: number,
      iovsLen: number,
      nwritten: number,
    ): number {
      const view = new DataView(getMemory().buffer)
      const mem = new Uint8Array(getMemory().buffer)
      let totalWritten = 0

      for (let i = 0; i < iovsLen; i++) {
        const ptr = view.getUint32(iovs + i * 8, true)
        const len = view.getUint32(iovs + i * 8 + 4, true)
        const data = mem.slice(ptr, ptr + len)

        // Handle stdout/stderr specially.
        if (fd === 1) {
          onStdout?.(data)
          totalWritten += data.byteLength
        } else if (fd === 2) {
          onStderr?.(data)
          totalWritten += data.byteLength
        } else {
          try {
            totalWritten += vfs.fdWrite(fd, data)
          } catch {
            return WasiErrno.EBADF
          }
        }
      }

      writeU32(nwritten, totalWritten)
      return WasiErrno.SUCCESS
    },

    path_open(
      _dirfd: number,
      _dirflags: number,
      path: number,
      pathLen: number,
      oflags: number,
      _fsRightsBase: bigint,
      _fsRightsInheriting: bigint,
      _fdflags: number,
      fdOut: number,
    ): number {
      try {
        const filePath = readString(path, pathLen)
        const create = (oflags & 0x01) !== 0 // __WASI_OFLAGS_CREAT
        const truncate = (oflags & 0x08) !== 0 // __WASI_OFLAGS_TRUNC

        const fd = vfs.open(filePath, {
          read: true,
          write: true,
          create,
          truncate,
        })
        writeU32(fdOut, fd)
        return WasiErrno.SUCCESS
      } catch {
        return WasiErrno.ENOENT
      }
    },

    path_create_directory(
      _fd: number,
      path: number,
      pathLen: number,
    ): number {
      try {
        vfs.mkdirp(readString(path, pathLen))
        return WasiErrno.SUCCESS
      } catch {
        return WasiErrno.EEXIST
      }
    },

    path_unlink_file(
      _fd: number,
      path: number,
      pathLen: number,
    ): number {
      try {
        vfs.unlink(readString(path, pathLen))
        return WasiErrno.SUCCESS
      } catch {
        return WasiErrno.ENOENT
      }
    },

    proc_exit(code: number): void {
      throw new Error(`proc_exit called with code ${code}`)
    },

    random_get(buf: number, bufLen: number): number {
      const mem = new Uint8Array(getMemory().buffer, buf, bufLen)
      crypto.getRandomValues(mem)
      return WasiErrno.SUCCESS
    },
  }

  return { wasi_snapshot_preview1: wasi }
}
