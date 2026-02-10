import { describe, it, expect, beforeEach, vi } from 'vitest'
import { VirtualFileSystem, Whence } from '@vitamin-ai/virtual-fs'
import { WasiShim, WasiExitError } from '../wasi-shim'
import { WasiErrno, WasiClockId, WasiOflags, WasiWhence } from '../types'

function createShim(overrides: {
  env?: Record<string, string>
  args?: string[]
  onStdout?: (data: Uint8Array) => void
  onStderr?: (data: Uint8Array) => void
} = {}) {
  const vfs = new VirtualFileSystem()
  const shim = new WasiShim({
    wasmUrl: '/fake.wasm',
    vfs,
    env: overrides.env ?? { HOME: '/', USER: 'test' },
    args: overrides.args ?? ['vitamin', 'run', 'index.ts'],
    preopens: { '/': '/' },
    onStdout: overrides.onStdout ?? (() => {}),
    onStderr: overrides.onStderr ?? (() => {}),
  })

  // Create WASM memory and bind it
  const memory = new WebAssembly.Memory({ initial: 10 }) // 10 pages = 640 KiB
  shim.setMemory(memory)

  return { vfs, shim, memory }
}

/** Write a string into memory at the given offset, return [ptr, len] */
function writeStr(memory: WebAssembly.Memory, str: string, offset: number): [number, number] {
  const encoded = new TextEncoder().encode(str)
  new Uint8Array(memory.buffer, offset, encoded.byteLength).set(encoded)
  return [offset, encoded.byteLength]
}

/** Set up an iov (scatter-gather) at the given offset, return iov ptr */
function writeIov(memory: WebAssembly.Memory, iovOffset: number, bufPtr: number, bufLen: number): number {
  const view = new DataView(memory.buffer)
  view.setUint32(iovOffset, bufPtr, true)
  view.setUint32(iovOffset + 4, bufLen, true)
  return iovOffset
}

// ─── Tests ────────────────────────────────────────────────────

