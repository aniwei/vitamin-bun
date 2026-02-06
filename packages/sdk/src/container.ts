import { VirtualFileSystem } from '@aspect-build/virtual-fs'
import { WasmWorker } from '@aspect-build/browser-runtime'
import type {
  ContainerOptions,
  ExecResult,
  SpawnedProcess,
  ContainerFS,
  BunContainer,
} from './types.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const encoder = new TextEncoder()
const decoder = new TextDecoder()

/** Simple event-emitter style readable stream for stdout / stderr. */
export class Readable {
  private listeners = new Set<(data: Uint8Array) => void>()

  /** Register a listener. */
  on(_event: 'data', handler: (data: Uint8Array) => void): void {
    this.listeners.add(handler)
  }

  /** Remove a listener. */
  off(_event: 'data', handler: (data: Uint8Array) => void): void {
    this.listeners.delete(handler)
  }

  /** Push data to all listeners (called internally). */
  push(data: Uint8Array): void {
    for (const listener of this.listeners) {
      listener(data)
    }
  }
}

// ---------------------------------------------------------------------------
// Container implementation
// ---------------------------------------------------------------------------

class BunContainerImpl implements BunContainer {
  private worker: WasmWorker
  private vfs: VirtualFileSystem

  readonly fs: ContainerFS

  constructor(
    worker: WasmWorker,
    vfs: VirtualFileSystem,
  ) {
    this.worker = worker
    this.vfs = vfs

    // Expose a simplified filesystem API.
    this.fs = {
      readFile: async (
        path: string,
        encoding?: string,
      ): Promise<string | Uint8Array> => {
        if (encoding === 'utf8' || encoding === 'utf-8') {
          return this.vfs.readFile(path)
        }
        return this.vfs.readFileBytes(path)
      },
      writeFile: async (
        path: string,
        content: string | Uint8Array,
      ): Promise<void> => {
        this.vfs.writeFile(path, content)
      },
      mkdir: async (path: string): Promise<void> => {
        this.vfs.mkdirp(path)
      },
      readdir: async (path: string): Promise<string[]> => {
        return this.vfs.readdir(path).map((e) => e.name)
      },
      unlink: async (path: string): Promise<void> => {
        this.vfs.unlink(path)
      },
      exists: async (path: string): Promise<boolean> => {
        return this.vfs.exists(path)
      },
    }
  }

  async exec(command: string, args: string[] = []): Promise<ExecResult> {
    const stdoutChunks: Uint8Array[] = []
    const stderrChunks: Uint8Array[] = []

    const id = this.worker.exec(command, args)

    return new Promise<ExecResult>((resolve) => {
      const onStdout = (msg: { type: string; data?: Uint8Array }) => {
        if (msg.type === 'stdout' && msg.data) {
          stdoutChunks.push(msg.data)
        }
      }
      const onStderr = (msg: { type: string; data?: Uint8Array }) => {
        if (msg.type === 'stderr' && msg.data) {
          stderrChunks.push(msg.data)
        }
      }
      const onExit = (msg: { type: string; id?: number; code?: number }) => {
        if (msg.type === 'exit' && msg.id === id) {
          this.worker.off('stdout', onStdout as never)
          this.worker.off('stderr', onStderr as never)
          this.worker.off('exit', onExit as never)
          resolve({
            exitCode: msg.code ?? 1,
            stdout: decoder.decode(concat(stdoutChunks)),
            stderr: decoder.decode(concat(stderrChunks)),
          })
        }
      }

      this.worker.on('stdout', onStdout as never)
      this.worker.on('stderr', onStderr as never)
      this.worker.on('exit', onExit as never)
    })
  }

  spawn(command: string, args: string[] = []): SpawnedProcess {
    const id = this.worker.exec(command, args)
    const stdout = new Readable()
    const stderr = new Readable()

    let exitResolve: (code: number) => void
    const exited = new Promise<number>((resolve) => {
      exitResolve = resolve
    })

    this.worker.on('stdout', ((msg: { type: string; data?: Uint8Array }) => {
      if (msg.data) stdout.push(msg.data)
    }) as never)

    this.worker.on('stderr', ((msg: { type: string; data?: Uint8Array }) => {
      if (msg.data) stderr.push(msg.data)
    }) as never)

    this.worker.on('exit', ((msg: {
      type: string
      id?: number
      code?: number
    }) => {
      if (msg.id === id) exitResolve(msg.code ?? 1)
    }) as never)

    return {
      pid: id,
      stdout,
      stderr,
      writeStdin: (data: string | Uint8Array) => {
        const bytes =
          typeof data === 'string' ? encoder.encode(data) : data
        this.worker.sendStdin(bytes)
      },
      kill: () => this.worker.kill(id),
      exited,
    }
  }

  async mount(
    path: string,
    files: Record<string, string>,
  ): Promise<void> {
    this.vfs.mkdirp(path)
    for (const [name, content] of Object.entries(files)) {
      const fullPath = path.endsWith('/')
        ? `${path}${name}`
        : `${path}/${name}`
      // Ensure parent directories exist.
      const parts = fullPath.split('/')
      parts.pop()
      if (parts.length > 0) {
        this.vfs.mkdirp(parts.join('/'))
      }
      this.vfs.writeFile(fullPath, content)
    }
  }

  async destroy(): Promise<void> {
    this.worker.destroy()
  }
}

// ---------------------------------------------------------------------------
// Public factory
// ---------------------------------------------------------------------------

/**
 * Create a new Bun container that runs entirely in the browser.
 *
 * ```ts
 * const container = await createBunContainer({
 *   wasmUrl: '/bun-core.wasm',
 *   files: { 'index.ts': 'console.log("hello")' },
 * })
 *
 * const result = await container.exec('bun', ['run', 'index.ts'])
 * console.log(result.stdout)
 *
 * await container.destroy()
 * ```
 */
export async function createBunContainer(
  options: ContainerOptions,
): Promise<BunContainer> {
  const vfs = new VirtualFileSystem()

  // Seed the filesystem with initial files.
  if (options.files) {
    for (const [path, content] of Object.entries(options.files)) {
      // Ensure parent directories exist.
      const parts = path.split('/')
      parts.pop()
      if (parts.length > 0) {
        vfs.mkdirp(parts.join('/'))
      }
      vfs.writeFile(path, content)
    }
  }

  // Boot the WASM worker.
  const worker = new WasmWorker({
    wasmUrl: options.wasmUrl,
    crossOriginIsolated:
      typeof globalThis.crossOriginIsolated === 'boolean'
        ? globalThis.crossOriginIsolated
        : false,
  })
  await worker.boot(options.files ?? {})

  return new BunContainerImpl(worker, vfs)
}

// ---------------------------------------------------------------------------
// Internal utility
// ---------------------------------------------------------------------------

function concat(buffers: Uint8Array[]): Uint8Array {
  const total = buffers.reduce((s, b) => s + b.byteLength, 0)
  const result = new Uint8Array(total)
  let offset = 0
  for (const buf of buffers) {
    result.set(buf, offset)
    offset += buf.byteLength
  }
  return result
}
