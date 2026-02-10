import { SABBridge } from './sab-bridge'
import type { WorkerInMessage, WorkerOutMessage, RuntimeOptions } from './types'


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
  private netSockets = new Map<number, WebSocket>()
  private netProxyPort: MessagePort | null = null
  private allowedHosts: Set<string> | null

  ready = false

  constructor(private options: RuntimeOptions) {
    this.allowedHosts = options.allowedHosts ? new Set(options.allowedHosts) : null
  }

  async boot(files: Record<string, string> = {}): Promise<void> {
    let wasmBytes: ArrayBuffer | undefined
    if (this.options.wasmUrl) {
      const wasmResponse = await fetch(this.options.wasmUrl)
      wasmBytes = await wasmResponse.arrayBuffer()
    }

    if (this.options.crossOriginIsolated ?? crossOriginIsolated) {
      this.sabBridge = new SABBridge()
    }

    const scriptUrl = this.options.workerUrl
      ? new URL(this.options.workerUrl)
      : new URL('./worker-script.js', import.meta.url)

    this.worker = new Worker(scriptUrl, { type: 'module' })

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
      if (msg.type === 'net:connect' || msg.type === 'net:send' || msg.type === 'net:close') {
        this.handleNetMessage(msg)
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

    const initMsg: WorkerInMessage = {
      type: 'init',
      wasmBytes,
      files,
      env: this.options.env,
      sab: this.sabBridge?.sab,
    }

    const transferables: Transferable[] = wasmBytes ? [wasmBytes] : []
    this.worker.postMessage(initMsg, transferables)

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

    void this.registerNetProxyPort()
  }

  exec(command: string, args: string[]): number {
    const id = ++this.processCounter
    this.postMessage({ type: 'exec', command, args, id })
    return id
  }

  sendStdin(data: Uint8Array): void {
    this.postMessage({ type: 'stdin', data })
  }

  writeFile(path: string, content: string | Uint8Array): void {
    this.postMessage({ type: 'fs:write', path, content })
  }

  mkdir(path: string): void {
    this.postMessage({ type: 'fs:mkdir', path })
  }

  unlink(path: string): void {
    this.postMessage({ type: 'fs:unlink', path })
  }

  rename(from: string, to: string): void {
    this.postMessage({ type: 'fs:rename', from, to })
  }

  kill(id: number): void {
    this.postMessage({ type: 'kill', id })
  }

  dumpVfs(): Promise<unknown> {
    const id = ++this.vfsCounter
    this.postMessage({ type: 'vfs:dump', id })
    return new Promise((resolve, reject) => {
      this.vfsRequests.set(id, { resolve, reject })
    })
  }

  restoreVfs(snapshot: unknown): Promise<void> {
    const id = ++this.vfsCounter
    this.postMessage({ type: 'vfs:restore', id, snapshot })
    return new Promise((resolve, reject) => {
      this.vfsRestoreRequests.set(id, { resolve, reject })
    })
  }

  on(type: string, handler: (data: WorkerOutMessage) => void): void {
    if (!this.messageHandlers.has(type)) {
      this.messageHandlers.set(type, new Set())
    }
    this.messageHandlers.get(type)!.add(handler)
  }

  off(type: string, handler: (data: WorkerOutMessage) => void): void {
    this.messageHandlers.get(type)?.delete(handler)
  }

  destroy(): void {
    this.sabBridge?.stopListening()
    for (const port of this.servePorts.values()) {
      port.close()
    }
    this.servePorts.clear()
    this.serveRequests.clear()
    for (const socket of this.netSockets.values()) {
      socket.close()
    }
    this.netSockets.clear()
    this.netProxyPort?.close()
    this.netProxyPort = null
    this.vfsRequests.clear()
    this.vfsRestoreRequests.clear()
    this.worker?.terminate()
    this.worker = null
    this.ready = false
  }

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

  private handleNetMessage(msg: WorkerOutMessage): void {
    if (msg.type === 'net:connect') {
      if (!this.isHostAllowed(msg.host)) {
        this.postMessage({ type: 'net:error', socketId: msg.socketId, message: `Connection to ${msg.host} blocked by allowedHosts policy`, code: 'EACCES' })
        this.postMessage({ type: 'net:closed', socketId: msg.socketId })
        return
      }
      if (!Number.isFinite(msg.port) || msg.port <= 0) {
        this.postMessage({ type: 'net:error', socketId: msg.socketId, message: 'Invalid port', code: 'EINVAL' })
        this.postMessage({ type: 'net:closed', socketId: msg.socketId })
        return
      }
      const protocol = msg.tls ? 'wss' : 'ws'
      const url = `${protocol}://${msg.host}:${msg.port}`
      const ws = new WebSocket(url)
      ws.binaryType = 'arraybuffer'
      this.netSockets.set(msg.socketId, ws)

      ws.addEventListener('open', () => {
        this.postMessage({ type: 'net:connected', socketId: msg.socketId })
      })

      ws.addEventListener('message', (event) => {
        const data =
          event.data instanceof ArrayBuffer
            ? new Uint8Array(event.data)
            : new TextEncoder().encode(String(event.data))
        this.postMessage({ type: 'net:data', socketId: msg.socketId, data })
      })

      ws.addEventListener('close', () => {
        this.postMessage({ type: 'net:closed', socketId: msg.socketId })
        this.netSockets.delete(msg.socketId)
      })

      ws.addEventListener('error', () => {
        this.postMessage({ type: 'net:error', socketId: msg.socketId, message: 'WebSocket connection error', code: 'ECONNREFUSED' })
      })

      return
    }

    if (msg.type === 'net:send') {
      const ws = this.netSockets.get(msg.socketId)
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        this.postMessage({ type: 'net:error', socketId: msg.socketId, message: 'Socket is not connected', code: 'ENOTCONN' })
        return
      }
      ws.send(msg.data)
      return
    }

    if (msg.type === 'net:close') {
      const ws = this.netSockets.get(msg.socketId)
      ws?.close()
      this.netSockets.delete(msg.socketId)
    }
  }

  private async registerNetProxyPort(): Promise<void> {
    if (this.netProxyPort) return
    if (!('serviceWorker' in navigator)) return

    const registration = await navigator.serviceWorker.ready
    const controller = registration.active ?? registration.controller ?? navigator.serviceWorker.controller
    if (!controller) return

    const channel = new MessageChannel()
    channel.port1.onmessage = (event: MessageEvent) => {
      const msg = event.data as {
        type: 'net:proxy:open'
        host: string
        port: number
        tls: boolean
        responsePort: MessagePort
      }
      if (msg.type !== 'net:proxy:open') return
      this.handleNetProxyOpen(msg.host, msg.port, msg.tls, msg.responsePort)
    }
    channel.port1.start()

    controller.postMessage(
      { type: 'register-net-proxy', messagePort: channel.port2 },
      [channel.port2],
    )

    this.netProxyPort = channel.port1
  }

  private handleNetProxyOpen(host: string, port: number, tls: boolean, portChannel: MessagePort): void {
    if (!this.isHostAllowed(host)) {
      portChannel.postMessage({ type: 'net:proxy:error', message: `Connection to ${host} blocked by allowedHosts policy`, code: 'EACCES' })
      portChannel.close()
      return
    }
    if (!Number.isFinite(port) || port <= 0) {
      portChannel.postMessage({ type: 'net:proxy:error', message: 'Invalid port', code: 'EINVAL' })
      portChannel.close()
      return
    }

    const protocol = tls ? 'wss' : 'ws'
    const url = `${protocol}://${host}:${port}`
    const ws = new WebSocket(url)
    ws.binaryType = 'arraybuffer'

    portChannel.onmessage = (event: MessageEvent) => {
      const msg = event.data as { type: 'net:proxy:send' | 'net:proxy:end' | 'net:proxy:close'; data?: Uint8Array }
      if (msg.type === 'net:proxy:send' && msg.data) {
        if (ws.readyState === WebSocket.OPEN) ws.send(msg.data)
        return
      }
      if (msg.type === 'net:proxy:end' || msg.type === 'net:proxy:close') {
        ws.close()
      }
    }
    portChannel.start()

    ws.addEventListener('open', () => {
      portChannel.postMessage({ type: 'net:proxy:connected' })
    })

    ws.addEventListener('message', (event) => {
      const data =
        event.data instanceof ArrayBuffer
          ? new Uint8Array(event.data)
          : new TextEncoder().encode(String(event.data))
      portChannel.postMessage({ type: 'net:proxy:data', data })
    })

    ws.addEventListener('close', () => {
      portChannel.postMessage({ type: 'net:proxy:close' })
      portChannel.close()
    })

    ws.addEventListener('error', () => {
      portChannel.postMessage({ type: 'net:proxy:error', message: 'WebSocket connection error', code: 'ECONNREFUSED' })
    })
  }

  private isHostAllowed(host: string): boolean {
    if (!this.allowedHosts) return true
    return this.allowedHosts.has(host)
  }
}
