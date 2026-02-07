import type { VirtualFileSystem } from '@vitamin-ai/virtual-fs'
import type { WasmHostOptions, WasmExports } from './types.js'
import { WasiShim, WasiExitError } from './wasi-shim.js'
import { JSContextBridge } from './js-context.js'
import { WasmLoader } from './loader.js'
import { MemoryAccess } from './memory.js'

/**
 * WasmHost — the primary coordinator that wires together:
 * - WASI shim (file system, environment, clock)
 * - JS context bridge (host-side JS execution)
 * - WASM loader (fetch + instantiate)
 *
 * Usage:
 * ```ts
 * const host = new WasmHost({
 *   wasmUrl: '/bun-core.wasm',
 *   vfs: myVFS,
 *   env: { HOME: '/' },
 *   onStdout: (data) => console.log(new TextDecoder().decode(data)),
 * })
 * await host.start()
 * ```
 */
export class WasmHost {
  private options: WasmHostOptions
  private wasi: WasiShim
  private jsContext: JSContextBridge
  private instance: WebAssembly.Instance | null = null
  private exports: WasmExports | null = null
  private _exitCode: number | null = null

  constructor(options: WasmHostOptions) {
    this.options = options
    this.wasi = new WasiShim(options)
    this.jsContext = new JSContextBridge()
  }

  /** The VFS this host is connected to */
  get vfs(): VirtualFileSystem {
    return this.options.vfs
  }

  /** Exit code from proc_exit, or null if still running / not started */
  get exitCode(): number | null {
    return this._exitCode
  }

  /** Whether the WASM module has been loaded */
  get isLoaded(): boolean {
    return this.instance !== null
  }

  /**
   * Load and instantiate the WASM module.
   * Does not start execution — call `start()` or `initialize()` after.
   */
  async load(): Promise<void> {
    // Build combined import object
    const wasiImports = this.wasi.getImports()
    const jsImports = this.jsContext.getImports()

    const imports = {
      ...wasiImports,
      ...jsImports,
    } as unknown as WebAssembly.Imports

    // Load WASM
    const result = await WasmLoader.load(this.options.wasmUrl, imports)
    this.instance = result.instance
    this.exports = result.exports

    // Bind memory to WASI shim and JS context
    if (this.exports.memory) {
      this.wasi.setMemory(this.exports.memory)
      const mem = new MemoryAccess(this.exports.memory)
      this.jsContext.setMemory(mem)
    }
  }

  /**
   * Run the WASM module's `_start` export (WASI command module).
   * Catches `proc_exit` and stores the exit code.
   */
  async start(): Promise<number> {
    if (!this.exports) {
      await this.load()
    }

    try {
      if (this.exports!._start) {
        this.exports!._start()
      } else if (this.exports!.init) {
        const heapSize = this.options.heapSize ?? 64_000_000
        const res = this.exports!.init(heapSize) as number
        if (res < 0) {
          throw new Error(`WASM init failed with code ${res}`)
        }
      }
      this._exitCode = 0
    } catch (e) {
      if (e instanceof WasiExitError) {
        this._exitCode = e.exitCode
      } else {
        this._exitCode = 1
        throw e
      }
    }

    return this._exitCode
  }

  /**
   * Run the WASM module's `_initialize` export (WASI reactor module).
   * Used for library-style modules that expose functions.
   */
  async initialize(): Promise<void> {
    if (!this.exports) {
      await this.load()
    }

    if (this.exports!._initialize) {
      this.exports!._initialize()
    }
  }

  /**
   * Call a named export function on the WASM module.
   */
  call(name: string, ...args: unknown[]): unknown {
    if (!this.exports) {
      throw new Error('WASM module not loaded. Call load() first.')
    }

    const fn = this.exports[name]
    if (typeof fn !== 'function') {
      throw new Error(`Export "${name}" is not a function`)
    }

    return (fn as Function)(...args)
  }

  /** Get the underlying WASM memory */
  get memory(): WebAssembly.Memory | null {
    return this.exports?.memory ?? null
  }

  /** Get the JS context bridge (for diagnostics) */
  get jsContextBridge(): JSContextBridge {
    return this.jsContext
  }
}
