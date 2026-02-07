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
  private servePorts = new Map<number, MessagePort>()
  private serveRequests = new Map<number, MessagePort>()
  private nextServeRequestId = 0
  private vfsCounter = 0
  private vfsRequests = new Map<number, { resolve: (snapshot: unknown) => void; reject: (err: Error) => void }>()
  private vfsRestoreRequests = new Map<number, { resolve: () => void; reject: (err: Error) => void }>()

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
      if (msg.type === 'serve:register') {
        void this.registerServePort(msg.port)
        this.emit('serve:register', msg)
        return
      }
      if (msg.type === 'serve:unregister') {
        this.unregisterServePort(msg.port)
        this.emit('serve:unregister', msg)
        return
      }
      if (msg.type === 'serve:response' || msg.type === 'serve:chunk' || msg.type === 'serve:end' || msg.type === 'serve:error') {
        this.forwardServeResponse(msg)
        return
      }
      if (msg.type === 'vfs:dump:result') {
        const pending = this.vfsRequests.get(msg.id)
        if (pending) {
          this.vfsRequests.delete(msg.id)
          pending.resolve(msg.snapshot)
        }
        return
      }
      if (msg.type === 'vfs:restore:result') {
        const pending = this.vfsRestoreRequests.get(msg.id)
        if (pending) {
          this.vfsRestoreRequests.delete(msg.id)
          pending.resolve()
        }
        return
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

  /** Dump the worker VFS as a snapshot. */
  dumpVfs(): Promise<unknown> {
    const id = ++this.vfsCounter
    this.postMessage({ type: 'vfs:dump', id })
    return new Promise((resolve, reject) => {
      this.vfsRequests.set(id, { resolve, reject })
    })
  }

  /** Restore the worker VFS from a snapshot. */
  restoreVfs(snapshot: unknown): Promise<void> {
    const id = ++this.vfsCounter
    this.postMessage({ type: 'vfs:restore', id, snapshot })
    return new Promise((resolve, reject) => {
      this.vfsRestoreRequests.set(id, { resolve, reject })
    })
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
    for (const port of this.servePorts.values()) {
      port.close()
    }
    this.servePorts.clear()
    this.serveRequests.clear()
    this.vfsRequests.clear()
    this.vfsRestoreRequests.clear()
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

  private async registerServePort(port: number): Promise<void> {
    if (this.servePorts.has(port)) return
    if (!('serviceWorker' in navigator)) return

    const registration = await navigator.serviceWorker.ready
    const controller = registration.active ?? registration.controller ?? navigator.serviceWorker.controller
    if (!controller) {
      this.emit('error', { type: 'error', message: 'Service Worker not active for Bun.serve' })
      return
    }

    const channel = new MessageChannel()
    channel.port1.onmessage = (event: MessageEvent) => {
      const msg = event.data as {
        type: 'serve:request'
        method: string
        url: string
        headers: Record<string, string>
        body: Uint8Array | null
        responsePort: MessagePort
      }
      if (msg.type !== 'serve:request') return
      const requestId = ++this.nextServeRequestId
      this.serveRequests.set(requestId, msg.responsePort)
      msg.responsePort.start?.()
      this.postMessage({
        type: 'serve:request',
        requestId,
        method: msg.method,
        url: msg.url,
        headers: msg.headers,
        body: msg.body,
      })
    }
    channel.port1.start()

    controller.postMessage(
      { type: 'register', port, messagePort: channel.port2 },
      [channel.port2],
    )
    this.servePorts.set(port, channel.port1)
  }

  private unregisterServePort(port: number): void {
    const existing = this.servePorts.get(port)
    if (existing) {
      existing.close()
      this.servePorts.delete(port)
    }

    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({ type: 'unregister', port })
    }
  }

  private forwardServeResponse(msg: WorkerOutMessage): void {
    if (msg.type !== 'serve:response' && msg.type !== 'serve:chunk' && msg.type !== 'serve:end' && msg.type !== 'serve:error') {
      return
    }
    const port = this.serveRequests.get(msg.requestId)
    if (!port) return

    if (msg.type === 'serve:response') {
      port.postMessage({ type: 'serve:response', status: msg.status, headers: msg.headers, body: msg.body, stream: msg.stream })
      if (!msg.stream) {
        this.serveRequests.delete(msg.requestId)
        port.close()
      }
      return
    }

    if (msg.type === 'serve:chunk') {
      port.postMessage({ type: 'serve:chunk', chunk: msg.chunk })
      return
    }

    if (msg.type === 'serve:end') {
      port.postMessage({ type: 'serve:end' })
      this.serveRequests.delete(msg.requestId)
      port.close()
      return
    }

    if (msg.type === 'serve:error') {
      port.postMessage({ type: 'serve:error', message: msg.message })
      this.serveRequests.delete(msg.requestId)
      port.close()
    }
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
