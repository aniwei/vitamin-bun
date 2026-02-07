/**
 * @vitamin-ai/wasm-host
 *
 * WASI host imports implementation that bridges WASM modules
 * to browser APIs via VFS, network proxy, and JS context.
 */

export { WasmHost } from './wasm-host.js'
export { WasiShim } from './wasi-shim.js'
export { WasmLoader } from './loader.js'
export { JSContextBridge } from './js-context.js'
export type {
  WasmHostOptions,
  WasiImports,
  WasmExports,
  WasmMemoryAccess,
  JSHandle,
} from './types.js'
