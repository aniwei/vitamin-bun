import type { VirtualFileSystem } from '@vitamin-ai/virtual-fs'
import type { WasmHostOptions, WasmExports } from './types'
import { WasiShim, WasiExitError } from './wasi-shim'
import { JSContextBridge } from './js-context'
import { WasmLoader } from './loader'
import { MemoryAccess } from './memory'

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

  get vfs(): VirtualFileSystem {
    return this.options.vfs
  }

  get exitCode(): number | null {
    return this._exitCode
  }

  get isLoaded(): boolean {
    return this.instance !== null
  }

  async load(): Promise<void> {
    const wasiImports = this.wasi.getImports()
    const jsImports = this.jsContext.getImports()

    const imports = {
      ...wasiImports,
      ...jsImports,
    } as unknown as WebAssembly.Imports

    const result = await WasmLoader.load(this.options.wasmUrl, imports)
    this.instance = result.instance
    this.exports = result.exports

    if (this.exports.memory) {
      this.wasi.setMemory(this.exports.memory)
      const mem = new MemoryAccess(this.exports.memory)
      this.jsContext.setMemory(mem)
    }
  }

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

  async initialize(): Promise<void> {
    if (!this.exports) {
      await this.load()
    }

    if (this.exports!._initialize) {
      this.exports!._initialize()
    }
  }

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

  get memory(): WebAssembly.Memory | null {
    return this.exports?.memory ?? null
  }

  get jsContextBridge(): JSContextBridge {
    return this.jsContext
  }
}
