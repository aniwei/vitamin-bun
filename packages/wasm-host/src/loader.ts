import type { WasmExports } from './types.js'

/**
 * Fetches, compiles, and instantiates a WASM module.
 *
 * Supports both streaming compilation (preferred, faster) and
 * fallback to ArrayBuffer-based compilation.
 */
export class WasmLoader {
  /**
   * Load and instantiate a WASM module.
   *
   * @param url - URL to the .wasm file
   * @param imports - Import object for the WASM module
   * @returns The instantiated WASM module and exports
   */
  static async load(
    url: string | URL,
    imports: WebAssembly.Imports,
  ): Promise<{
    instance: WebAssembly.Instance
    module: WebAssembly.Module
    exports: WasmExports
  }> {
    const urlString = url instanceof URL ? url.href : url

    let result: WebAssembly.WebAssemblyInstantiatedSource

    // Prefer streaming compilation (more memory-efficient)
    if (typeof WebAssembly.instantiateStreaming === 'function') {
      try {
        const response = fetch(urlString, {
          headers: { Accept: 'application/wasm' },
        })
        result = await WebAssembly.instantiateStreaming(response, imports)
      } catch {
        // Fall back to ArrayBuffer approach
        result = await WasmLoader.loadViaArrayBuffer(urlString, imports)
      }
    } else {
      result = await WasmLoader.loadViaArrayBuffer(urlString, imports)
    }

    return {
      instance: result.instance,
      module: result.module,
      exports: result.instance.exports as unknown as WasmExports,
    }
  }

  /**
   * Fallback loader using ArrayBuffer.
   */
  private static async loadViaArrayBuffer(
    url: string,
    imports: WebAssembly.Imports,
  ): Promise<WebAssembly.WebAssemblyInstantiatedSource> {
    const response = await fetch(url)
    const buffer = await response.arrayBuffer()
    return WebAssembly.instantiate(buffer, imports)
  }

  /**
   * Compile a WASM module from bytes without instantiating.
   * Useful for caching the compiled module.
   */
  static async compile(bytes: ArrayBuffer): Promise<WebAssembly.Module> {
    return WebAssembly.compile(bytes)
  }

  /**
   * Instantiate a pre-compiled module.
   */
  static async instantiate(
    module: WebAssembly.Module,
    imports: WebAssembly.Imports,
  ): Promise<{
    instance: WebAssembly.Instance
    exports: WasmExports
  }> {
    const instance = await WebAssembly.instantiate(module, imports)
    return {
      instance,
      exports: instance.exports as unknown as WasmExports,
    }
  }
}
