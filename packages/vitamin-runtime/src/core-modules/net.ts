import { SimpleEmitter } from '../shared/simple-emitter'
import { warnUnsupported } from '../shared/warn-unsupported'

type SocketOptions = {
  host?: string
  port?: number
  timeout?: number
  protocols?: string | string[]
  noDelay?: boolean
  keepAlive?: boolean
  keepAliveInitialDelay?: number
}

type NetProxyBridge = {
  open: (host: string, port: number, tls: boolean) => number
  send: (socketId: number, data: Uint8Array) => void
  close: (socketId: number) => void
  on: (socketId: number, handler: (event: NetProxyEvent) => void) => void
  off: (socketId: number, handler: (event: NetProxyEvent) => void) => void
}

type NetProxyEvent =
  | { type: 'net:connected'; socketId: number }
  | { type: 'net:data'; socketId: number; data: Uint8Array }
  | { type: 'net:closed'; socketId: number }
  | { type: 'net:error'; socketId: number; message: string; code?: string }

class Socket extends SimpleEmitter {
  connecting = true
  destroyed = false
  readable = true
  writable = true
  bytesWritten = 0
  bytesRead = 0
  localAddress?: string
  localPort?: number
  remoteAddress?: string
  remotePort?: number
  remoteFamily: 'IPv4' | 'IPv6' = 'IPv4'
  ws: WebSocket | null = null
  sendQueue: Uint8Array[] = []
  timeoutId: ReturnType<typeof setTimeout> | null = null
  proxy: NetProxyBridge | null = null
  proxyId: number | null = null
  proxyHandler: ((event: NetProxyEvent) => void) | null = null

  connect(url: string, protocols?: string | string[]) {
    if (typeof WebSocket !== 'function') {
      queueMicrotask(() => {
        this.connecting = false
        this.emit('error', new Error('WebSocket is not available in this runtime'))
        this.emit('close')
      })
      return
    }

    const ws = new WebSocket(url, protocols)
    ws.binaryType = 'arraybuffer'
    this.ws = ws

    ws.addEventListener('open', () => {
      this.connecting = false
      for (const chunk of this.sendQueue) ws.send(chunk)
      this.sendQueue = []
      this.emit('connect')
      this.emit('ready')
    })

    ws.addEventListener('message', (event) => {
      const data =
        event.data instanceof ArrayBuffer
          ? new Uint8Array(event.data)
          : new TextEncoder().encode(String(event.data))
      this.bytesRead += data.byteLength
      this.emit('data', data)
    })

    ws.addEventListener('close', () => {
      this.finalizeClose()
    })

    ws.addEventListener('error', () => {
      const err = new Error('WebSocket connection error') as Error & { code?: string }
      err.code = 'ECONNREFUSED'
      this.emit('error', err)
      this.finalizeClose()
    })
  }

  connectViaProxy(host: string, port: number, tls: boolean) {
    const proxy = getNetProxy()
    if (!proxy) {
      this.connecting = false
      this.emit('error', new Error('Net proxy is not available in this runtime'))
      this.emit('close')
      return
    }
    this.proxy = proxy
    const socketId = proxy.open(host, port, tls)
    this.proxyId = socketId
    this.remoteAddress = host
    this.remotePort = port

    const handler = (event: NetProxyEvent) => {
      if (event.socketId !== socketId) return
      if (event.type === 'net:connected') {
        this.connecting = false
        this.emit('connect')
        this.emit('ready')
        return
      }
      if (event.type === 'net:data') {
        this.bytesRead += event.data.byteLength
        this.emit('data', event.data)
        return
      }
      if (event.type === 'net:closed') {
        this.finalizeClose()
        proxy.off(socketId, handler)
        return
      }
      if (event.type === 'net:error') {
        const err = new Error(event.message) as Error & { code?: string }
        if (event.code) err.code = event.code
        this.emit('error', err)
        this.finalizeClose()
      }
    }

    this.proxyHandler = handler
    proxy.on(socketId, handler)
  }

