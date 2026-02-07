import type { BunRuntime } from '../bun-runtime'

type HeaderValue = string | string[]
type HeadersLike = Record<string, HeaderValue | undefined>

type RequestOptions = {
  protocol?: string
  hostname?: string
  host?: string
  port?: number | string
  path?: string
  method?: string
  headers?: HeadersLike
  timeout?: number
  maxRedirects?: number
  followRedirects?: boolean
  agent?: Agent | false
  signal?: AbortSignal
}

type ResponseLike = {
  statusCode: number
  headers: Record<string, string>
  text: () => Promise<string>
  json: () => Promise<unknown>
  arrayBuffer: () => Promise<ArrayBuffer>
}

type ResponseCallback = (res: ResponseLike) => void

type RequestListener = (req: IncomingMessage, res: ServerResponse) => void

type ListenCallback = () => void

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

class Agent {
  keepAlive: boolean
  constructor(options?: { keepAlive?: boolean }) {
    this.keepAlive = Boolean(options?.keepAlive)
  }

  destroy(): void {
    // No-op for fetch-backed agent.
  }
}

class ClientResponse extends SimpleEmitter implements ResponseLike {
  statusCode: number
  headers: Record<string, string>
  private response: Response
  private bodyRead = false
  private bodyPromise: Promise<void> | null = null

  constructor(response: Response) {
    super()
    this.response = response
    this.statusCode = response.status
    this.headers = toHeaderRecord(response.headers)
  }

  on(event: string, listener: (...args: unknown[]) => void): this {
    const result = super.on(event, listener)
    if (event === 'data' || event === 'end') {
      this.ensureBodyEmitted()
    }
    return result
  }

  async text() {
    return await this.response.text()
  }

  async json() {
    return await this.response.json()
  }

  async arrayBuffer() {
    return await this.response.arrayBuffer()
  }

  private ensureBodyEmitted() {
    if (this.bodyPromise) return
    this.bodyPromise = this.emitBody()
  }

  private async emitBody() {
    if (this.bodyRead) return
    this.bodyRead = true
    try {
      const buffer = await this.response.arrayBuffer()
      const chunk = new Uint8Array(buffer)
      if (chunk.byteLength > 0) this.emit('data', chunk)
      this.emit('end')
    } catch (err) {
      this.emit('error', err)
    }
  }
}

class ClientRequest extends SimpleEmitter {
  private url: URL
  private options: RequestOptions
  private headers: Record<string, string>
  private chunks: Uint8Array[] = []
  private controller = new AbortController()
  private timeoutId: ReturnType<typeof setTimeout> | null = null
  private ended = false

  constructor(url: URL, options: RequestOptions) {
    super()
    this.url = url
    this.options = options
    this.headers = normalizeHeaders(options.headers)
    if (options.signal) {
      options.signal.addEventListener('abort', () => this.controller.abort())
    }
  }

  setHeader(name: string, value: HeaderValue) {
    this.headers[name.toLowerCase()] = Array.isArray(value) ? value.join(', ') : String(value)
  }

  getHeader(name: string): string | undefined {
    return this.headers[name.toLowerCase()]
  }

  removeHeader(name: string) {
    delete this.headers[name.toLowerCase()]
  }

  setTimeout(ms: number, callback?: () => void) {
    if (this.timeoutId) clearTimeout(this.timeoutId)
    this.timeoutId = setTimeout(() => {
      this.controller.abort()
      this.emit('timeout')
      callback?.()
    }, ms)
    return this
  }

  write(chunk: string | Uint8Array) {
    const bytes = typeof chunk === 'string' ? new TextEncoder().encode(chunk) : chunk
    this.chunks.push(bytes)
  }

  end(chunk?: string | Uint8Array) {
    if (this.ended) return
    this.ended = true
    if (chunk !== undefined) this.write(chunk)
    void this.doFetch()
  }

  abort() {
    this.controller.abort()
  }

  destroy(err?: Error) {
    if (err) this.emit('error', err)
    this.controller.abort()
  }

