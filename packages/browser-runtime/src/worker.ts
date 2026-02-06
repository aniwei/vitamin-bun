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
    const wasmResponse = await fetch(this.options.wasmUrl)
    const wasmBytes = await wasmResponse.arrayBuffer()

    // If cross-origin isolated, set up SAB bridge.
    if (this.options.crossOriginIsolated ?? crossOriginIsolated) {
      this.sabBridge = new SABBridge()
    }

    // Create worker from an inline script that will receive the WASM bytes.
    const workerBlob = new Blob(
      [
        `
        // Worker entry point — will be replaced with a real worker script
        // that imports @aspect-build/wasm-host and instantiates the WASM module.
        self.onmessage = function(event) {
          const msg = event.data;
          if (msg.type === 'init') {
            self.postMessage({ type: 'ready' });
          }
        };
        `,
      ],
      { type: 'application/javascript' },
    )
    const workerUrl = URL.createObjectURL(workerBlob)
    this.worker = new Worker(workerUrl)

    // Set up message routing.
    this.worker.onmessage = (event: MessageEvent) => {
      const msg = event.data as WorkerOutMessage
      if (msg.type === 'ready') {
        this.ready = true
      }
      this.emit(msg.type, msg)
    }

    // Send init message with WASM binary.
    const initMsg: WorkerInMessage = {
      type: 'init',
      wasmBytes,
      files,
    }
    this.worker.postMessage(initMsg, [wasmBytes])

    // Wait for ready signal.
    await new Promise<void>((resolve) => {
      this.on('ready', () => resolve())
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
