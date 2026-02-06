import type {
  BunWasmOptions,
  BunWasmInstance,
  BunWasmCompiled,
  BunWasmMemory,
} from './types.js'

/**
 * Fetch and compile the Bun WASM binary **without** instantiating it.
 *
 * This is useful when the compiled {@link WebAssembly.Module} will be
 * transferred to a Web Worker via `postMessage` for instantiation there.
 *
 * @param options - URL or pre-fetched bytes for the WASM binary.
 * @returns The compiled module and its raw bytes.
 */
export async function compileBunWasm(
  options: Pick<BunWasmOptions, 'url' | 'bytes'>,
): Promise<BunWasmCompiled> {
  let bytes: ArrayBuffer
  if (options.bytes) {
    if (options.bytes instanceof ArrayBuffer) {
      bytes = options.bytes
    } else {
      const view = options.bytes as unknown as { buffer: ArrayBuffer; byteOffset: number; byteLength: number }
      bytes = view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength)
    }
  } else {
    bytes = await fetchWasmBytes(options.url)
  }

  const module = await WebAssembly.compile(bytes)
  return { module, bytes }
}

/**
 * Load, compile, and instantiate the Bun WASM module in one step.
 *
 * The returned {@link BunWasmInstance} exposes the module's memory, the
 * WASI `_start` entry-point, and all raw exports.
 *
 * @param options - Loader configuration (URL, imports, …).
 * @returns A fully initialised Bun WASM instance.
 */
export async function loadBunWasm(
  options: BunWasmOptions,
): Promise<BunWasmInstance> {
  const { module, bytes: _bytes } = await compileBunWasm(options)

  const importObject: WebAssembly.Imports = {}

  if (options.wasiImports) {
    importObject['wasi_snapshot_preview1'] = options.wasiImports
  }
  if (options.hostImports) {
    importObject['env'] = options.hostImports
  }

  const instance = await WebAssembly.instantiate(module, importObject)

  const wasmMemory = instance.exports['memory'] as WebAssembly.Memory | undefined

  const memory: BunWasmMemory = {
    memory: wasmMemory ?? new WebAssembly.Memory({ initial: 256 }),
    buffer: () => (wasmMemory ?? (instance.exports['memory'] as WebAssembly.Memory)).buffer,
  }

  const startFn = instance.exports['_start'] as ((...args: unknown[]) => void) | undefined

  return {
    module,
    instance,
    memory,
    start: () => {
      if (!startFn) {
        throw new Error(
          'Bun WASM module does not export a _start function. ' +
            'Ensure the binary was compiled with wasm32-wasi target.',
        )
      }
      startFn()
    },
    exports: instance.exports,
  }
}

/**
 * Internal helper — fetches the WASM binary from a URL.
 */
async function fetchWasmBytes(url: string | URL): Promise<ArrayBuffer> {
  const response = await fetch(typeof url === 'string' ? url : url.href)
  if (!response.ok) {
    throw new Error(
      `Failed to fetch Bun WASM binary from ${String(url)}: ${response.status} ${response.statusText}`,
    )
  }
  return response.arrayBuffer()
}
