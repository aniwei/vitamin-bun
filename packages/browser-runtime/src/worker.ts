import type { WorkerInMessage, WorkerOutMessage, RuntimeOptions } from './types.js'
import { SABBridge } from './sab-bridge.js'

/**
 * Manages the Web Worker lifecycle for running the Bun WASM module.
 *
 * The WASM module is instantiated inside a dedicated Web Worker to avoid
 * blocking the main thread. This class handles:
 * - Loading and sending the WASM binary to the worker
 * - Setting up the SharedArrayBuffer bridge for sync I/O
 * - Forwarding stdout / stderr output
 * - Process start / kill
 */
export class WasmWorker {
  private worker: Worker | null = null
  private sabBridge: SABBridge | null = null
  private messageHandlers = new Map<string, Set<(data: WorkerOutMessage) => void>>()
  private processCounter = 0

  /** Whether the worker has signalled it is ready. */
  ready = false

  constructor(private options: RuntimeOptions) {}

  /**
   * Boot the WASM worker.  Fetches the WASM binary, creates a Web Worker,
   * and sets up the SAB bridge if cross-origin isolation is available.
   */
  async boot(files: Record<string, string> = {}): Promise<void> {
    let wasmBytes: ArrayBuffer | undefined
    if (this.options.wasmUrl) {
      const wasmResponse = await fetch(this.options.wasmUrl)
      wasmBytes = await wasmResponse.arrayBuffer()
    }

    // If cross-origin isolated, set up SAB bridge.
    if (this.options.crossOriginIsolated ?? crossOriginIsolated) {
      this.sabBridge = new SABBridge()
    }

    // Resolve worker script URL.
    // Priority: explicit workerUrl > bundler-resolved import.meta.url fallback
    const scriptUrl = this.options.workerUrl
      ? new URL(this.options.workerUrl)
      : new URL('./worker-script.js', import.meta.url)

    this.worker = new Worker(scriptUrl, { type: 'module' })

    // Set up message routing.
    this.worker.onmessage = (event: MessageEvent) => {
      const msg = event.data as WorkerOutMessage
      if (msg.type === 'ready') {
        this.ready = true
      }
      this.emit(msg.type, msg)
    }

    this.worker.onerror = (event: ErrorEvent) => {
      this.emit('error', { type: 'error', message: event.message ?? 'Worker error' })
    }

    // Send init message with WASM binary, initial files, and env.
    const initMsg: WorkerInMessage = {
      type: 'init',
      wasmBytes,
      files,
      env: this.options.env,
      sab: this.sabBridge?.sab,
    }

    // Transfer the ArrayBuffer to avoid copying.
    const transferables: Transferable[] = wasmBytes ? [wasmBytes] : []
    this.worker.postMessage(initMsg, transferables)

    // Wait for ready signal.
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Worker boot timed out after 30 s'))
      }, 30_000)

      this.on('ready', () => {
        clearTimeout(timeout)
        resolve()
      })
      this.on('error', (msg) => {
        clearTimeout(timeout)
        if ('message' in msg) {
          reject(new Error(msg.message as string))
        }
      })
    })
  }

  /** Execute a command inside the WASM runtime. Returns a process ID. */
  exec(command: string, args: string[]): number {
    const id = ++this.processCounter
    this.postMessage({ type: 'exec', command, args, id })
    return id
  }

  /** Send data to stdin of the active process. */
  sendStdin(data: Uint8Array): void {
    this.postMessage({ type: 'stdin', data })
  }

  /** Sync a file write into the worker VFS. */
  writeFile(path: string, content: string | Uint8Array): void {
    this.postMessage({ type: 'fs:write', path, content })
  }

  /** Ensure a directory exists in the worker VFS. */
  mkdir(path: string): void {
    this.postMessage({ type: 'fs:mkdir', path })
  }

  /** Remove a file in the worker VFS. */
  unlink(path: string): void {
    this.postMessage({ type: 'fs:unlink', path })
  }

  /** Kill a running process. */
  kill(id: number): void {
    this.postMessage({ type: 'kill', id })
  }

  /** Register a handler for worker messages. */
  on(type: string, handler: (data: WorkerOutMessage) => void): void {
    if (!this.messageHandlers.has(type)) {
      this.messageHandlers.set(type, new Set())
    }
    this.messageHandlers.get(type)!.add(handler)
  }

  /** Remove a handler. */
  off(type: string, handler: (data: WorkerOutMessage) => void): void {
    this.messageHandlers.get(type)?.delete(handler)
  }

  /** Terminate the worker. */
  destroy(): void {
    this.sabBridge?.stopListening()
    this.worker?.terminate()
    this.worker = null
    this.ready = false
  }

  /** Get the SAB bridge (null if not cross-origin isolated). */
  getSABBridge(): SABBridge | null {
    return this.sabBridge
  }

  private postMessage(msg: WorkerInMessage): void {
    if (!this.worker) {
      throw new Error('Worker not initialised — call boot() first')
    }
    this.worker.postMessage(msg)
  }

  private emit(type: string, data: WorkerOutMessage): void {
    const handlers = this.messageHandlers.get(type)
    if (handlers) {
      for (const handler of handlers) {
        handler(data)
      }
    }
  }
}
