import {
  type SocketDescriptor,
  type NetworkProxyOptions,
  AddressFamily,
  SocketType,
  SocketState,
} from './types.js'

/**
 * HTTP proxy that translates raw socket-level send/recv into browser
 * `fetch()` calls.  Outgoing data is buffered and parsed as an HTTP request
 * when a complete request is detected (double CRLF), then sent via fetch().
 * The response is buffered and returned via `recv()`.
 */
export class HttpProxy {
  private sockets = new Map<number, SocketDescriptor>()
  private nextFd = 100
  private allowedHosts: Set<string> | null

  constructor(options: NetworkProxyOptions = {}) {
    this.allowedHosts = options.allowedHosts
      ? new Set(options.allowedHosts)
      : null
  }

  /** Allocate a new socket descriptor. */
  open(family: AddressFamily, type: SocketType): number {
    const fd = this.nextFd++
    const socket: SocketDescriptor = {
      fd,
      family,
      type,
      state: SocketState.Created,
      host: '',
      port: 0,
      sendBuffer: [],
      recvBuffer: [],
      abortController: null,
    }
    this.sockets.set(fd, socket)
    return fd
  }

  /** Set the target address for a socket. */
  connect(fd: number, host: string, port: number): void {
    const socket = this.getSocket(fd)
    if (
      this.allowedHosts !== null &&
      !this.allowedHosts.has(host)
    ) {
      socket.state = SocketState.Error
      throw new Error(
        `Connection to ${host} blocked by allowedHosts policy`,
      )
    }
    socket.host = host
    socket.port = port
    socket.state = SocketState.Connected
    socket.abortController = new AbortController()
  }

  /** Buffer outgoing data. Returns number of bytes buffered. */
  send(fd: number, data: Uint8Array): number {
    const socket = this.getSocket(fd)
    socket.sendBuffer.push(data.slice())
    return data.byteLength
  }

  /**
   * Flush the send buffer as an HTTP request via fetch().
   * Call this after a complete HTTP request has been buffered.
   */
  async flush(fd: number): Promise<void> {
    const socket = this.getSocket(fd)
    if (socket.sendBuffer.length === 0) return

    const raw = concatBuffers(socket.sendBuffer)
    socket.sendBuffer = []

    const { method, path, headers, body } = parseHttpRequest(raw)
    const url = `http://${socket.host}:${socket.port}${path}`

    const response = await fetch(url, {
      method,
      headers,
      body: body.byteLength > 0 ? body.slice().buffer as ArrayBuffer : undefined,
      signal: socket.abortController?.signal,
    })

    const responseBytes = await serializeHttpResponse(response)
    socket.recvBuffer.push(responseBytes)
  }

  /** Read buffered response data. Returns empty array if nothing available. */
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
    // Partial read.
    const slice = chunk.slice(0, maxLen)
    socket.recvBuffer[0] = chunk.slice(maxLen)
    return slice
  }

  /** Close a socket and abort any in-flight requests. */
  close(fd: number): void {
    const socket = this.sockets.get(fd)
    if (socket) {
      socket.abortController?.abort()
      socket.state = SocketState.Closed
      this.sockets.delete(fd)
    }
  }

  private getSocket(fd: number): SocketDescriptor {
    const socket = this.sockets.get(fd)
    if (!socket) throw new Error(`EBADF: unknown socket fd ${fd}`)
    return socket
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function concatBuffers(buffers: Uint8Array[]): Uint8Array {
  const total = buffers.reduce((s, b) => s + b.byteLength, 0)
  const result = new Uint8Array(total)
  let offset = 0
  for (const buf of buffers) {
    result.set(buf, offset)
    offset += buf.byteLength
  }
  return result
}

const decoder = new TextDecoder()
const encoder = new TextEncoder()

/**
 * Minimal HTTP/1.1 request parser.  Extracts method, path, headers, and body
 * from a raw byte buffer.
 */
function parseHttpRequest(raw: Uint8Array): {
  method: string
  path: string
  headers: Record<string, string>
  body: Uint8Array
} {
  const text = decoder.decode(raw)
  const headerEnd = text.indexOf('\r\n\r\n')
  const headerPart = headerEnd >= 0 ? text.slice(0, headerEnd) : text
  const bodyPart =
    headerEnd >= 0 ? raw.slice(encoder.encode(text.slice(0, headerEnd + 4)).byteLength) : new Uint8Array(0)

  const lines = headerPart.split('\r\n')
  const [method, path] = (lines[0] || 'GET / HTTP/1.1').split(' ')

  const headers: Record<string, string> = {}
  for (let i = 1; i < lines.length; i++) {
    const colonIdx = lines[i].indexOf(':')
    if (colonIdx > 0) {
      const key = lines[i].slice(0, colonIdx).trim()
      const value = lines[i].slice(colonIdx + 1).trim()
      headers[key] = value
    }
  }

  return { method, path, headers, body: bodyPart }
}

/**
 * Serialize a browser Response into raw HTTP/1.1 response bytes for the WASM
 * consumer.
 */
async function serializeHttpResponse(
  response: Response,
): Promise<Uint8Array> {
  const statusLine = `HTTP/1.1 ${response.status} ${response.statusText}\r\n`
  const headerLines: string[] = []
  response.headers.forEach((value, key) => {
    headerLines.push(`${key}: ${value}\r\n`)
  })

  const body = new Uint8Array(await response.arrayBuffer())
  headerLines.push(`content-length: ${body.byteLength}\r\n`)

  const headerStr = statusLine + headerLines.join('') + '\r\n'
  const headerBytes = encoder.encode(headerStr)

  const result = new Uint8Array(headerBytes.byteLength + body.byteLength)
  result.set(headerBytes)
  result.set(body, headerBytes.byteLength)
  return result
}