describe('WasiShim', () => {
  let vfs: VirtualFileSystem
  let shim: WasiShim
  let memory: WebAssembly.Memory

  beforeEach(() => {
    const result = createShim()
    vfs = result.vfs
    shim = result.shim
    memory = result.memory
  })

  // ── Clock ─────────────────────────────────────────────────

  describe('clock_time_get', () => {
    it('returns SUCCESS for REALTIME', () => {
      const outOffset = 1024
      const errno = shim.clock_time_get(WasiClockId.REALTIME, 0n, outOffset)
      expect(errno).toBe(WasiErrno.SUCCESS)

      const timeNs = new DataView(memory.buffer).getBigUint64(outOffset, true)
      // Should be roughly current time in nanoseconds
      const nowNs = BigInt(Math.round(Date.now() * 1_000_000))
      expect(timeNs).toBeGreaterThan(0n)
      // Within 1 second of now
      expect(Number(nowNs - timeNs)).toBeLessThan(1_000_000_000)
    })

    it('returns SUCCESS for MONOTONIC', () => {
      const outOffset = 1024
      const errno = shim.clock_time_get(WasiClockId.MONOTONIC, 0n, outOffset)
      expect(errno).toBe(WasiErrno.SUCCESS)

      const timeNs = new DataView(memory.buffer).getBigUint64(outOffset, true)
      expect(timeNs).toBeGreaterThan(0n)
    })
  })

  describe('clock_res_get', () => {
    it('returns 1ms resolution for REALTIME', () => {
      const outOffset = 1024
      const errno = shim.clock_res_get(WasiClockId.REALTIME, outOffset)
      expect(errno).toBe(WasiErrno.SUCCESS)

      const resNs = new DataView(memory.buffer).getBigUint64(outOffset, true)
      expect(resNs).toBe(1_000_000n)
    })

    it('returns 5μs resolution for MONOTONIC', () => {
      const outOffset = 1024
      const errno = shim.clock_res_get(WasiClockId.MONOTONIC, outOffset)
      expect(errno).toBe(WasiErrno.SUCCESS)

      const resNs = new DataView(memory.buffer).getBigUint64(outOffset, true)
      expect(resNs).toBe(5_000n)
    })
  })

  // ── fd_write: stdout/stderr ──────────────────────────────

  describe('fd_write', () => {
    it('writes to stdout callback', () => {
      const chunks: Uint8Array[] = []
      const { shim: s, memory: mem } = createShim({
        onStdout: (data) => chunks.push(data),
      })

      // Write "hello" into memory at offset 256
      const message = new TextEncoder().encode('hello')
      new Uint8Array(mem.buffer, 256, message.byteLength).set(message)

      // Set up iov: {ptr=256, len=5}
      const iovPtr = writeIov(mem, 128, 256, message.byteLength)
      const nwrittenOffset = 512

      const errno = s.fd_write(1, iovPtr, 1, nwrittenOffset) // fd=1 → stdout
      expect(errno).toBe(WasiErrno.SUCCESS)

      const nwritten = new DataView(mem.buffer).getUint32(nwrittenOffset, true)
      expect(nwritten).toBe(5)
      expect(chunks).toHaveLength(1)
      expect(new TextDecoder().decode(chunks[0])).toBe('hello')
    })

    it('writes to stderr callback', () => {
      const chunks: Uint8Array[] = []
      const { shim: s, memory: mem } = createShim({
        onStderr: (data) => chunks.push(data),
      })

      const message = new TextEncoder().encode('error!')
      new Uint8Array(mem.buffer, 256, message.byteLength).set(message)
      const iovPtr = writeIov(mem, 128, 256, message.byteLength)

      const errno = s.fd_write(2, iovPtr, 1, 512) // fd=2 → stderr
      expect(errno).toBe(WasiErrno.SUCCESS)
      expect(chunks).toHaveLength(1)
    })
  })

  // ── fd_read ───────────────────────────────────────────────

  describe('fd_read', () => {
    it('returns 0 bytes for stdin', () => {
      const iovPtr = writeIov(memory, 128, 256, 1024)
      const nreadOffset = 512
      const errno = shim.fd_read(0, iovPtr, 1, nreadOffset) // fd=0 → stdin
      expect(errno).toBe(WasiErrno.SUCCESS)
      const nread = new DataView(memory.buffer).getUint32(nreadOffset, true)
      expect(nread).toBe(0)
    })

    it('reads from a VFS file', () => {
      vfs.writeFile('/test.txt', 'hello world')
      const fd = vfs.open('/test.txt', { read: true })

      const iovPtr = writeIov(memory, 128, 256, 1024)
      const nreadOffset = 512

      const errno = shim.fd_read(fd, iovPtr, 1, nreadOffset)
      expect(errno).toBe(WasiErrno.SUCCESS)

      const nread = new DataView(memory.buffer).getUint32(nreadOffset, true)
      expect(nread).toBe(11)

      const data = new TextDecoder().decode(new Uint8Array(memory.buffer, 256, nread))
      expect(data).toBe('hello world')
    })
  })

  // ── fd_seek ───────────────────────────────────────────────

  describe('fd_seek', () => {
    it('seeks to beginning', () => {
      vfs.writeFile('/seek.txt', '0123456789')
      const fd = vfs.open('/seek.txt', { read: true })

      // Read some bytes first
      vfs.fdRead(fd, 5)

      const newOffsetPtr = 512
      const errno = shim.fd_seek(fd, 0n, WasiWhence.SET, newOffsetPtr)
      expect(errno).toBe(WasiErrno.SUCCESS)

      const newOffset = new DataView(memory.buffer).getBigUint64(newOffsetPtr, true)
      expect(newOffset).toBe(0n)
    })

    it('returns EBADF for invalid fd', () => {
      const errno = shim.fd_seek(999, 0n, WasiWhence.SET, 512)
      expect(errno).toBe(WasiErrno.EBADF)
    })
  })

  // ── fd_close ──────────────────────────────────────────────

  describe('fd_close', () => {
    it('closes an open fd', () => {
      vfs.writeFile('/close.txt', 'data')
      const fd = vfs.open('/close.txt', { read: true })

      const errno = shim.fd_close(fd)
      expect(errno).toBe(WasiErrno.SUCCESS)
    })

    it('returns EBADF for invalid fd', () => {
      const errno = shim.fd_close(999)
      expect(errno).toBe(WasiErrno.EBADF)
    })
  })

  // ── Preopen ───────────────────────────────────────────────

  describe('fd_prestat_get / fd_prestat_dir_name', () => {
    it('returns prestat for fd 3 (root /)', () => {
      const buf = 1024
      const errno = shim.fd_prestat_get(3, buf)
      expect(errno).toBe(WasiErrno.SUCCESS)

      const view = new DataView(memory.buffer)
      const tag = view.getUint8(buf) // 0 = directory
      expect(tag).toBe(0)

      const nameLen = view.getUint32(buf + 4, true)
      expect(nameLen).toBe(1) // "/"
    })

    it('returns dir name for fd 3', () => {
      const pathBuf = 2048
      const errno = shim.fd_prestat_dir_name(3, pathBuf, 1)
      expect(errno).toBe(WasiErrno.SUCCESS)

      const name = new TextDecoder().decode(new Uint8Array(memory.buffer, pathBuf, 1))
      expect(name).toBe('/')
    })

    it('returns EBADF for non-preopened fd', () => {
      expect(shim.fd_prestat_get(99, 1024)).toBe(WasiErrno.EBADF)
    })
  })

  // ── environ ───────────────────────────────────────────────

  describe('environ_sizes_get', () => {
    it('returns correct count and size', () => {
      const countPtr = 1024
      const sizePtr = 1028

      const errno = shim.environ_sizes_get(countPtr, sizePtr)
      expect(errno).toBe(WasiErrno.SUCCESS)

      const view = new DataView(memory.buffer)
      expect(view.getUint32(countPtr, true)).toBe(2) // HOME, USER

      // HOME=/\0  → 7 bytes   USER=test\0 → 10 bytes → total 17
      const expectedSize = new TextEncoder().encode('HOME=/\0').byteLength
        + new TextEncoder().encode('USER=test\0').byteLength
      expect(view.getUint32(sizePtr, true)).toBe(expectedSize)
    })
  })

  // ── args ──────────────────────────────────────────────────

  describe('args_sizes_get', () => {
    it('returns correct argc and buffer size', () => {
      const argcPtr = 1024
      const bufSizePtr = 1028

      const errno = shim.args_sizes_get(argcPtr, bufSizePtr)
      expect(errno).toBe(WasiErrno.SUCCESS)

      const view = new DataView(memory.buffer)
      expect(view.getUint32(argcPtr, true)).toBe(3) // 

      const expectedSize =
        new TextEncoder().encode('vitamin\0').byteLength +
        new TextEncoder().encode('run\0').byteLength +
        new TextEncoder().encode('index.ts\0').byteLength
      expect(view.getUint32(bufSizePtr, true)).toBe(expectedSize)
    })
  })

  // ── proc_exit ─────────────────────────────────────────────

  describe('proc_exit', () => {
    it('throws WasiExitError with exit code', () => {
      expect(() => shim.proc_exit(0)).toThrow(WasiExitError)
      try {
        shim.proc_exit(42)
      } catch (e) {
        expect(e).toBeInstanceOf(WasiExitError)
        expect((e as WasiExitError).exitCode).toBe(42)
      }
    })
  })

  // ── random_get ────────────────────────────────────────────

  describe('random_get', () => {
    it('fills buffer with random bytes', () => {
      const buf = 1024
      const len = 32

      // Zero out first
      new Uint8Array(memory.buffer, buf, len).fill(0)

      const errno = shim.random_get(buf, len)
      expect(errno).toBe(WasiErrno.SUCCESS)

      const bytes = new Uint8Array(memory.buffer, buf, len)
      // Extremely unlikely all 32 bytes remain 0
      const sum = bytes.reduce((a, b) => a + b, 0)
      expect(sum).toBeGreaterThan(0)
    })
  })

  // ── path_open ─────────────────────────────────────────────

  describe('path_open', () => {
    it('opens an existing file', () => {
      vfs.writeFile('/hello.txt', 'world')

      const [pathPtr, pathLen] = writeStr(memory, 'hello.txt', 2048)
      const fdOutPtr = 3072

      const errno = shim.path_open(
        3,         // dirfd (preopen for /)
        0,         // dirflags
        pathPtr,
        pathLen,
        0,         // oflags
        0n,        // fs_rights_base
        0n,        // fs_rights_inheriting
        0,         // fdflags
        fdOutPtr,
      )
      expect(errno).toBe(WasiErrno.SUCCESS)

      const newFd = new DataView(memory.buffer).getUint32(fdOutPtr, true)
      expect(newFd).toBeGreaterThanOrEqual(3)
    })

    it('creates a file with CREAT flag', () => {
      const [pathPtr, pathLen] = writeStr(memory, 'new-file.txt', 2048)
      const fdOutPtr = 3072

      const errno = shim.path_open(
        3, 0, pathPtr, pathLen,
        WasiOflags.CREAT, 0n, 0n, 0, fdOutPtr,
      )
      expect(errno).toBe(WasiErrno.SUCCESS)
      expect(vfs.exists('/new-file.txt')).toBe(true)
    })

    it('returns ENOENT for missing file without CREAT', () => {
      const [pathPtr, pathLen] = writeStr(memory, 'nope.txt', 2048)
      const fdOutPtr = 3072

      const errno = shim.path_open(
        3, 0, pathPtr, pathLen,
        0, 0n, 0n, 0, fdOutPtr,
      )
      expect(errno).toBe(WasiErrno.ENOENT)
    })
  })

  // ── path_create_directory / path_remove_directory ─────────

  describe('path_create_directory / path_remove_directory', () => {
    it('creates and removes a directory', () => {
      const [pathPtr, pathLen] = writeStr(memory, 'mydir', 2048)

      let errno = shim.path_create_directory(3, pathPtr, pathLen)
      expect(errno).toBe(WasiErrno.SUCCESS)
      expect(vfs.exists('/mydir')).toBe(true)

      errno = shim.path_remove_directory(3, pathPtr, pathLen)
      expect(errno).toBe(WasiErrno.SUCCESS)
      expect(vfs.exists('/mydir')).toBe(false)
    })
  })

  // ── path_unlink_file ──────────────────────────────────────

  describe('path_unlink_file', () => {
    it('deletes a file', () => {
      vfs.writeFile('/deleteme.txt', 'bye')
      const [pathPtr, pathLen] = writeStr(memory, 'deleteme.txt', 2048)

      const errno = shim.path_unlink_file(3, pathPtr, pathLen)
      expect(errno).toBe(WasiErrno.SUCCESS)
      expect(vfs.exists('/deleteme.txt')).toBe(false)
    })
  })

  // ── getImports ────────────────────────────────────────────

  describe('getImports', () => {
    it('returns bound functions under wasi_snapshot_preview1', () => {
      const imports = shim.getImports()
      expect(imports.wasi_snapshot_preview1).toBeDefined()
      expect(typeof imports.wasi_snapshot_preview1.fd_read).toBe('function')
      expect(typeof imports.wasi_snapshot_preview1.fd_write).toBe('function')
      expect(typeof imports.wasi_snapshot_preview1.path_open).toBe('function')
      expect(typeof imports.wasi_snapshot_preview1.environ_get).toBe('function')
      expect(typeof imports.wasi_snapshot_preview1.proc_exit).toBe('function')
      expect(typeof imports.wasi_snapshot_preview1.random_get).toBe('function')
    })
  })
})