  write(data?: string | Uint8Array) {
    if (this.destroyed) return false
    if (data === undefined) return false
    const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data
    this.bytesWritten += bytes.byteLength
    if (this.proxy && this.proxyId !== null) {
      this.proxy.send(this.proxyId, bytes)
      return true
    }
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.sendQueue.push(bytes)
      return false
    }
    this.ws.send(bytes)
    return true
  }

  end(data?: string | Uint8Array) {
    if (this.destroyed) return this
    if (data !== undefined) this.write(data)
    this.writable = false
    queueMicrotask(() => this.emit('finish'))
    if (this.proxy && this.proxyId !== null) {
      this.proxy.close(this.proxyId)
      return this
    }
    this.ws?.close()
    return this
  }

  destroy(err?: Error) {
    if (this.destroyed) return this
    if (err) this.emit('error', err)
    if (this.proxy && this.proxyId !== null) {
      this.proxy.close(this.proxyId)
    } else {
      this.ws?.close()
    }
    this.finalizeClose()
    return this
  }

  setTimeout(ms: number, callback?: () => void) {
    warnUnsupported('net.timeout', 'net.setTimeout is best-effort in browser runtime')
    if (this.timeoutId) clearTimeout(this.timeoutId)
    this.timeoutId = setTimeout(() => {
      this.emit('timeout')
      callback?.()
    }, ms)
    return this
  }

  setNoDelay() {
    warnUnsupported('net.nodelay', 'net.setNoDelay is not supported in browser runtime')
    return this
  }

  setKeepAlive() {
    warnUnsupported('net.keepalive', 'net.setKeepAlive is not supported in browser runtime')
    return this
  }

  pause() {
    warnUnsupported('net.pause', 'net.pause is not supported in browser runtime')
    return this
  }

  resume() {
    warnUnsupported('net.resume', 'net.resume is not supported in browser runtime')
    return this
  }

  ref() {
    warnUnsupported('net.ref', 'net.ref is not supported in browser runtime')
    return this
  }

  unref() {
    warnUnsupported('net.unref', 'net.unref is not supported in browser runtime')
    return this
  }

  address() {
    return {
      address: this.localAddress ?? '0.0.0.0',
      port: this.localPort ?? 0,
      family: this.remoteFamily,
    }
  }

  finalizeClose() {
    if (this.destroyed) return
    this.destroyed = true
    this.readable = false
    this.writable = false
    if (this.proxy && this.proxyId !== null && this.proxyHandler) {
      this.proxy.off(this.proxyId, this.proxyHandler)
      this.proxyHandler = null
    }
    if (this.timeoutId) {
      clearTimeout(this.timeoutId)
      this.timeoutId = null
    }
    this.emit('close')
  }
}

export function createSocketStub() {
  return new Socket()
}

export function createNetModule() {
  const connect = (
    options?: number | SocketOptions,
    host?: string | (() => void),
    connectListener?: () => void,
  ) => {
    const socket = new Socket()
    const normalized = normalizeOptions(options, host)
    if (connectListener) socket.once('connect', connectListener)
    if (typeof host === 'function') socket.once('connect', host)
    const targetHost = normalized.host ?? 'localhost'
    const targetPort = normalized.port ?? 80
    socket.remoteAddress = targetHost
    socket.remotePort = targetPort
    if (normalized.noDelay) socket.setNoDelay()
    if (normalized.keepAlive) socket.setKeepAlive()
    if (normalized.timeout) socket.setTimeout(normalized.timeout)
      
    const proxy = getNetProxy()
    if (proxy) {
      socket.connectViaProxy(targetHost, targetPort, false)
    } else {
      const url = `ws://${targetHost}:${targetPort}`
      socket.connect(url, normalized.protocols)
    }
    return socket
  }

  const createConnection = connect

  return { connect, createConnection, Socket, createSocket: connect }
}

function normalizeOptions(
  options?: number | SocketOptions,
  host?: string | (() => void),
): SocketOptions {
  if (typeof options === 'number') {
    return { port: options, host: typeof host === 'string' ? host : undefined }
  }
  return options ?? {}
}

function getNetProxy(): NetProxyBridge | null {
  const proxy = (globalThis as { __vitaminNetProxy?: NetProxyBridge }).__vitaminNetProxy
  if (!proxy) return null
  return proxy
}
