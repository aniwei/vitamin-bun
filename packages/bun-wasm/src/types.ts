/**
 * Type definitions for the Bun WASM module.
 *
 * The Bun binary is compiled to `wasm32-wasi` with the embedded JavaScriptCore
 * engine removed.  These types describe the module's exported interface and
 * the configuration required to load it.
 */

/** Options for loading the Bun WASM module. */
export interface BunWasmOptions {
  /**
   * URL or path to the compiled `bun-core.wasm` (or `bun-core.opt.wasm`)
   * binary.  When running in a browser this is typically a URL served by
   * the application; in Node / test environments it can be a file path.
   */
  url: string | URL

  /**
   * Optional pre-fetched WASM bytes.  When provided the loader skips the
   * `fetch()` call and compiles directly from this buffer.
   */
  bytes?: BufferSource

  /**
   * WASI imports to supply to the module.
   * The `wasi_snapshot_preview1` namespace is the minimum required set.
   */
  wasiImports?: WebAssembly.ModuleImports

  /**
   * Additional (non-WASI) host imports, for example the JS context bridge
   * functions (`js_context_eval`, `js_context_call`, …).
   */
  hostImports?: WebAssembly.ModuleImports
}

/**
 * Represents the WASM memory exported by the Bun module.
 * Consumers use this to read / write data shared with the WASM side.
 */
export interface BunWasmMemory {
  /** The underlying WebAssembly.Memory object. */
  memory: WebAssembly.Memory
  /** Convenience view over the memory buffer. */
  buffer: () => ArrayBuffer
}

/**
 * The public handle returned after successfully loading and instantiating
 * the Bun WASM module.
 */
export interface BunWasmInstance {
  /** The compiled WebAssembly.Module (can be transferred to a Worker). */
  module: WebAssembly.Module
  /** The live WebAssembly.Instance. */
  instance: WebAssembly.Instance
  /** Accessor for the module's linear memory. */
  memory: BunWasmMemory
  /** Invoke the WASI `_start` entry-point. */
  start: () => void
  /** All exports from the WASM module. */
  exports: WebAssembly.Exports
}

/**
 * Result of compiling (but not yet instantiating) the Bun WASM binary.
 * Useful when the module will be sent to a Web Worker for instantiation.
 */
export interface BunWasmCompiled {
  /** The compiled WebAssembly.Module. */
  module: WebAssembly.Module
  /** The raw bytes of the WASM binary (retained for transfer). */
  bytes: ArrayBuffer
}