  private async doFetch() {
    const method = this.options.method ?? (this.chunks.length > 0 ? 'POST' : 'GET')
    const body = this.chunks.length > 0 ? concatChunks(this.chunks) : undefined
    const followRedirects = this.options.followRedirects !== false
    const maxRedirects = this.options.maxRedirects ?? 5

    if (this.options.agent === false) {
      warnUnsupported('http.agent.false', 'http.Agent=false is ignored in browser runtime')
    }

    if (this.options.timeout && !this.timeoutId) {
      this.setTimeout(this.options.timeout)
    }

    try {
      const response = await fetchWithRedirects(
        this.url,
        {
          method,
          headers: this.headers,
          body,
          signal: this.controller.signal,
          redirect: followRedirects ? 'manual' : 'manual',
        },
        followRedirects ? maxRedirects : 0,
      )
      if (this.timeoutId) clearTimeout(this.timeoutId)
      const message = new ClientResponse(response)
      this.emit('response', message)
    } catch (err) {
      if (this.timeoutId) clearTimeout(this.timeoutId)
      this.emit('error', err)
    }
  }
}

class IncomingMessage extends SimpleEmitter {
  url: string
  method: string
  headers: Record<string, string>
  httpVersion = '1.1'
  socket = { destroyed: false }
  private request: Request

  constructor(request: Request) {
    super()
    this.request = request
    this.url = request.url
    this.method = request.method
    this.headers = toHeaderRecord(request.headers)
    queueMicrotask(() => this.emitBody())
  }

  async text() {
    return await this.request.text()
  }

  async json() {
    return await this.request.json()
  }

  async arrayBuffer() {
    return await this.request.arrayBuffer()
  }

  private async emitBody() {
    if (!this.request.body) {
      this.emit('end')
      return
    }
    const buffer = await this.request.arrayBuffer()
    const chunk = new Uint8Array(buffer)
    if (chunk.byteLength > 0) this.emit('data', chunk)
    this.emit('end')
  }
}

class ServerResponse extends SimpleEmitter {
  statusCode = 200
  statusMessage = 'OK'
  private headers: Record<string, string> = {}
  private resolved = false
  private resolve: (response: Response) => void
  private streamController: ReadableStreamDefaultController<Uint8Array> | null = null
  private stream: ReadableStream<Uint8Array> | null = null
  private buffered: Uint8Array[] = []

  constructor(resolve: (response: Response) => void) {
    super()
    this.resolve = resolve
  }

  setHeader(name: string, value: HeaderValue) {
    this.headers[name.toLowerCase()] = Array.isArray(value) ? value.join(', ') : String(value)
  }

  getHeader(name: string): string | undefined {
    return this.headers[name.toLowerCase()]
  }

  getHeaders(): Record<string, string> {
    return { ...this.headers }
  }

  writeHead(statusCode: number, headers?: HeadersLike) {
    this.statusCode = statusCode
    if (headers) {
      const normalized = normalizeHeaders(headers)
      Object.assign(this.headers, normalized)
    }
    return this
  }

  write(chunk: string | Uint8Array) {
    const data = typeof chunk === 'string' ? new TextEncoder().encode(chunk) : chunk
    if (!this.stream) {
      this.stream = new ReadableStream<Uint8Array>({
        start: (controller) => {
          this.streamController = controller
          for (const buffered of this.buffered) controller.enqueue(buffered)
          this.buffered = []
        },
      })
      if (!this.resolved) {
        this.resolved = true
        this.resolve(new Response(this.stream, { status: this.statusCode, headers: this.headers }))
      }
    }

    if (this.streamController) {
      this.streamController.enqueue(data)
    } else {
      this.buffered.push(data)
    }
  }

  end(chunk?: string | Uint8Array) {
    if (chunk !== undefined) this.write(chunk)

    if (this.streamController) {
      this.streamController.close()
      this.emit('finish')
      return
    }

    if (!this.resolved) {
      this.resolved = true
      const body = this.buffered.length > 0 ? concatChunks(this.buffered) : undefined
      this.resolve(new Response(body, { status: this.statusCode, headers: this.headers }))
    }
    this.emit('finish')
  }
}

class Server extends SimpleEmitter {
  private handler?: RequestListener
  private runtime?: BunRuntime
  private handle: { stop: () => void; port: number } | null = null
  private boundPort: number | null = null
  private boundHost: string | undefined

  constructor(runtime?: BunRuntime, handler?: RequestListener) {
    super()
    this.runtime = runtime
    this.handler = handler
  }

