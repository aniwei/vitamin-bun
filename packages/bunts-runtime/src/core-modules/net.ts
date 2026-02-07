type SocketOptions = {
  host?: string
  port?: number
  timeout?: number
  protocols?: string | string[]
}

const warnOnceKeys = new Set<string>()
const warnUnsupported = (key: string, message: string) => {
  if (warnOnceKeys.has(key)) return
  warnOnceKeys.add(key)
  console.warn(message)
}

class SimpleEmitter {
  private listeners = new Map<string, Set<(...args: unknown[]) => void>>()

  on(event: string, listener: (...args: unknown[]) => void): this {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set())
    this.listeners.get(event)!.add(listener)
    return this
  }

  once(event: string, listener: (...args: unknown[]) => void): this {
    const wrapper = (...args: unknown[]) => {
      this.off(event, wrapper)
      listener(...args)
    }
    return this.on(event, wrapper)
  }

  off(event: string, listener: (...args: unknown[]) => void): this {
    this.listeners.get(event)?.delete(listener)
    return this
  }

  emit(event: string, ...args: unknown[]): boolean {
    const set = this.listeners.get(event)
    if (!set || set.size === 0) return false
    for (const fn of Array.from(set)) fn(...args)
    return true
  }
}

class Socket extends SimpleEmitter {
  connecting = true
  destroyed = false
  bytesWritten = 0
  bytesRead = 0
  private ws: WebSocket | null = null
  private sendQueue: Uint8Array[] = []
  private timeoutId: ReturnType<typeof setTimeout> | null = null

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
      this.destroyed = true
      this.emit('close')
    })

    ws.addEventListener('error', () => {
      this.emit('error', new Error('WebSocket connection error'))
    })
  }

  write(data?: string | Uint8Array) {
    if (data === undefined) return false
    const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data
    this.bytesWritten += bytes.byteLength
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.sendQueue.push(bytes)
      return false
    }
    this.ws.send(bytes)
    return true
  }

  end(data?: string | Uint8Array) {
    if (data !== undefined) this.write(data)
    this.ws?.close()
    return this
  }

  destroy(err?: Error) {
    if (err) this.emit('error', err)
    this.ws?.close()
    this.destroyed = true
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
    const url = `ws://${targetHost}:${targetPort}`
    socket.connect(url, normalized.protocols)
    return socket
  }

  const createConnection = connect

  return { connect, createConnection, Socket }
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
