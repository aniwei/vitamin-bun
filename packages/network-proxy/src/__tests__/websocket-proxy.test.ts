import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { WebSocketProxy } from '../websocket-proxy'

type Listener = (event: { data?: unknown }) => void

class FakeWebSocket {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3
  static instances: FakeWebSocket[] = []

  url: string
  binaryType: BinaryType = 'blob'
  readyState = FakeWebSocket.CONNECTING
  sent: unknown[] = []
  private listeners = new Map<string, Set<Listener>>()

  constructor(url: string) {
    this.url = url
    FakeWebSocket.instances.push(this)
  }

  addEventListener(type: string, listener: Listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set())
    this.listeners.get(type)!.add(listener)
  }

  removeEventListener(type: string, listener: Listener) {
    this.listeners.get(type)?.delete(listener)
  }

  send(data: unknown) {
    this.sent.push(data)
  }

  close() {
    this.readyState = FakeWebSocket.CLOSED
    this.dispatch('close', {})
  }

  triggerOpen() {
    this.readyState = FakeWebSocket.OPEN
    this.dispatch('open', {})
  }

  triggerMessage(data: unknown) {
    this.dispatch('message', { data })
  }

  triggerError() {
    this.readyState = FakeWebSocket.CLOSED
    this.dispatch('error', {})
  }

  private dispatch(type: string, event: { data?: unknown }) {
    const listeners = this.listeners.get(type)
    if (!listeners) return
    for (const listener of Array.from(listeners)) {
      listener(event)
    }
  }
}

describe('WebSocketProxy', () => {
  const originalWebSocket = globalThis.WebSocket

  beforeEach(() => {
    FakeWebSocket.instances = []
    ;(globalThis as { WebSocket?: typeof WebSocket }).WebSocket = FakeWebSocket as unknown as typeof WebSocket
  })

  afterEach(() => {
    if (originalWebSocket) {
      ;(globalThis as { WebSocket?: typeof WebSocket }).WebSocket = originalWebSocket
    } else {
      delete (globalThis as { WebSocket?: typeof WebSocket }).WebSocket
    }
  })

  it('connects and sends data over WebSocket', async () => {
    const proxy = new WebSocketProxy()
    const fd = proxy.open()

    const connectPromise = proxy.connect(fd, 'ws://example.com')
    const socket = FakeWebSocket.instances[0]

    expect(socket.binaryType).toBe('arraybuffer')
    socket.triggerOpen()
    await expect(connectPromise).resolves.toBeUndefined()

    const payload = new Uint8Array([1, 2, 3])
    proxy.send(fd, payload)

    expect(socket.sent).toEqual([payload])
  })

  it('buffers received messages and slices by max length', async () => {
    const proxy = new WebSocketProxy()
    const fd = proxy.open()

    const connectPromise = proxy.connect(fd, 'ws://example.com')
    const socket = FakeWebSocket.instances[0]
    socket.triggerOpen()
    await connectPromise

    socket.triggerMessage(new Uint8Array([10, 20, 30, 40]).buffer)

    expect(Array.from(proxy.recv(fd, 2))).toEqual([10, 20])
    expect(Array.from(proxy.recv(fd, 10))).toEqual([30, 40])
    expect(proxy.recv(fd, 10)).toEqual(new Uint8Array(0))
  })

  it('throws when sending before connect', () => {
    const proxy = new WebSocketProxy()
    const fd = proxy.open()
    expect(() => proxy.send(fd, new Uint8Array([1]))).toThrow('WebSocket is not connected')
  })

  it('throws after socket is closed', async () => {
    const proxy = new WebSocketProxy()
    const fd = proxy.open()
    const connectPromise = proxy.connect(fd, 'ws://example.com')
    const socket = FakeWebSocket.instances[0]
    socket.triggerOpen()
    await connectPromise

    proxy.close(fd)
    expect(() => proxy.send(fd, new Uint8Array([1]))).toThrow('EBADF')
  })
})
