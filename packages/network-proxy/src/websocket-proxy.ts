import {
  type SocketDescriptor,
  SocketState,
  AddressFamily,
  SocketType,
} from './types'

export class WebSocketProxy {
  private sockets = new Map<number, SocketDescriptor & { ws: WebSocket | null }>()
  private nextFd = 200

  open(): number {
    const fd = this.nextFd++
    this.sockets.set(fd, {
      fd,
      family: AddressFamily.INET,
      type: SocketType.STREAM,
      state: SocketState.Created,
      host: '',
      port: 0,
      sendBuffer: [],
      recvBuffer: [],
      abortController: null,
      ws: null,
    })
    return fd
  }

  connect(fd: number, url: string): Promise<void> {
    const socket = this.getSocket(fd)
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url)
      ws.binaryType = 'arraybuffer'
      socket.ws = ws
      socket.state = SocketState.Connecting

      ws.addEventListener('open', () => {
        socket.state = SocketState.Connected
        resolve()
      })

      ws.addEventListener('message', (event) => {
        const data =
          event.data instanceof ArrayBuffer
            ? new Uint8Array(event.data)
            : new TextEncoder().encode(String(event.data))
        socket.recvBuffer.push(data)
      })

      ws.addEventListener('close', () => {
        socket.state = SocketState.Closed
      })

      ws.addEventListener('error', () => {
        socket.state = SocketState.Error
        reject(new Error(`WebSocket connection to ${url} failed`))
      })
    })
  }

  /** Send data over the WebSocket. */
  send(fd: number, data: Uint8Array): void {
    const socket = this.getSocket(fd)
    if (!socket.ws || socket.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket is not connected')
    }
    socket.ws.send(data)
  }

  recv(fd: number, maxLen: number): Uint8Array {
    const socket = this.getSocket(fd)
    if (socket.recvBuffer.length === 0) {
      return new Uint8Array(0)
    }
    const chunk = socket.recvBuffer[0]
    if (chunk.byteLength <= maxLen) {
      socket.recvBuffer.shift()
      return chunk
    }
    const slice = chunk.slice(0, maxLen)
    socket.recvBuffer[0] = chunk.slice(maxLen)
    return slice
  }

  close(fd: number): void {
    const socket = this.sockets.get(fd)
    if (socket) {
      socket.ws?.close()
      socket.state = SocketState.Closed
      this.sockets.delete(fd)
    }
  }

  private getSocket(fd: number) {
    const socket = this.sockets.get(fd)
    if (!socket) throw new Error(`EBADF: unknown socket fd ${fd}`)
    return socket
  }
}