  listen(port = 0, hostname?: string | ListenCallback, callback?: ListenCallback) {
    const resolvedHost = typeof hostname === 'string' ? hostname : undefined
    const cb = typeof hostname === 'function' ? hostname : callback
    if (!this.runtime) {
      warnUnsupported('http.server.missing-runtime', 'http.createServer requires runtime Bun.serve support')
      cb?.()
      return this
    }

    const handler = this.handler
    this.handle = this.runtime.Bun.serve({
      port: port || 3000,
      hostname: resolvedHost,
      fetch: async (request) => {
        if (!handler) return new Response('Not Found', { status: 404 })
        const req = new IncomingMessage(request)
        return await new Promise<Response>((resolve) => {
          const res = new ServerResponse(resolve)
          try {
            handler(req, res)
          } catch (err) {
            res.statusCode = 500
            res.end(`Internal Error: ${String(err)}`)
          }
        })
      },
    })

    this.boundPort = this.handle.port
    this.boundHost = resolvedHost
    queueMicrotask(() => {
      this.emit('listening')
      cb?.()
    })
    return this
  }

  close(callback?: () => void) {
    this.handle?.stop()
    this.handle = null
    queueMicrotask(() => {
      this.emit('close')
      callback?.()
    })
    return this
  }

  address() {
    if (this.boundPort === null) return null
    return { port: this.boundPort, address: this.boundHost ?? 'localhost' }
  }
}

export function createHttpModule(runtime?: BunRuntime, defaultProtocol = 'http:') {
  const request = (
    url: string | URL | RequestOptions,
    options?: RequestOptions | ResponseCallback,
    callback?: ResponseCallback,
  ) => {
    const [resolvedUrl, resolvedOptions] = normalizeRequestArgs(url, options)
    const cb = typeof options === 'function' ? options : callback
    const req = new ClientRequest(resolvedUrl, resolvedOptions)
    if (cb) req.once('response', cb)
    return req
  }

  const get = (
    url: string | URL | RequestOptions,
    options?: RequestOptions | ResponseCallback,
    callback?: ResponseCallback,
  ) => {
    const req = request(url as string | URL | RequestOptions, options as RequestOptions | ResponseCallback, callback)
    req.end()
    return req
  }

  const createServer = (handler?: RequestListener) => new Server(runtime, handler)

  return { request, get, createServer, Agent, Server, IncomingMessage, ServerResponse }

  function normalizeRequestArgs(
    input: string | URL | RequestOptions,
    options?: RequestOptions | ResponseCallback,
  ): [URL, RequestOptions] {
    const opts = typeof options === 'function' ? {} : (options ?? {})
    if (typeof input === 'string' || input instanceof URL) {
      return [new URL(String(input)), { ...opts }]
    }
    const merged = { ...input, ...opts }
    const protocol = merged.protocol ?? defaultProtocol
    const host = merged.hostname ?? merged.host ?? 'localhost'
    const port = merged.port ? String(merged.port) : protocol === 'https:' ? '443' : '80'
    const path = merged.path ?? '/'
    return [new URL(`${protocol}//${host}:${port}${path}`), merged]
  }
}

function normalizeHeaders(headers?: HeadersLike): Record<string, string> {
  const result: Record<string, string> = {}
  if (!headers) return result
  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined) continue
    result[key.toLowerCase()] = Array.isArray(value) ? value.join(', ') : String(value)
  }
  return result
}

function toHeaderRecord(headers: Headers): Record<string, string> {
  const result: Record<string, string> = {}
  headers.forEach((value, key) => {
    result[key.toLowerCase()] = value
  })
  return result
}

function concatChunks(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0)
  const merged = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    merged.set(chunk, offset)
    offset += chunk.byteLength
  }
  return merged
}

async function fetchWithRedirects(url: URL, init: RequestInit, maxRedirects: number): Promise<Response> {
  let currentUrl = url
  let currentInit = { ...init }
  for (let i = 0; i <= maxRedirects; i += 1) {
    const response = await fetch(currentUrl.toString(), currentInit)
    if (!isRedirect(response.status) || !response.headers.get('location')) {
      return response
    }
    if (i === maxRedirects) return response
    const location = response.headers.get('location')!
    currentUrl = new URL(location, currentUrl)
    if (response.status === 303) {
      currentInit = { ...currentInit, method: 'GET', body: undefined }
    }
  }
  return await fetch(currentUrl.toString(), currentInit)
}

function isRedirect(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308
}
