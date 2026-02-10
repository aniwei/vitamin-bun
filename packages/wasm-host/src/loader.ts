import type { WasmExports } from './types'

export class WasmLoader {
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

    if (typeof WebAssembly.instantiateStreaming === 'function') {
      try {
        const response = fetch(urlString, {
          headers: { Accept: 'application/wasm' },
        })
        result = await WebAssembly.instantiateStreaming(response, imports)
      } catch {
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

  private static async loadViaArrayBuffer(
    url: string,
    imports: WebAssembly.Imports,
  ): Promise<WebAssembly.WebAssemblyInstantiatedSource> {
    const response = await fetch(url)
    const buffer = await response.arrayBuffer()
    return WebAssembly.instantiate(buffer, imports)
  }

  static async compile(bytes: ArrayBuffer): Promise<WebAssembly.Module> {
    return WebAssembly.compile(bytes)
  }

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
